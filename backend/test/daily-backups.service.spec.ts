import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import { BackupsService } from "../src/modules/backups/backups.service";
import { DailyBackupsService } from "../src/modules/backups/daily-backups.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("DailyBackupsService", () => {
  let backupDir: string;
  let db: SeededTestDatabase;
  let config: ConfigService;
  let backups: BackupsService;
  let daily: DailyBackupsService;

  beforeEach(async () => {
    backupDir = mkdtempSync(join(tmpdir(), "core-daily-backups-"));
    db = await createSeededTestDatabase();
    config = new ConfigService({ backupDir, backupSchedulerEnabled: true });
    const moduleRef = await Test.createTestingModule({
      providers: [
        BackupsService,
        DailyBackupsService,
        { provide: PrismaService, useValue: db.prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    backups = moduleRef.get(BackupsService);
    daily = moduleRef.get(DailyBackupsService);
  });

  afterEach(async () => {
    await daily.onModuleDestroy();
    jest.restoreAllMocks();
    await db.cleanup();
    rmSync(backupDir, { recursive: true, force: true });
  });

  it("creates the first backup and avoids another copy on restart", async () => {
    const backup = await daily.runIfDue();
    expect(backup?.status).toBe("Ok");
    expect(existsSync(join(backupDir, backup!.filename))).toBe(true);

    const restarted = new DailyBackupsService(
      db.prisma as PrismaService,
      backups,
      config,
    );
    await expect(restarted.runIfDue()).resolves.toBeNull();
    await expect(db.prisma.backupLog.count()).resolves.toBe(1);
  });

  it("counts a recent manual backup toward the daily interval", async () => {
    await backups.createBackup();

    await expect(daily.runIfDue()).resolves.toBeNull();
    await expect(db.prisma.backupLog.count()).resolves.toBe(1);
  });

  it("avoids duplicates when the database timestamp is slightly ahead", async () => {
    const manual = await backups.createBackup();
    const now = new Date();
    await db.prisma.backupLog.update({
      where: { id: manual.id },
      data: { createdAt: new Date(now.getTime() + 1000) },
    });

    await expect(daily.runIfDue(now)).resolves.toBeNull();
    await expect(db.prisma.backupLog.count()).resolves.toBe(1);
  });

  it("creates a new copy at the 24-hour boundary", async () => {
    const manual = await backups.createBackup();
    const now = new Date();
    await db.prisma.backupLog.update({
      where: { id: manual.id },
      data: { createdAt: new Date(now.getTime() - DAY_MS) },
    });

    const automatic = await daily.runIfDue(now);
    expect(automatic?.id).not.toBe(manual.id);
    expect(automatic?.status).toBe("Ok");
    await expect(db.prisma.backupLog.count()).resolves.toBe(2);
  });

  it("ignores failed attempts when deciding whether a backup is due", async () => {
    const manual = await backups.createBackup();
    await db.prisma.backupLog.update({
      where: { id: manual.id },
      data: { createdAt: new Date(Date.now() - DAY_MS - 1000) },
    });
    await db.prisma.backupLog.create({
      data: {
        filename: "failed.db",
        path: join(backupDir, "failed.db"),
        sizeBytes: 0,
        status: "Error",
      },
    });

    expect((await daily.runIfDue())?.status).toBe("Ok");
    await expect(daily.runIfDue()).resolves.toBeNull();
    await expect(db.prisma.backupLog.count({ where: { status: "Ok" } }))
      .resolves.toBe(2);
  });

  it("replaces a recent backup whose file no longer exists", async () => {
    const manual = await backups.createBackup();
    unlinkSync(join(backupDir, manual.filename));

    const automatic = await daily.runIfDue();
    expect(automatic?.status).toBe("Ok");
    expect(existsSync(join(backupDir, automatic!.filename))).toBe(true);
  });

  it("honors the disabled preference and resumes after enabling it", async () => {
    await backups.updateAutomation(false);
    await expect(daily.runIfDue()).resolves.toBeNull();
    await expect(db.prisma.backupLog.count()).resolves.toBe(0);

    await backups.updateAutomation(true);
    expect((await daily.runIfDue())?.status).toBe("Ok");
  });

  it("deduplicates overlapping automatic checks", async () => {
    const [first, second] = await Promise.all([
      daily.runIfDue(),
      daily.runIfDue(),
    ]);

    expect(first?.status).toBe("Ok");
    expect(first?.id).toBe(second?.id);
    await expect(db.prisma.backupLog.count()).resolves.toBe(1);
  });

  it("retries a failed write after five minutes without blocking startup", async () => {
    const blockedPath = join(backupDir, "blocked");
    writeFileSync(blockedPath, "not a directory");
    config.set("backupDir", blockedPath);
    const logger = jest.spyOn(Logger.prototype, "error").mockImplementation();
    const now = Date.now();

    await daily.onApplicationBootstrap();
    expect(logger).toHaveBeenCalledTimes(1);
    await expect(db.prisma.backupLog.count({ where: { status: "Error" } }))
      .resolves.toBe(1);

    config.set("backupDir", backupDir);
    await daily.runScheduledBackup();
    await expect(db.prisma.backupLog.count()).resolves.toBe(1);

    jest.spyOn(Date, "now").mockReturnValue(now + 6 * 60 * 1000);
    await daily.runScheduledBackup();
    await expect(db.prisma.backupLog.count({ where: { status: "Ok" } }))
      .resolves.toBe(1);
  });

  it("checks periodically while running and cancels its timer on shutdown", async () => {
    const interval = jest.spyOn(global, "setInterval");
    const clear = jest.spyOn(global, "clearInterval");
    const check = jest.spyOn(daily, "runIfDue");
    await daily.onApplicationBootstrap();
    const timer = interval.mock.results[0].value;
    const callback = interval.mock.calls[0][0] as () => void;
    const first = await db.prisma.backupLog.findFirstOrThrow();
    await db.prisma.backupLog.update({
      where: { id: first.id },
      data: { createdAt: new Date(Date.now() - DAY_MS - 1000) },
    });

    callback();
    expect(check).toHaveBeenCalledTimes(2);
    await check.mock.results[1].value;
    await expect(db.prisma.backupLog.count()).resolves.toBe(2);

    await daily.onModuleDestroy();
    expect(clear).toHaveBeenCalledWith(timer);
  });

  it("does not start background jobs in test configurations", async () => {
    config.set("backupSchedulerEnabled", false);
    await daily.onApplicationBootstrap();
    await expect(db.prisma.backupLog.count()).resolves.toBe(0);
  });
});
