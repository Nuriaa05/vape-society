import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { get } from "node:http";
import type { AddressInfo } from "node:net";

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { BackupsService } from "../src/modules/backups/backups.service";
import { DatabaseImportService } from "../src/modules/backups/database-import.service";
import { ProductsService } from "../src/modules/products/products.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("Database import", () => {
  let app: INestApplication;
  let db: SeededTestDatabase;
  let backupDir: string;
  let source: Buffer;
  let sourceName: string;

  beforeEach(async () => {
    backupDir = mkdtempSync(join(tmpdir(), "core-import-test-"));
    db = await createSeededTestDatabase();
    sourceName = (
      await db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } })
    ).name;
    source = readFileSync(db.url.slice("file:".length));
    await db.prisma.product.update({
      where: { id: "p1" },
      data: { name: "Datos actuales" },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          databaseUrl: db.url,
          backupDir,
          backupSchedulerEnabled: false,
        }),
      )
      .compile();
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
    await db?.cleanup();
    rmSync(backupDir, { recursive: true, force: true });
  });

  it("validates a backup and returns a preview without replacing current data", async () => {
    const preview = await request(app.getHttpServer())
      .post("/api/backups/import/validate")
      .set("Content-Type", "application/vnd.sqlite3")
      .send(source)
      .expect(201);

    expect(preview.body).toMatchObject({
      id: expect.any(String),
      counts: { products: expect.any(Number), sales: expect.any(Number) },
    });
    expect(preview.body).not.toHaveProperty("path");
    expect(
      (await db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } })).name,
    ).toBe("Datos actuales");
    await expect(db.prisma.backupLog.count()).resolves.toBe(0);
  });

  it("rejects a renamed CSV without modifying the current database", async () => {
    await request(app.getHttpServer())
      .post("/api/backups/import/validate")
      .set("Content-Type", "application/vnd.sqlite3")
      .send(Buffer.from("nombre;cantidad\nProducto;10", "utf8"))
      .expect(400);

    expect(
      (await db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } })).name,
    ).toBe("Datos actuales");
  });

  it("requires an explicit confirmation before replacing data", async () => {
    const preview = await request(app.getHttpServer())
      .post("/api/backups/import/validate")
      .set("Content-Type", "application/vnd.sqlite3")
      .send(source)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/backups/import/${preview.body.id}/confirm`)
      .send({ confirmed: false })
      .expect(400);
    await expect(db.prisma.backupLog.count()).resolves.toBe(0);
  });

  it("imports only after confirmation and preserves a usable copy of the previous data", async () => {
    const preview = await upload(source);
    const result = await request(app.getHttpServer())
      .post(`/api/backups/import/${preview.body.id}/confirm`)
      .send({ confirmed: true })
      .expect(201);

    expect(result.body.imported).toBe(true);
    expect(
      (await db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } })).name,
    ).toBe(sourceName);
    const safetyPath = join(backupDir, result.body.safetyBackup.filename);
    expect(existsSync(safetyPath)).toBe(true);
    const safety = new DatabaseSync(safetyPath, { readOnly: true });
    try {
      expect(
        safety.prepare("SELECT name FROM Product WHERE id = 'p1'").get()!.name,
      ).toBe("Datos actuales");
    } finally {
      safety.close();
    }
    await expect(db.prisma.backupLog.count()).resolves.toBe(1);
    await request(app.getHttpServer()).get("/health/ready").expect(200);
    await request(app.getHttpServer())
      .post(`/api/backups/import/${preview.body.id}/confirm`)
      .send({ confirmed: true })
      .expect(404);
  });

  it("cancels a validated upload without changing current data", async () => {
    const preview = await upload(source);
    await request(app.getHttpServer())
      .delete(`/api/backups/import/${preview.body.id}`)
      .expect(204);
    await request(app.getHttpServer())
      .post(`/api/backups/import/${preview.body.id}/confirm`)
      .send({ confirmed: true })
      .expect(404);
    await expect(db.prisma.backupLog.count()).resolves.toBe(0);
  });

  it("upgrades an older backup in its temporary copy before importing", async () => {
    const older = modifySource((sqlite) => {
      sqlite.exec('ALTER TABLE "AppSettings" DROP COLUMN "dailyBackupEnabled"');
      sqlite.exec(
        "DELETE FROM _prisma_migrations WHERE migration_name = '20261006000000_daily_backups'",
      );
    });
    const preview = await upload(older);
    await request(app.getHttpServer())
      .post(`/api/backups/import/${preview.body.id}/confirm`)
      .send({ confirmed: true })
      .expect(201);
    expect(
      (
        await db.prisma.appSettings.findUniqueOrThrow({
          where: { id: "default" },
        })
      ).dailyBackupEnabled,
    ).toBe(true);
  });

  it("rejects a backup with invalid product references", async () => {
    const invalid = modifySource((sqlite) => {
      sqlite.exec("PRAGMA foreign_keys = OFF");
      sqlite.exec(
        "UPDATE Product SET categoryId = 'missing-category' WHERE id = 'p1'",
      );
    });
    await request(app.getHttpServer())
      .post("/api/backups/import/validate")
      .set("Content-Type", "application/vnd.sqlite3")
      .send(invalid)
      .expect(400);
    await expect(db.prisma.backupLog.count()).resolves.toBe(0);
  });

  it("rejects a database from another system", async () => {
    const foreignPath = join(backupDir, "foreign.db");
    const foreign = new DatabaseSync(foreignPath);
    foreign.exec("CREATE TABLE OtherData (id TEXT PRIMARY KEY)");
    foreign.close();
    await request(app.getHttpServer())
      .post("/api/backups/import/validate")
      .set("Content-Type", "application/vnd.sqlite3")
      .send(readFileSync(foreignPath))
      .expect(400);
  });

  it("rejects missing optional columns and invalid numeric values", async () => {
    for (const modify of [
      (sqlite: DatabaseSync) =>
        sqlite.exec("ALTER TABLE Sale DROP COLUMN customerName"),
      (sqlite: DatabaseSync) =>
        sqlite.exec(
          "UPDATE Product SET physicalStock = 'invalid' WHERE id = 'p1'",
        ),
    ]) {
      await request(app.getHttpServer())
        .post("/api/backups/import/validate")
        .set("Content-Type", "application/vnd.sqlite3")
        .send(modifySource(modify))
        .expect(400);
    }
  });

  it("keeps current data when the safety backup cannot be written", async () => {
    const preview = await upload(source);
    const blockedPath = join(backupDir, "blocked");
    writeFileSync(blockedPath, "not a directory");
    app.get(ConfigService).set("backupDir", blockedPath);
    await request(app.getHttpServer())
      .post(`/api/backups/import/${preview.body.id}/confirm`)
      .send({ confirmed: true })
      .expect(500);
    expect(
      (await db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } })).name,
    ).toBe("Datos actuales");
    await request(app.getHttpServer()).get("/api/products").expect(200);
  });

  it("rolls back every table if writing the imported data fails", async () => {
    const preview = await upload(source);
    const current = new DatabaseSync(db.url.slice("file:".length));
    current.exec(
      "CREATE TRIGGER block_import BEFORE INSERT ON Product BEGIN SELECT RAISE(ABORT, 'blocked'); END",
    );
    current.close();
    await request(app.getHttpServer())
      .post(`/api/backups/import/${preview.body.id}/confirm`)
      .send({ confirmed: true })
      .expect(500);
    expect(
      (await db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } })).name,
    ).toBe("Datos actuales");
    await request(app.getHttpServer()).get("/health/ready").expect(200);
    await expect(
      db.prisma.backupLog.count({ where: { status: "Ok" } }),
    ).resolves.toBe(1);
  });

  it("waits for an active operation even when its client disconnects", async () => {
    await app.listen(0, "127.0.0.1");
    const preview = await upload(source);
    const products = app.get(ProductsService);
    const rows = await products.findAll();
    let started!: () => void;
    let finish!: () => void;
    const operationStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const operationFinished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    jest.spyOn(products, "findAll").mockImplementationOnce(async () => {
      started();
      await operationFinished;
      return rows;
    });
    const server = app.getHttpServer();
    const disconnected = new Promise<void>((resolve) => {
      server.once("connection", (socket: import("node:net").Socket) =>
        socket.once("close", resolve),
      );
    });
    const port = (server.address() as AddressInfo).port;
    const client = get(`http://127.0.0.1:${port}/api/products`);
    client.on("error", () => undefined);
    await operationStarted;
    client.destroy();
    await disconnected;
    const createBackup = jest.spyOn(app.get(BackupsService), "createBackup");
    const importing = app.get(DatabaseImportService).confirm(preview.body.id);
    try {
      await request(server).get("/health/ready").expect(503);
      expect(createBackup).not.toHaveBeenCalled();
    } finally {
      finish();
      await importing;
    }
    await request(server).get("/health/ready").expect(200);
  });

  function upload(bytes: Buffer) {
    return request(app.getHttpServer())
      .post("/api/backups/import/validate")
      .set("Content-Type", "application/vnd.sqlite3")
      .send(bytes)
      .expect(201);
  }

  function modifySource(modify: (sqlite: DatabaseSync) => void): Buffer {
    const candidatePath = join(backupDir, "candidate.db");
    writeFileSync(candidatePath, source);
    const candidate = new DatabaseSync(candidatePath);
    try {
      modify(candidate);
    } finally {
      candidate.close();
    }
    return readFileSync(candidatePath);
  }
});
