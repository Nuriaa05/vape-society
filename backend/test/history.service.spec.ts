import { Test } from "@nestjs/testing";

import { HistoryService } from "../src/modules/history/history.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("HistoryService", () => {
  let db: SeededTestDatabase;
  let service: HistoryService;

  beforeEach(async () => {
    db = await createSeededTestDatabase();
    const moduleRef = await Test.createTestingModule({
      providers: [
        HistoryService,
        { provide: PrismaService, useValue: db.prisma },
      ],
    }).compile();

    service = moduleRef.get(HistoryService);
    await seedHistoricalEvents(db);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("lists only months that contain persisted activity", async () => {
    const months = await service.getMonths();
    const may = months.find((month) => month.month === "2026-05");

    expect(may).toEqual(
      expect.objectContaining({
        month: "2026-05",
        label: expect.stringMatching(/mayo/i),
      }),
    );
    expect(may?.eventCount).toBeGreaterThanOrEqual(5);
  });

  it("filters a month by type, day and text without duplicating sale stock movements", async () => {
    const sales = await service.findAll({
      month: "2026-05",
      type: "sales",
      query: "990001",
      take: 20,
      skip: 0,
    });
    const stock = await service.findAll({
      month: "2026-05",
      day: "2026-05-11",
      type: "stock",
      take: 20,
      skip: 0,
    });

    expect(sales.items.map((event) => event.title)).toEqual([
      "Venta 990001 anulada",
      "Venta 990001",
    ]);
    expect(stock.items).toEqual([
      expect.objectContaining({
        type: "stock",
        title: "Ajuste de stock",
        quantity: -2,
      }),
    ]);
    expect(stock.items.some((event) => event.id.includes("sale-stock"))).toBe(
      false,
    );
  });

  it("returns stable progressive pages after applying filters", async () => {
    const firstPage = await service.findAll({
      month: "2026-05",
      take: 2,
      skip: 0,
    });
    const secondPage = await service.findAll({
      month: "2026-05",
      take: 2,
      skip: 2,
    });

    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.total).toBeGreaterThan(2);
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.items.map((event) => event.id)).not.toEqual(
      expect.arrayContaining(firstPage.items.map((event) => event.id)),
    );
  });

  it("describes product creation independently of the legacy sale flag", async () => {
    await db.prisma.product.update({
      where: { id: "history-product" },
      data: { saleEnabled: false },
    });

    const history = await service.findAll({
      month: "2026-05",
      type: "products",
      take: 20,
      skip: 0,
    });

    expect(history.items).toEqual([
      expect.objectContaining({
        title: "Producto creado",
        entityId: "history-product",
        status: "Creado",
      }),
    ]);
  });
});

async function seedHistoricalEvents(db: SeededTestDatabase) {
  const saleDate = new Date("2026-05-10T15:00:00.000Z");
  const cancellationDate = new Date("2026-05-11T14:00:00.000Z");
  const purchaseDate = new Date("2026-05-12T15:00:00.000Z");

  await db.prisma.sale.create({
    data: {
      id: "history-sale",
      number: "990001",
      date: saleDate,
      deliveryStatus: "Entregado",
      status: "Anulada",
      paymentMethodId: "pm1",
      paymentMethodName: "Efectivo",
      subtotalAmountCents: 450000,
      totalAmountCents: 450000,
      cancelReason: null,
      cancelledAt: cancellationDate,
      items: {
        create: {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          barcode: "7790001000017",
          qty: 2,
          unitPriceAmountCents: 225000,
          lineTotalAmountCents: 450000,
        },
      },
    },
  });
  await db.prisma.purchase.create({
    data: {
      id: "history-purchase",
      supplierId: "s1",
      date: purchaseDate,
      status: "Registrada",
      totalAmountCents: 300000,
      items: {
        create: {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          qty: 3,
          unitCostAmountCents: 100000,
          lineTotalAmountCents: 300000,
        },
      },
    },
  });
  await db.prisma.product.create({
    data: {
      id: "history-product",
      name: "Producto historico",
      categoryId: "c1",
      supplierId: "s1",
      costAmountCents: 100000,
      priceAmountCents: 150000,
      marginPct: 50,
      createdAt: new Date("2026-05-09T15:00:00.000Z"),
    },
  });
  await db.prisma.stockMovement.createMany({
    data: [
      {
        id: "manual-stock",
        productId: "p1",
        type: "Ajuste",
        sourceType: "ManualAdjustment",
        sourceId: "manual-1",
        physicalDelta: -2,
        note: "Conteo",
        createdAt: cancellationDate,
      },
      {
        id: "sale-stock",
        productId: "p1",
        type: "Venta",
        sourceType: "Sale",
        sourceId: "history-sale",
        physicalDelta: -2,
        createdAt: saleDate,
      },
    ],
  });
}
