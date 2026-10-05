import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ConfigService } from "@nestjs/config";

import { StartupChecksService } from "../src/startup-checks.service";

const configService = (values: Record<string, string | undefined>) =>
  ({
    get: (key: string) => values[key],
  }) as ConfigService;

describe("StartupChecksService", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lozano-startup-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates the configured backup directory during startup checks", async () => {
    const backupDir = join(tempDir, "backups");
    const service = new StartupChecksService(
      configService({
        backupDir,
        databaseUrl: "file:./core.db",
        host: "127.0.0.1",
      }),
    );

    await service.run();

    expect(existsSync(backupDir)).toBe(true);
  });

  it("rejects non-local host binding", async () => {
    const service = new StartupChecksService(
      configService({
        backupDir: tempDir,
        databaseUrl: "file:./core.db",
        host: "0.0.0.0",
      }),
    );

    await expect(service.run()).rejects.toThrow(
      "HOST debe ser local para esta instalación.",
    );
  });

  it("rejects non-SQLite database URLs", async () => {
    const service = new StartupChecksService(
      configService({
        backupDir: tempDir,
        databaseUrl: "postgres://localhost/db",
        host: "127.0.0.1",
      }),
    );

    await expect(service.run()).rejects.toThrow(
      "DATABASE_URL debe usar SQLite local.",
    );
  });
});
