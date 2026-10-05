import { mkdir } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

@Injectable()
export class StartupChecksService implements OnApplicationBootstrap {
  constructor(private readonly configService: ConfigService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  async run(): Promise<void> {
    const host = this.configService.get<string>("host") ?? "127.0.0.1";
    const databaseUrl =
      this.configService.get<string>("databaseUrl") ?? "file:./core.db";
    const backupDir = this.configService.get<string>("backupDir") ?? "backups";

    this.assertLocalHost(host);
    this.assertSqliteDatabaseUrl(databaseUrl);
    await this.ensureBackupDir(backupDir);
  }

  private assertLocalHost(host: string): void {
    if (!LOCAL_HOSTS.has(host)) {
      throw new Error("HOST debe ser local para esta instalación.");
    }
  }

  private assertSqliteDatabaseUrl(databaseUrl: string): void {
    if (!databaseUrl.startsWith("file:")) {
      throw new Error("DATABASE_URL debe usar SQLite local.");
    }
  }

  private async ensureBackupDir(backupDir: string): Promise<void> {
    const resolvedDir = isAbsolute(backupDir)
      ? backupDir
      : resolve(process.cwd(), backupDir);

    await mkdir(resolvedDir, { recursive: true });
  }
}
