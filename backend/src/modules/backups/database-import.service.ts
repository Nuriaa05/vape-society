import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleDestroy,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { BackupsService, type BackupResponse } from "./backups.service";
import { DailyBackupsService } from "./daily-backups.service";
import {
  checkImportFile,
  getImportProjectPaths,
  replaceImportData,
  validateImportData,
  type ImportCounts,
} from "./sqlite-import";

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const STAGE_TTL_MS = 15 * 60 * 1000;
const execFileAsync = promisify(execFile);

export type ImportPreview = { id: string; counts: ImportCounts };
export type ImportResult = { imported: true; safetyBackup: BackupResponse };
type StagedImport = ImportPreview & {
  directory: string;
  path: string;
  timer: ReturnType<typeof setTimeout>;
};

@Injectable()
export class DatabaseImportService implements OnModuleDestroy {
  private readonly staged = new Map<string, StagedImport>();
  private readonly idleWaiters = new Set<() => void>();
  private activeRequests = 0;
  private importing = false;
  private validating = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly backups: BackupsService,
    private readonly dailyBackups: DailyBackupsService,
  ) {}

  get isImporting(): boolean {
    return this.importing;
  }

  trackRequest(): () => void {
    this.activeRequests++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeRequests--;
      if (this.activeRequests === 0)
        for (const resolve of this.idleWaiters) resolve();
    };
  }

  async validate(buffer: Buffer): Promise<ImportPreview> {
    if (buffer.length > MAX_IMPORT_BYTES)
      throw new PayloadTooLargeException(
        "El respaldo no puede superar los 50 MB.",
      );
    if (buffer.subarray(0, 16).toString("ascii") !== "SQLite format 3\0") {
      throw new BadRequestException(
        "Seleccioná un respaldo SQLite válido (.db, .sqlite o .sqlite3).",
      );
    }
    if (this.validating || this.staged.size >= 3) {
      throw new ServiceUnavailableException(
        "Ya hay una importación pendiente. Cancelala o intentá nuevamente en unos minutos.",
      );
    }
    this.validating = true;
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), "retail-core-import-"));
      const path = join(directory, "incoming.db");
      await writeFile(path, buffer);
      if (checkImportFile(path)) {
        const { backendRoot, schemaPath } = getImportProjectPaths();
        await execFileAsync(
          process.execPath,
          [
            require.resolve("prisma/build/index.js"),
            "migrate",
            "deploy",
            "--schema",
            schemaPath,
          ],
          {
            cwd: backendRoot,
            env: {
              ...process.env,
              DATABASE_URL: `file:${path.replaceAll("\\", "/")}`,
            },
            timeout: 30_000,
            maxBuffer: 1024 * 1024,
            windowsHide: true,
          },
        );
      }
      const counts = validateImportData(path, await this.getCurrentPath());
      const id = randomUUID();
      const timer = setTimeout(() => {
        void this.discard(id).catch(() => undefined);
      }, STAGE_TTL_MS);
      timer.unref();
      this.staged.set(id, { id, counts, directory, path, timer });
      return { id, counts };
    } catch (error) {
      if (directory) await this.removeStageDirectory(directory);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        "No se pudo validar el respaldo. Revisá que sea una copia completa de este sistema.",
        { cause: error },
      );
    } finally {
      this.validating = false;
    }
  }

  async confirm(id: string): Promise<ImportResult> {
    const stage = this.staged.get(id);
    if (!stage)
      throw new NotFoundException(
        "La validación venció. Seleccioná el archivo nuevamente.",
      );
    if (this.importing || this.validating)
      throw new ServiceUnavailableException(
        "Ya hay una importación en curso. Esperá a que termine.",
      );
    this.importing = true;
    clearTimeout(stage.timer);
    try {
      await this.waitForIdle();
      await this.dailyBackups.pause();
      const safetyBackup = await this.backups.createBackup();
      replaceImportData(await this.getCurrentPath(), stage.path);
      await this.discard(id).catch(() => undefined);
      return { imported: true, safetyBackup };
    } catch (error) {
      stage.timer = setTimeout(() => {
        void this.discard(id).catch(() => undefined);
      }, STAGE_TTL_MS);
      stage.timer.unref();
      if (error instanceof ServiceUnavailableException) throw error;
      throw new InternalServerErrorException(
        "No se pudo importar el respaldo. Se conservaron los datos actuales.",
        { cause: error },
      );
    } finally {
      this.dailyBackups.resume();
      this.importing = false;
    }
  }

  async discard(id: string): Promise<void> {
    const stage = this.staged.get(id);
    if (!stage) return;
    clearTimeout(stage.timer);
    this.staged.delete(id);
    await this.removeStageDirectory(stage.directory);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.staged.keys()].map((id) => this.discard(id)));
  }

  private async getCurrentPath(): Promise<string> {
    const databases = await this.prisma.$queryRawUnsafe<
      Array<{ name: string; file: string }>
    >("PRAGMA database_list");
    const current = databases.find((database) => database.name === "main");
    if (!current?.file)
      throw new Error("No se encontró la base local del sistema.");
    return current.file;
  }

  private async removeStageDirectory(directory: string): Promise<void> {
    const target = resolve(directory);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith("retail-core-import-")
    ) {
      throw new Error("La carpeta de importación no es temporal.");
    }
    await rm(target, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }

  private async waitForIdle(): Promise<void> {
    if (this.activeRequests === 0) return;
    await new Promise<void>((resolve, reject) => {
      const finished = () => {
        clearTimeout(timer);
        this.idleWaiters.delete(finished);
        resolve();
      };
      const timer = setTimeout(() => {
        this.idleWaiters.delete(finished);
        reject(
          new ServiceUnavailableException(
            "Hay operaciones pendientes. Esperá a que terminen e intentá importar nuevamente.",
          ),
        );
      }, 10_000);
      this.idleWaiters.add(finished);
    });
  }
}
