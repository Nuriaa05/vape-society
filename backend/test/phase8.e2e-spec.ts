import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("Phase 8 backups endpoints", () => {
  let app: INestApplication;
  let backupDir: string;
  let db: SeededTestDatabase;

  beforeEach(async () => {
    backupDir = mkdtempSync(join(tmpdir(), "core-backups-e2e-"));
    db = await createSeededTestDatabase();
    process.env.DATABASE_URL = db.url;
    process.env.BACKUP_DIR = backupDir;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    await db.cleanup();
    rmSync(backupDir, { recursive: true, force: true });
    delete process.env.BACKUP_DIR;
  });

  it("enables daily backups by default and persists the user's choice", async () => {
    await request(app.getHttpServer())
      .get("/api/backups/automation")
      .expect(200)
      .expect({ enabled: true });

    await request(app.getHttpServer())
      .patch("/api/backups/automation")
      .send({ enabled: false })
      .expect(200)
      .expect({ enabled: false });

    await request(app.getHttpServer())
      .get("/api/backups/automation")
      .expect(200)
      .expect({ enabled: false });

    await request(app.getHttpServer())
      .post("/api/backups")
      .send({})
      .expect(201);
  });

  it("rejects invalid automatic backup preferences", async () => {
    await request(app.getHttpServer())
      .patch("/api/backups/automation")
      .send({ enabled: "false" })
      .expect(400);
  });

  it("creates a missing daily backup when the runtime starts", async () => {
    await app.close();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          databaseUrl: db.url,
          backupDir,
          backupSchedulerEnabled: true,
        }),
      )
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer())
      .get("/api/backups")
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].status).toBe("Ok");
    expect(existsSync(join(backupDir, response.body[0].filename))).toBe(true);
  });

  it("reports the configured backup directory before the first backup", async () => {
    const location = await request(app.getHttpServer())
      .get("/api/backups/location")
      .expect(200);

    expect(location.body).toEqual({ directory: backupDir });
    await expect(db.prisma.backupLog.count()).resolves.toBe(0);

    const backup = await request(app.getHttpServer())
      .post("/api/backups")
      .send({})
      .expect(201);

    expect(
      existsSync(join(location.body.directory, backup.body.filename)),
    ).toBe(true);
  });

  it("creates and lists local backups without exposing filesystem paths", async () => {
    const backup = await request(app.getHttpServer())
      .post("/api/backups")
      .send({})
      .expect(201);

    expect(backup.body).toMatchObject({
      filename: expect.stringMatching(/^core-backup-\d{4}-\d{2}-\d{2}-\d{6}-[0-9a-f-]{36}\.db$/),
      status: "Ok",
    });
    expect(backup.body).not.toHaveProperty("path");
    expect(existsSync(join(backupDir, backup.body.filename))).toBe(true);

    const list = await request(app.getHttpServer())
      .get("/api/backups")
      .expect(200);

    expect(list.body).toEqual([
      expect.objectContaining({
        id: backup.body.id,
        filename: backup.body.filename,
        status: "Ok",
      }),
    ]);
    expect(list.body[0]).not.toHaveProperty("path");
  });

  it("rejects client-submitted backup paths", async () => {
    await request(app.getHttpServer())
      .post("/api/backups")
      .send({ path: "C:/Users/Gonzalo/Desktop/backup.db" })
      .expect(400);

    await expect(db.prisma.backupLog.count()).resolves.toBe(0);
  });

  it("returns a manual restore plan and does not expose hot restore endpoint", async () => {
    const backup = await request(app.getHttpServer())
      .post("/api/backups")
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/backups/${backup.body.id}/restore-plan`)
      .send({})
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: backup.body.id,
          filename: backup.body.filename,
          automaticRestore: false,
        });
        expect(response.body).not.toHaveProperty("path");
        expect(response.body.steps.length).toBeGreaterThan(0);
      });

    await request(app.getHttpServer())
      .post(`/api/backups/${backup.body.id}/restore`)
      .send({})
      .expect(404);
  });
});
