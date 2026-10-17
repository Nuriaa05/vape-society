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
import { createLegacyBackup } from "./legacy-test-database";
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
    const oldPath = join(backupDir, "legacy.db");
    createLegacyBackup(oldPath);
    const older = readFileSync(oldPath);
    const preview = await upload(older);
    expect(preview.body.counts).toMatchObject({
      priceLists: 1,
      priceListPrices: 0,
    });
    expect(readFileSync(oldPath)).toEqual(older);
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
    const lists = await request(app.getHttpServer())
      .get("/api/price-lists")
      .expect(200);
    expect(lists.body).toEqual([
      expect.objectContaining({ id: "general", tiers: [] }),
    ]);
    const legacy = await request(app.getHttpServer())
      .get("/api/sales/legacy-sale")
      .expect(200);
    expect(legacy.body.pricingSnapshot).toBeNull();
  });

  it("round-trips wholesale lists, customer assignment and immutable sale prices", async () => {
    const server = app.getHttpServer();
    const list = await request(server)
      .post("/api/price-lists")
      .send({
        name: "Distribuidores",
        tiers: [
          {
            minimumQty: 1,
            prices: [
              { itemType: "Product", itemId: "p1", priceAmountCents: 12345 },
            ],
          },
        ],
      })
      .expect(201);
    const customer = await request(server)
      .post("/api/customers")
      .send({
        name: "Cliente de lista",
        priceListId: list.body.id,
      })
      .expect(201);
    const input = {
      operationId: "wholesale-backup-sale",
      customerId: customer.body.id,
      paymentMethodId: "pm2",
      deliveryStatus: "Pendiente",
      items: [{ productId: "p1", qty: 1 }],
    };
    const quote = await request(server)
      .post("/api/sales/quote")
      .send(input)
      .expect(200);
    const sale = await request(server)
      .post("/api/sales")
      .send({
        ...input,
        expectedPricingFingerprint: quote.body.pricing.fingerprint,
      })
      .expect(201);
    const backup = await app.get(BackupsService).createBackup();
    const bytes = readFileSync(join(backupDir, backup.filename));
    await request(server)
      .patch(`/api/price-lists/${list.body.id}`)
      .send({
        name: "Configuración posterior",
        tiers: [],
      })
      .expect(200);
    const preview = await upload(bytes);
    expect(preview.body.counts).toMatchObject({
      priceLists: 2,
      priceListPrices: 1,
    });
    await request(server)
      .post(`/api/backups/import/${preview.body.id}/confirm`)
      .send({ confirmed: true })
      .expect(201);
    const restoredList = await request(server)
      .get(`/api/price-lists/${list.body.id}`)
      .expect(200);
    expect(restoredList.body.name).toBe("Distribuidores");
    expect(restoredList.body.tiers[0].prices[0].priceAmountCents).toBe(12345);
    const restoredCustomer = await db.prisma.customer.findUniqueOrThrow({
      where: { id: customer.body.id },
    });
    expect(restoredCustomer.priceListId).toBe(list.body.id);
    const restoredSale = await request(server)
      .get(`/api/sales/${sale.body.id}`)
      .expect(200);
    expect(restoredSale.body.pricingSnapshot).toEqual(
      sale.body.pricingSnapshot,
    );
    expect(restoredSale.body.totalAmountCents).toBe(12345);
  });

  it("migrates legacy physical stock as unclassified without inventing supplier debts or changing the source", async () => {
    const oldPath = join(backupDir, "legacy-stock.db");
    createLegacyBackup(oldPath);
    const old = new DatabaseSync(oldPath);
    old.exec(`INSERT INTO Category (id,name,updatedAt) VALUES ('old-category','Anterior',CURRENT_TIMESTAMP);
      INSERT INTO Supplier (id,name,phone,email,updatedAt) VALUES ('old-supplier','Anterior','','',CURRENT_TIMESTAMP);
      INSERT INTO Product (id,name,categoryId,supplierId,costAmountCents,priceAmountCents,marginPct,physicalStock,minStock,updatedAt)
      VALUES ('old-product','Stock anterior','old-category','old-supplier',123,250,100,7,0,CURRENT_TIMESTAMP)`);
    old.close();
    const sourceBytes = readFileSync(oldPath);
    const preview = await upload(sourceBytes);
    expect(preview.body.counts).toMatchObject({
      inventoryLots: 1,
      supplierPayables: 0,
      supplierPayments: 0,
    });
    expect(readFileSync(oldPath)).toEqual(sourceBytes);
    expect(
      await db.prisma.product.findUnique({ where: { id: "p1" } }),
    ).not.toBeNull();
    await request(app.getHttpServer())
      .post(`/api/backups/import/${preview.body.id}/confirm`)
      .send({ confirmed: true })
      .expect(201);
    expect(
      await db.prisma.inventoryLot.findFirst({
        where: { productId: "old-product" },
      }),
    ).toMatchObject({
      classification: "SinClasificar",
      remainingQty: 7,
      unitCostAmountCents: 123,
    });
    expect(await db.prisma.supplierPayable.count()).toBe(0);
  });

  it("round-trips financed purchases, FIFO allocations and supplier payments", async () => {
    const server = app.getHttpServer();
    const purchase = await request(server)
      .post("/api/purchases")
      .send({
        operationId: "import-credit",
        supplierId: "s1",
        status: "Registrada",
        paymentCondition: "Credito",
        dueDate: "2026-12-31",
        items: [{ productId: "p1", qty: 2, unitCostAmountCents: 123 }],
      })
      .expect(201);
    await request(server)
      .post(`/api/supplier-payables/${purchase.body.payable.id}/payments`)
      .send({ operationId: "import-payment", date: "2026-01-01", method: "QR" })
      .expect(201);
    const snapshot = await app.get(BackupsService).createBackup();
    const bytes = readFileSync(join(backupDir, snapshot.filename));
    const preview = await upload(bytes);
    expect(preview.body.counts).toMatchObject({
      supplierPayables: 1,
      supplierPayments: 1,
    });
    await request(server)
      .post(`/api/backups/import/${preview.body.id}/confirm`)
      .send({ confirmed: true })
      .expect(201);
    expect(
      await db.prisma.supplierPayable.findUnique({
        where: { id: purchase.body.payable.id },
        include: { payments: true },
      }),
    ).toMatchObject({
      amountCents: 246,
      payments: [{ amountCents: 246, method: "QR" }],
    });
    expect(
      await db.prisma.inventoryLot.findFirst({
        where: { payableId: purchase.body.payable.id },
      }),
    ).toMatchObject({
      classification: "Pagada",
      remainingQty: 2,
      unitCostAmountCents: 123,
    });
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
