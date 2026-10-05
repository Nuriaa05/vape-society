import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import { BackupsService } from "../src/modules/backups/backups.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("BackupsService", () => {
  let backupDir: string;
  let db: SeededTestDatabase;
  let service: BackupsService;

  beforeEach(async () => {
    backupDir = mkdtempSync(join(tmpdir(), "core-backups-"));
    db = await createSeededTestDatabase();

    const configService = {
      get: (key: string) => {
        if (key === "backupDir") return backupDir;
        if (key === "databaseUrl") return db.url;
        return undefined;
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BackupsService,
        {
          provide: PrismaService,
          useValue: db.prisma,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = moduleRef.get(BackupsService);
  });

  afterEach(async () => {
    await db.cleanup();
    rmSync(backupDir, { recursive: true, force: true });
  });

  it("creates a SQLite backup file and stores a backup log without exposing local paths", async () => {
    const backup = await service.createBackup();

    expect(backup).toMatchObject({
      filename: expect.stringMatching(/^core-backup-\d{4}-\d{2}-\d{2}-\d{6}\.db$/),
      status: "Ok",
    });
    expect(backup).not.toHaveProperty("path");
    expect(backup.sizeBytes).toBeGreaterThan(0);
    expect(existsSync(join(backupDir, backup.filename))).toBe(true);

    const logs = await db.prisma.backupLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      filename: backup.filename,
      status: "Ok",
    });
    expect(logs[0].path).toBe(join(backupDir, backup.filename));
  });

  it("lists backups from the log without exposing filesystem paths", async () => {
    await db.prisma.backupLog.create({
      data: {
        filename: "core-backup-2026-06-18-120000.db",
        path: join(backupDir, "core-backup-2026-06-18-120000.db"),
        sizeBytes: 100,
        status: "Ok",
      },
    });

    const backups = await service.findAll();

    expect(backups).toEqual([
      expect.objectContaining({
        filename: "core-backup-2026-06-18-120000.db",
        sizeBytes: 100,
        status: "Ok",
      }),
    ]);
    expect(backups[0]).not.toHaveProperty("path");
  });

  it("returns a manual restore plan without restoring or exposing paths", async () => {
    const log = await db.prisma.backupLog.create({
      data: {
        filename: "core-backup-2026-06-18-121500.db",
        path: join(backupDir, "core-backup-2026-06-18-121500.db"),
        sizeBytes: 100,
        status: "Ok",
      },
    });

    const plan = await service.getRestorePlan(log.id);

    expect(plan).toMatchObject({
      id: log.id,
      filename: log.filename,
      automaticRestore: false,
    });
    expect(plan).not.toHaveProperty("path");
    expect(plan.steps.length).toBeGreaterThan(0);
  });
});
