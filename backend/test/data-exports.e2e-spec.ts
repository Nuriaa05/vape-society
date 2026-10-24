import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { BackupsService } from "../src/modules/backups/backups.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

type Rows = Array<Array<string | number | boolean | null>>;
const cell = (rows: Rows, column: string, index = 1) =>
  rows[index][rows[0].indexOf(column)];

function importedTables(path: string) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return Object.fromEntries(
      Prisma.dmmf.datamodel.models
        .filter((model) => model.name !== "BackupLog")
        .map((model) => {
          const name = (model.dbName ?? model.name).replaceAll('"', '""');
          const records = database.prepare(`SELECT * FROM "${name}"`).all();
          return [
            name,
            records.sort((a, b) =>
              JSON.stringify(a).localeCompare(JSON.stringify(b)),
            ),
          ];
        }),
    );
  } finally {
    database.close();
  }
}

describe("complete financial exports and backup round trip", () => {
  let app: INestApplication;
  let db: SeededTestDatabase;
  let directory: string;
  let productId: string;
  let saleId: string;
  let profitProductId: string;
  let profitSaleId: string;
  let pendingProfitSaleId: string;
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "vape-export-import-"));
    db = await createSeededTestDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          databaseUrl: db.url,
          backupDir: directory,
          backupSchedulerEnabled: false,
        }),
      )
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    await collectionFixtures();
    await purchaseAndCardFixtures();
    await profitFixtures();
  });
  afterAll(async () => {
    await app?.close();
    await db?.cleanup();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it("exports every supported ledger with headers and refuses unknown sections", async () => {
    for (const section of [
      "customer-plans",
      "collections",
      "collection-allocations",
      "card-accreditations",
      "refunds",
      "refund-cancellations",
      "inventory-lots",
      "inventory-allocations",
      "sale-profits",
    ]) {
      const response = await request(app.getHttpServer())
        .get(`/api/data-exports/${section}`)
        .expect(200);
      expect(response.body[0].length).toBeGreaterThan(2);
      expect(response.body[0][0]).toMatch(/^ID /);
    }
    await request(app.getHttpServer())
      .get("/api/data-exports/financial-operations")
      .expect(404);
  });

  async function profitFixtures() {
    const server = app.getHttpServer();
    const product = await request(server)
      .post("/api/products")
      .send({
        name: "Costo histórico para exportar ganancias",
        categoryId: "c0",
        supplierId: "s1",
        costAmountCents: 10001,
        priceAmountCents: 15001,
        marginPct: 50,
        physicalStock: 0,
        minStock: 0,
      })
      .expect(201);
    profitProductId = product.body.id;
    await request(server)
      .post("/api/purchases")
      .send({
        operationId: "export-profit-stock",
        supplierId: "s1",
        status: "Registrada",
        paymentCondition: "Credito",
        dueDate: "2027-12-31",
        items: [
          { productId: profitProductId, qty: 4, unitCostAmountCents: 10001 },
        ],
      })
      .expect(201);
    for (const deliveryStatus of ["Entregado", "Pendiente"]) {
      const sale = await request(server)
        .post("/api/sales")
        .send({
          operationId: `export-profit-${deliveryStatus}`,
          paymentMethodId: "pm2",
          deliveryStatus,
          items: [{ productId: profitProductId, qty: 1 }],
        })
        .expect(201);
      if (deliveryStatus === "Entregado") profitSaleId = sale.body.id;
      else pendingProfitSaleId = sale.body.id;
    }
    await db.prisma.sale.update({
      where: { id: profitSaleId },
      data: { date: new Date("2024-02-29T15:00:00Z") },
    });
    await db.prisma.stockMovement.updateMany({
      where: { sourceType: "Sale", sourceId: profitSaleId, type: "Venta" },
      data: { createdAt: new Date("2026-10-21T02:30:00Z") },
    });
    await db.prisma.product.update({
      where: { id: profitProductId },
      data: { costAmountCents: 99999 },
    });
  }

  it("exports all delivered profits at original costs and delivery dates", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/data-exports/sale-profits")
      .expect(200);
    const rowIndex = response.body.findIndex(
      (row: Rows[number]) => row[0] === profitSaleId,
    );
    expect(rowIndex).toBeGreaterThan(0);
    expect(cell(response.body, "Costo ARS", rowIndex)).toBe(100.01);
    const sale = await db.prisma.sale.findUniqueOrThrow({
      where: { id: profitSaleId },
    });
    expect(cell(response.body, "Venta ARS", rowIndex)).toBe(
      sale.totalAmountCents / 100,
    );
    expect(cell(response.body, "Ganancia ARS", rowIndex)).toBe(
      (sale.totalAmountCents - 10001) / 100,
    );
    expect(cell(response.body, "Historial de costo completo", rowIndex)).toBe(
      true,
    );
    expect(String(cell(response.body, "Fecha de venta", rowIndex))).toContain(
      "29/02/2024",
    );
    expect(String(cell(response.body, "Fecha de entrega", rowIndex))).toContain(
      "20/10/2026",
    );
    expect(
      response.body
        .slice(1)
        .some(
          (row: Rows[number]) =>
            row[0] === saleId || row[0] === pendingProfitSaleId,
        ),
    ).toBe(false);
  });

  async function collectionFixtures() {
    await db.prisma.customer.create({
      data: { id: "export-customer", name: "Nombre actual", active: false },
    });
    await db.prisma.receivablePlan.create({
      data: {
        id: "export-plan",
        customerId: "export-customer",
        title: "Saldo anterior",
        totalAmountCents: 10100,
        installments: {
          create: {
            id: "export-installment",
            number: 1,
            dueDate: "2026-01-31",
            amountCents: 10100,
          },
        },
      },
    });
    await db.prisma.collection.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        id: `export-payment-${String(index).padStart(3, "0")}`,
        customerId: "export-customer",
        customerName: "Nombre original",
        date: "2026-01-31",
        paymentMethodId: "pm2",
        paymentMethodName: "Medio original",
        amountCents: 100,
        createdAt: new Date(
          `2026-02-01T12:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}Z`,
        ),
        reversedAt: index === 0 ? new Date("2026-02-02T12:00:00Z") : null,
        reversalReason: index === 0 ? "Error de carga" : null,
      })),
    });
    await db.prisma.collectionAllocation.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        collectionId: `export-payment-${String(index).padStart(3, "0")}`,
        installmentId: "export-installment",
        amountCents: 100,
      })),
    });
  }

  async function purchaseAndCardFixtures() {
    const server = app.getHttpServer();
    await db.prisma.paymentMethod.update({
      where: { id: "pm7" },
      data: { supportsInstallments: true },
    });
    await db.prisma.paymentMethod.update({
      where: { id: "pm2" },
      data: { collectionEligible: true },
    });
    const product = await request(server)
      .post("/api/products")
      .send({
        name: "Mercadería exportada",
        categoryId: "c0",
        supplierId: "s1",
        costAmountCents: 10001,
        priceAmountCents: 15000,
        marginPct: 50,
        physicalStock: 0,
        minStock: 0,
      })
      .expect(201);
    productId = product.body.id;
    const purchase = await request(server)
      .post("/api/purchases")
      .send({
        operationId: "export-purchase",
        supplierId: "s1",
        status: "Registrada",
        paymentCondition: "Credito",
        dueDate: "2026-11-30",
        items: [{ productId, qty: 2, unitCostAmountCents: 10001 }],
      })
      .expect(201);
    const list = await request(server)
      .post("/api/price-lists")
      .send({
        name: "Lista original exportada",
        tiers: [
          {
            minimumQty: 1,
            prices: [
              {
                itemType: "Product",
                itemId: productId,
                priceAmountCents: 10101,
              },
            ],
          },
        ],
      })
      .expect(201);
    const customer = await request(server)
      .post("/api/customers")
      .send({ name: "Cliente tarjeta original", priceListId: list.body.id })
      .expect(201);
    const sale = await request(server)
      .post("/api/sales")
      .send({
        operationId: "export-card-sale",
        customerId: customer.body.id,
        deliveryStatus: "Entregado",
        paymentMethodId: "pm7",
        paymentTerms: "CardInstallments",
        cardPlan: {
          installmentCount: 3,
          processor: "Procesador original",
          settlements: [],
        },
        items: [{ productId, qty: 1 }],
      })
      .expect(201);
    saleId = sale.body.id;
    const scheduled = await request(server)
      .post(`/api/card-settlements/sales/${saleId}/schedule`)
      .send({
        operationId: "export-card-schedule",
        settlements: [
          {
            dueDate: "2026-12-31",
            grossAmountCents: sale.body.totalAmountCents,
            feeAmountCents: 300,
          },
        ],
      })
      .expect(201);
    const settlementId = scheduled.body[0].id;
    const reversed = await request(server)
      .post(`/api/card-settlements/${settlementId}/accreditations`)
      .send({
        operationId: "export-credit-error",
        date: "2026-01-31",
        grossAmountCents: 4000,
        feeAmountCents: 155,
      })
      .expect(201);
    await request(server)
      .post(`/api/card-settlements/accreditations/${reversed.body.id}/reverse`)
      .send({ reason: "Error de carga" })
      .expect(200);
    await request(server)
      .post(`/api/card-settlements/${settlementId}/accreditations`)
      .send({
        operationId: "export-credit-real",
        date: "2026-01-31",
        grossAmountCents: 5000,
        feeAmountCents: 123,
        reference: "Liquidación real",
      })
      .expect(201);
    const lots = await request(server)
      .get("/api/data-exports/inventory-lots")
      .expect(200);
    const lotIndex = lots.body.findIndex(
      (row: Rows[number]) =>
        row[lots.body[0].indexOf("ID producto")] === productId,
    );
    expect(cell(lots.body, "Cantidad restante", lotIndex)).toBe(1);
    expect(cell(lots.body, "Costo unitario histórico ARS", lotIndex)).toBe(
      100.01,
    );
    expect(cell(lots.body, "Valor restante al costo ARS", lotIndex)).toBe(
      100.01,
    );
    await request(server)
      .post(`/api/sales/${saleId}/cancel`)
      .send({ reason: "Venta anulada" })
      .expect(200);
    await request(server)
      .post("/api/collections/refunds")
      .send({
        operationId: "export-card-refund",
        saleId,
        date: "2026-01-31",
        amountCents: sale.body.totalAmountCents,
        cashOutAmountCents: 5000,
        paymentMethodId: "pm2",
        reason: "Devolución completa",
        cancellations: [
          { settlementId, grossAmountCents: sale.body.totalAmountCents - 5000 },
        ],
      })
      .expect(201);
    await request(server)
      .post(`/api/supplier-payables/${purchase.body.payable.id}/payments`)
      .send({
        operationId: "export-supplier-payment",
        date: "2026-01-31",
        method: "QR",
        reference: "Pago original",
      })
      .expect(201);
    await request(server)
      .post(`/api/purchases/${purchase.body.id}/cancel`)
      .send({ reason: "Compra devuelta" })
      .expect(200);
    await request(server)
      .post(`/api/supplier-payables/${purchase.body.payable.id}/refunds`)
      .send({
        operationId: "export-supplier-refund",
        date: "2026-01-31",
        method: "QR",
        reference: "Reintegro real",
      })
      .expect(201);
  }

  it("exports every collection, original customer names and reversals without a page limit", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/data-exports/collections")
      .expect(200);
    expect(response.body).toHaveLength(102);
    expect(cell(response.body, "Cliente original")).toBe("Nombre original");
    expect(cell(response.body, "Medio de cobro original")).toBe(
      "Medio original",
    );
    expect(cell(response.body, "Importe ARS")).toBe(1);
    expect(cell(response.body, "Fecha")).toBe("31/01/2026");
    expect(cell(response.body, "Revertido")).toBe(true);
    expect(cell(response.body, "Motivo de reversión")).toBe("Error de carga");
    const plans = await request(app.getHttpServer())
      .get("/api/data-exports/customer-plans")
      .expect(200);
    expect(cell(plans.body, "Saldo pendiente ARS")).toBe(1);
    expect(cell(plans.body, "Origen")).toBe("Saldo anterior");
  });

  it("keeps actual card fees, refunds and FIFO reversals distinct from expected money", async () => {
    const accreditations = await request(app.getHttpServer())
      .get("/api/data-exports/card-accreditations")
      .expect(200);
    expect(accreditations.body).toHaveLength(3);
    const reversedIndex = accreditations.body.findIndex(
      (row: Rows[number]) =>
        row[accreditations.body[0].indexOf("Revertida")] === true,
    );
    expect(cell(accreditations.body, "Neto recibido ARS", reversedIndex)).toBe(
      38.45,
    );
    expect(cell(accreditations.body, "Neto vigente ARS", reversedIndex)).toBe(
      0,
    );
    const realIndex = reversedIndex === 1 ? 2 : 1;
    expect(cell(accreditations.body, "Comisión real ARS", realIndex)).toBe(
      1.23,
    );
    expect(cell(accreditations.body, "Neto recibido ARS", realIndex)).toBe(
      48.77,
    );
    const refunds = await request(app.getHttpServer())
      .get("/api/data-exports/refunds")
      .expect(200);
    expect(cell(refunds.body, "Egreso de dinero ARS")).toBe(50);
    expect(Number(cell(refunds.body, "Importe ARS"))).toBeGreaterThan(50);
    const cancellations = await request(app.getHttpServer())
      .get("/api/data-exports/refund-cancellations")
      .expect(200);
    expect(cell(cancellations.body, "Bruto cancelado ARS")).toBe(
      cell(refunds.body, "Acreditaciones canceladas ARS"),
    );
    const allocations = await request(app.getHttpServer())
      .get("/api/data-exports/inventory-allocations")
      .expect(200);
    const rows = allocations.body
      .slice(1)
      .filter(
        (row: Rows[number]) =>
          row[allocations.body[0].indexOf("ID producto")] === productId,
      );
    expect(rows).toHaveLength(3);
    expect(
      rows
        .map(
          (row: Rows[number]) =>
            row[allocations.body[0].indexOf("Cantidad aplicada")],
        )
        .sort(
          (a: Rows[number][number], b: Rows[number][number]) =>
            Number(a) - Number(b),
        ),
    ).toEqual([-2, -1, 1]);
    expect(
      rows.every(
        (row: Rows[number]) =>
          row[allocations.body[0].indexOf("Costo unitario histórico ARS")] ===
          100.01,
      ),
    ).toBe(true);
  });

  it("previews and restores every imported table with its original values in a temporary database", async () => {
    const server = app.getHttpServer();
    const reportQuery = {
      from: "2026-10-01T03:00:00.000Z",
      to: "2026-11-01T03:00:00.000Z",
    };
    const expectedReports = [];
    for (const groupBy of ["day", "tenDays", "month"]) {
      const response = await request(server)
        .get("/api/reports/profit")
        .query({ ...reportQuery, groupBy })
        .expect(200);
      expectedReports.push(response.body);
    }
    const expectedStock = (
      await request(server).get("/api/stock/summary").expect(200)
    ).body;
    const expectedProfits = (
      await request(server).get("/api/data-exports/sale-profits").expect(200)
    ).body;
    const backup = await app.get(BackupsService).createBackup();
    const path = join(directory, backup.filename);
    const expected = importedTables(path);
    await db.prisma.customer.update({
      where: { id: "export-customer" },
      data: { name: "Cambio posterior" },
    });
    await db.prisma.inventoryLot.updateMany({
      where: { productId: profitProductId },
      data: { unitCostAmountCents: 1 },
    });
    const preview = await request(app.getHttpServer())
      .post("/api/backups/import/validate")
      .set("Content-Type", "application/vnd.sqlite3")
      .send(readFileSync(path))
      .expect(201);
    expect(preview.body.counts).toMatchObject({
      customers: 2,
      receivablePlans: 1,
      receivableInstallments: 1,
      collections: 101,
      collectionAllocations: 101,
      cardAccreditations: 2,
      refundCancellations: 1,
      supplierPayments: 1,
      supplierRefunds: 1,
      priceListTiers: 1,
      categories: expect.any(Number),
      paymentMethods: expect.any(Number),
      saleItems: expect.any(Number),
      purchaseItems: expect.any(Number),
      comboItems: expect.any(Number),
      financialOperations: expect.any(Number),
    });
    expect(
      (
        await db.prisma.customer.findUniqueOrThrow({
          where: { id: "export-customer" },
        })
      ).name,
    ).toBe("Cambio posterior");
    await request(app.getHttpServer())
      .post(`/api/backups/import/${preview.body.id}/confirm`)
      .send({ confirmed: true })
      .expect(201);
    expect(importedTables(db.url.slice("file:".length))).toEqual(expected);
    for (const [index, groupBy] of ["day", "tenDays", "month"].entries()) {
      const response = await request(server)
        .get("/api/reports/profit")
        .query({ ...reportQuery, groupBy })
        .expect(200);
      expect(response.body).toEqual(expectedReports[index]);
    }
    expect(
      (await request(server).get("/api/stock/summary").expect(200)).body,
    ).toEqual(expectedStock);
    expect(
      (await request(server).get("/api/data-exports/sale-profits").expect(200))
        .body,
    ).toEqual(expectedProfits);
  });
});
