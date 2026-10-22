import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { StockRulesService } from "../src/domain/stock-rules.service";
import { ReportsController } from "../src/modules/reports/reports.controller";
import { ReportsService } from "../src/modules/reports/reports.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createEmptyTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

type Summary = {
  salesCount: number;
  missingCostSalesCount: number;
  revenueAmountCents: number;
  costAmountCents: number | null;
  profitAmountCents: number | null;
};
type Bucket = Summary & {
  from: string;
  to: string;
  label: string;
  partial: boolean;
};

const midnight = (date: string) => `${date}T00:00:00-03:00`;
const iso = (date: string) => new Date(midnight(date)).toISOString();
const zero: Summary = {
  salesCount: 0,
  missingCostSalesCount: 0,
  revenueAmountCents: 0,
  costAmountCents: 0,
  profitAmountCents: 0,
};

describe("Profit reports API", () => {
  let db: SeededTestDatabase;
  let app: INestApplication;
  let serial = 0;

  beforeAll(async () => {
    db = await createEmptyTestDatabase();
    const prisma = db.prisma as PrismaService;
    const module = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          useValue: new ReportsService(prisma, new StockRulesService(prisma)),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    await db.prisma.category.create({ data: { id: "category", name: "Test" } });
    await db.prisma.product.create({
      data: {
        id: "a",
        name: "Product",
        categoryId: "category",
        barcode: "profit-reports-a",
        costAmountCents: 99999,
        priceAmountCents: 1000,
        marginPct: 0,
      },
    });
  });

  beforeEach(async () => {
    await db.prisma.inventoryAllocation.deleteMany();
    await db.prisma.inventoryLot.deleteMany();
    await db.prisma.stockMovement.deleteMany();
    await db.prisma.saleItem.deleteMany();
    await db.prisma.sale.deleteMany();
  });

  afterAll(async () => {
    await app?.close();
    await db?.cleanup();
  });

  async function sale(
    deliveredAt: string,
    input: {
      revenue?: number;
      cost?: number | null;
      saleDate?: string;
      status?: string;
      deliveryStatus?: string;
      customerName?: string;
    } = {},
  ) {
    const cost = input.cost === undefined ? 101 : input.cost;
    const saved = await db.prisma.sale.create({
      data: {
        number: `profit-report-${++serial}`,
        date: new Date(input.saleDate ?? deliveredAt),
        status: input.status ?? "Confirmada",
        deliveryStatus: input.deliveryStatus ?? "Entregado",
        customerName: input.customerName,
        totalAmountCents: input.revenue ?? 1001,
        subtotalAmountCents: input.revenue ?? 1001,
        items: {
          create: {
            productId: "a",
            itemType: "Product",
            productName: "Product",
            barcode: "a",
            qty: 1,
            unitPriceAmountCents: input.revenue ?? 1001,
            lineTotalAmountCents: input.revenue ?? 1001,
          },
        },
      },
    });
    if (cost !== null) {
      const movement = await db.prisma.stockMovement.create({
        data: {
          productId: "a",
          type: "Venta",
          sourceType: "Sale",
          sourceId: saved.id,
          physicalDelta: -1,
          createdAt: new Date(deliveredAt),
        },
      });
      const lot = await db.prisma.inventoryLot.create({
        data: {
          productId: "a",
          classification: "Credito",
          unitCostAmountCents: cost,
          initialQty: 1,
          remainingQty: 0,
          receivedAt: new Date("2023-01-01T12:00:00Z"),
        },
      });
      await db.prisma.inventoryAllocation.create({
        data: { lotId: lot.id, stockMovementId: movement.id, qty: -1 },
      });
    }
    return saved;
  }

  const report = (from: string, to: string, groupBy = "day") =>
    request(app.getHttpServer())
      .get("/api/reports/profit")
      .query({ from: midnight(from), to: midnight(to), groupBy });

  it("returns empty Argentine days and defaults to daily grouping", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/reports/profit")
      .query({ from: midnight("2024-02-28"), to: midnight("2024-03-02") })
      .expect(200);
    expect(response.body).toMatchObject({
      from: iso("2024-02-28"),
      to: iso("2024-03-02"),
      groupBy: "day",
      summary: zero,
    });
    expect(response.body.buckets.map((bucket: Bucket) => bucket.label)).toEqual([
      "28/02/2024",
      "29/02/2024",
      "01/03/2024",
    ]);
    expect(response.body.buckets.every((bucket: Bucket) =>
      bucket.profitAmountCents === 0 && !bucket.partial,
    )).toBe(true);
  });

  it("defaults to the current Argentine month through the end of today", async () => {
    jest.useFakeTimers({ now: new Date("2026-11-01T01:30:00Z"), doNotFake: ["nextTick", "setImmediate", "setTimeout"] });
    try {
      const response = await request(app.getHttpServer())
        .get("/api/reports/profit")
        .expect(200);
      expect(response.body).toMatchObject({
        from: iso("2026-10-01"),
        to: iso("2026-11-01"),
        groupBy: "day",
        summary: zero,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps day, fixed ten-day and month totals equivalent across years", async () => {
    for (const date of ["2023-12-21", "2023-12-31", "2024-01-01", "2024-01-10", "2024-01-11", "2024-01-20", "2024-01-21", "2024-01-31", "2024-02-01"]) {
      await sale(midnight(date));
    }
    const outputs = [];
    for (const grouping of ["day", "tenDays", "month"]) {
      const response = await report("2023-12-21", "2024-02-02", grouping).expect(200);
      outputs.push(response.body);
      expect(response.body.summary).toEqual({
        salesCount: 9,
        missingCostSalesCount: 0,
        revenueAmountCents: 9009,
        costAmountCents: 909,
        profitAmountCents: 8100,
      });
      expect(response.body.buckets.reduce((sum: number, bucket: Bucket) => sum + bucket.profitAmountCents!, 0)).toBe(8100);
    }
    expect(outputs[1].buckets.map((bucket: Bucket) => [bucket.from, bucket.to, bucket.salesCount, bucket.partial])).toEqual([
      [iso("2023-12-21"), iso("2024-01-01"), 2, false],
      [iso("2024-01-01"), iso("2024-01-11"), 2, false],
      [iso("2024-01-11"), iso("2024-01-21"), 2, false],
      [iso("2024-01-21"), iso("2024-02-01"), 2, false],
      [iso("2024-02-01"), iso("2024-02-02"), 1, true],
    ]);
    expect(outputs[2].buckets.map((bucket: Bucket) => [bucket.label, bucket.partial])).toEqual([
      ["diciembre de 2023", true], ["enero de 2024", false], ["febrero de 2024", true],
    ]);
  });

  it.each([2023, 2024])("ends February ten-day buckets correctly in %i", async (year) => {
    const response = await report(`${year}-02-19`, `${year}-03-02`, "tenDays").expect(200);
    expect(response.body.buckets.map((bucket: Bucket) => [bucket.from, bucket.to, bucket.partial])).toEqual([
      [iso(`${year}-02-19`), iso(`${year}-02-21`), true],
      [iso(`${year}-02-21`), iso(`${year}-03-01`), false],
      [iso(`${year}-03-01`), iso(`${year}-03-02`), true],
    ]);
  });

  it("clips intraday limits and recognizes only delivery within the half-open Argentine day", async () => {
    await sale("2024-05-01T02:59:59.999Z");
    await sale("2024-05-01T03:00:00.000Z", { saleDate: "2024-04-01T12:00:00Z" });
    await sale("2024-05-02T02:59:59.999Z");
    await sale("2024-05-02T03:00:00.000Z");
    const response = await report("2024-05-01", "2024-05-02").expect(200);
    expect(response.body.summary.salesCount).toBe(2);
    const clipped = await request(app.getHttpServer()).get("/api/reports/profit").query({
      from: "2024-05-01T12:00:00Z", to: "2024-05-02T01:00:00Z", groupBy: "tenDays",
    }).expect(200);
    expect(clipped.body.buckets[0]).toMatchObject({
      from: "2024-05-01T12:00:00.000Z", to: "2024-05-02T01:00:00.000Z", partial: true,
    });
  });

  it("uses the actual Argentine zone when historical daylight saving skipped midnight", async () => {
    await sale("2008-10-19T02:59:59.999Z");
    await sale("2008-10-19T03:00:00.000Z");
    const response = await request(app.getHttpServer()).get("/api/reports/profit").query({
      from: "2008-10-18T03:00:00Z", to: "2008-10-20T02:00:00Z",
    }).expect(200);
    expect(response.body.buckets.map((bucket: Bucket) => [bucket.from, bucket.to, bucket.salesCount])).toEqual([
      ["2008-10-18T03:00:00.000Z", "2008-10-19T03:00:00.000Z", 1],
      ["2008-10-19T03:00:00.000Z", "2008-10-20T02:00:00.000Z", 1],
    ]);
  });

  it("keeps missing costs null only in affected groups and preserves centavo losses", async () => {
    await sale(midnight("2024-06-01"), { revenue: 1001, cost: 1202 });
    await sale(midnight("2024-06-02"), { revenue: 501, cost: null });
    const response = await report("2024-06-01", "2024-06-04").expect(200);
    expect(response.body.summary).toEqual({
      salesCount: 2, missingCostSalesCount: 1, revenueAmountCents: 1502, costAmountCents: null, profitAmountCents: null,
    });
    expect(response.body.buckets[0]).toMatchObject({ costAmountCents: 1202, profitAmountCents: -201 });
    expect(response.body.buckets[1]).toMatchObject({ missingCostSalesCount: 1, revenueAmountCents: 501, costAmountCents: null, profitAmountCents: null });
    expect(response.body.buckets[2]).toMatchObject(zero);
    await db.prisma.product.update({ where: { id: "a" }, data: { costAmountCents: 1 } });
    expect((await report("2024-06-01", "2024-06-04").expect(200)).body).toEqual(response.body);
  });

  it("excludes pending and cancelled sales, and removes cancellations from the original period", async () => {
    await sale(midnight("2024-06-01"), { status: "Anulada" });
    await sale(midnight("2024-06-01"), { deliveryStatus: "Pendiente" });
    const saved = await sale(midnight("2024-06-01"));
    expect((await report("2024-06-01", "2024-06-02").expect(200)).body.summary.salesCount).toBe(1);
    await db.prisma.sale.update({ where: { id: saved.id }, data: { status: "Anulada" } });
    expect((await report("2024-06-01", "2024-06-02").expect(200)).body.summary).toEqual(zero);
  });

  it("recognizes the first original output once and ignores reversal movements", async () => {
    const saved = await sale(midnight("2024-06-01"));
    const original = await db.prisma.stockMovement.findFirstOrThrow({
      where: { sourceId: saved.id },
    });
    const lot = await db.prisma.inventoryLot.findFirstOrThrow();
    await db.prisma.saleItem.updateMany({
      where: { saleId: saved.id }, data: { qty: 2 },
    });
    await db.prisma.stockMovement.create({
      data: {
        productId: "a", type: "Venta", sourceType: "Sale", sourceId: saved.id,
        physicalDelta: -1, createdAt: new Date(midnight("2024-06-02")),
        allocations: { create: { lotId: lot.id, qty: -1 } },
      },
    });
    await db.prisma.stockMovement.create({
      data: {
        productId: "a", type: "Venta", sourceType: "Sale", sourceId: saved.id,
        physicalDelta: 1, reversalOfId: original.id,
        createdAt: new Date(midnight("2024-06-03")),
      },
    });
    expect((await report("2024-06-01", "2024-06-02").expect(200)).body.summary).toMatchObject({
      salesCount: 1, costAmountCents: 202, profitAmountCents: 799,
    });
    expect((await report("2024-06-02", "2024-06-03").expect(200)).body.summary).toEqual(zero);
    expect((await report("2024-06-03", "2024-06-04").expect(200)).body.summary).toEqual(zero);
  });

  it("rejects costs that cannot be represented safely in integer centavos", async () => {
    const saved = await sale(midnight("2024-06-01"));
    await db.prisma.saleItem.updateMany({
      where: { saleId: saved.id }, data: { qty: 2_147_483_647 },
    });
    await db.prisma.stockMovement.updateMany({ data: { physicalDelta: -2_147_483_647 } });
    await db.prisma.inventoryAllocation.updateMany({ data: { qty: -2_147_483_647 } });
    await db.prisma.inventoryLot.updateMany({ data: { unitCostAmountCents: 2_147_483_647 } });
    await report("2024-06-01", "2024-06-02").expect(400);
  });

  it("paginates stable delivery-descending details while retaining the whole interval summary", async () => {
    const first = await sale(midnight("2024-07-01"));
    const second = await sale(midnight("2024-07-03"), { customerName: "Cliente original", saleDate: midnight("2024-06-01") });
    const third = await sale(midnight("2024-07-03"), { cost: null });
    const params = { from: midnight("2024-07-01"), to: midnight("2024-08-01"), pageSize: 1 };
    const items = [];
    for (const page of [1, 2, 3]) {
      const response = await request(app.getHttpServer()).get("/api/reports/profit/sales").query({ ...params, page }).expect(200);
      expect(response.body).toMatchObject({
        from: iso("2024-07-01"), to: iso("2024-08-01"), page, pageSize: 1, total: 3, totalPages: 3,
        summary: { salesCount: 3, revenueAmountCents: 3003, missingCostSalesCount: 1, costAmountCents: null, profitAmountCents: null },
      });
      expect(response.body.items).toHaveLength(1);
      items.push(response.body.items[0]);
    }
    expect(items.map((item) => item.id)).toEqual([...[second.id, third.id].sort().reverse(), first.id]);
    expect(items.find((item) => item.id === second.id)).toEqual({
      id: second.id, number: second.number, customerName: "Cliente original", saleDate: iso("2024-06-01"), deliveredAt: iso("2024-07-03"), revenueAmountCents: 1001, costAmountCents: 101, profitAmountCents: 900, missingCost: false,
    });
    expect(items.find((item) => item.id === third.id)).toMatchObject({ customerName: null, missingCost: true, costAmountCents: null, profitAmountCents: null });
    const empty = await request(app.getHttpServer()).get("/api/reports/profit/sales").query({ ...params, page: 4 }).expect(200);
    expect(empty.body.items).toEqual([]);
    expect(empty.body.summary.salesCount).toBe(3);
    const defaults = await request(app.getHttpServer()).get("/api/reports/profit/sales").query({ from: midnight("2024-08-01"), to: midnight("2024-08-02") }).expect(200);
    expect(defaults.body).toMatchObject({ page: 1, pageSize: 10, total: 0, totalPages: 0, summary: zero, items: [] });
  });

  it.each([
    { from: midnight("2024-01-01") },
    { to: midnight("2024-01-02") },
    { from: "garbage", to: midnight("2024-01-02") },
    { from: "2024-02-30T00:00:00Z", to: midnight("2024-03-02") },
    { from: "2024-01-01", to: "2024-01-02" },
    { from: midnight("2024-01-02"), to: midnight("2024-01-01") },
    { from: midnight("2024-01-01"), to: midnight("2024-01-01") },
    { from: "+275760-09-13T00:00:00Z", to: "+275760-09-13T01:00:00Z" },
    { from: "0001-01-01T00:00:00Z", to: "0001-01-02T00:00:00Z" },
    { from: "1900-01-01T00:00:00Z", to: "2100-01-01T00:00:00Z" },
    { groupBy: "week" },
    { groupBy: "" },
  ])("returns 400 for invalid report parameters %j", async (query) => {
    await request(app.getHttpServer()).get("/api/reports/profit").query(query).expect(400);
  });

  it.each([
    { page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "1e2" }, { page: "" },
    { page: "9007199254740992" }, { pageSize: "0" }, { pageSize: "101" },
    { pageSize: "1.1" }, { pageSize: "foo" },
    { from: "bad", to: midnight("2024-01-02") },
  ])("returns 400 for invalid detail parameters %j", async (query) => {
    await request(app.getHttpServer()).get("/api/reports/profit/sales").query(query).expect(400);
  });
});
