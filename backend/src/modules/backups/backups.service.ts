import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";

import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BackupLog } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";

export type BackupResponse = {
  id: string;
  filename: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
};

export type RestorePlanResponse = {
  id: string;
  filename: string;
  automaticRestore: false;
  steps: string[];
};

@Injectable()
export class BackupsService {
  private backupInProgress?: Promise<BackupResponse>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  createBackup(): Promise<BackupResponse> {
    if (!this.backupInProgress) {
      this.backupInProgress = this.writeBackup().finally(() => {
        this.backupInProgress = undefined;
      });
    }
    return this.backupInProgress;
  }

  private async writeBackup(): Promise<BackupResponse> {
    const backupDir = this.getBackupDir();

    const filename = formatBackupFilename(new Date());
    const destinationPath = join(backupDir, filename);

    try {
      await mkdir(backupDir, { recursive: true });
      await this.prisma.$executeRawUnsafe(
        `VACUUM INTO '${toSqlitePathLiteral(destinationPath)}'`,
      );

      const backupFile = await stat(destinationPath);
      const log = await this.prisma.backupLog.create({
        data: {
          filename,
          path: destinationPath,
          sizeBytes: backupFile.size,
          status: "Ok",
        },
      });

      return this.serializeBackup(log);
    } catch (error) {
      await this.recordFailedBackup(filename, destinationPath);
      throw new InternalServerErrorException(
        "No se pudo crear el backup local.",
        { cause: error },
      );
    }
  }

  async findAll(): Promise<BackupResponse[]> {
    const backups = await this.prisma.backupLog.findMany({
      orderBy: { createdAt: "desc" },
    });

    return backups.map((backup) => this.serializeBackup(backup));
  }

  getLocation(): { directory: string } {
    return { directory: this.getBackupDir() };
  }

  async getAutomation(): Promise<{ enabled: boolean }> {
    const settings = await this.prisma.appSettings.findUnique({
      where: { id: "default" },
      select: { dailyBackupEnabled: true },
    });
    if (!settings) {
      throw new NotFoundException("La configuración inicial no está cargada.");
    }
    return { enabled: settings.dailyBackupEnabled };
  }

  async updateAutomation(enabled: boolean): Promise<{ enabled: boolean }> {
    await this.prisma.appSettings.update({
      where: { id: "default" },
      data: { dailyBackupEnabled: enabled },
    });
    return { enabled };
  }

  async getRestorePlan(id: string): Promise<RestorePlanResponse> {
    const backup = await this.prisma.backupLog.findUnique({ where: { id } });

    if (!backup) {
      throw new NotFoundException("Backup no encontrado.");
    }

    return {
      id: backup.id,
      filename: backup.filename,
      automaticRestore: false,
      steps: [
        "Cerrar el sistema antes de restaurar.",
        "Ubicar el archivo de backup por su nombre dentro de la carpeta local de backups configurada.",
        "Reemplazar manualmente la base SQLite actual por una copia del backup elegido.",
        "Abrir el sistema y verificar productos, stock, ventas y compras.",
      ],
    };
  }

  private async recordFailedBackup(
    filename: string,
    path: string,
  ): Promise<void> {
    await this.prisma.backupLog.create({
      data: {
        filename,
        path,
        sizeBytes: 0,
        status: "Error",
      },
    });
  }

  private getBackupDir(): string {
    const configuredDir =
      this.configService.get<string>("backupDir") ?? "backups";
    const resolvedDir = isAbsolute(configuredDir)
      ? configuredDir
      : resolve(process.cwd(), configuredDir);

    return resolvedDir;
  }

  private serializeBackup(backup: BackupLog): BackupResponse {
    return {
      id: backup.id,
      filename: basename(backup.filename),
      sizeBytes: backup.sizeBytes,
      status: backup.status,
      createdAt: backup.createdAt.toISOString(),
    };
  }
}

function formatBackupFilename(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `core-backup-${year}-${month}-${day}-${hours}${minutes}${seconds}-${randomUUID()}.db`;
}

function toSqlitePathLiteral(path: string): string {
  return path.replace(/\\/g, "/").replace(/'/g, "''");
}
