import { stat } from "node:fs/promises";

import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaService } from "../../prisma/prisma.service";
import { BackupsService, type BackupResponse } from "./backups.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
const RETRY_DELAY_MS = 5 * 60 * 1000;

@Injectable()
export class DailyBackupsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(DailyBackupsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private activeRun?: Promise<BackupResponse | null>;
  private retryAfter = 0;
  private paused = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly backupsService: BackupsService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.configService.get<boolean>("backupSchedulerEnabled")) return;

    this.timer = setInterval(() => {
      void this.runScheduledBackup();
    }, CHECK_INTERVAL_MS);
    this.timer.unref();
    await this.runScheduledBackup();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.activeRun?.catch(() => undefined);
  }

  async runScheduledBackup(): Promise<void> {
    if (Date.now() < this.retryAfter) return;

    try {
      await this.runIfDue();
      this.retryAfter = 0;
    } catch (error) {
      this.retryAfter = Date.now() + RETRY_DELAY_MS;
      this.logger.error(
        "No se pudo crear el backup automático. Se reintentará en 5 minutos.",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  runIfDue(now = new Date()): Promise<BackupResponse | null> {
    if (this.paused) return Promise.resolve(null);
    if (!this.activeRun) {
      this.activeRun = this.createIfDue(now).finally(() => {
        this.activeRun = undefined;
      });
    }
    return this.activeRun;
  }

  async pause(): Promise<void> {
    this.paused = true;
    await this.activeRun?.catch(() => undefined);
  }

  resume(): void {
    this.paused = false;
  }

  private async createIfDue(now: Date): Promise<BackupResponse | null> {
    const { enabled } = await this.backupsService.getAutomation();
    if (!enabled) return null;

    const latest = await this.prisma.backupLog.findFirst({
      where: { status: "Ok" },
      orderBy: { createdAt: "desc" },
    });

    if (latest && now.getTime() - latest.createdAt.getTime() < DAY_MS) {
      const file = await stat(latest.path).catch(() => null);
      if (file?.isFile() && file.size > 0) return null;
    }

    return this.backupsService.createBackup();
  }
}
