import { StockRulesService } from "../src/domain/stock-rules.service";
import { businessToday } from "../src/modules/collections/finance-rules";
import { ReportsService } from "../src/modules/reports/reports.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createEmptyTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("Dashboard gross profit", () => {
  let db: SeededTestDatabase;
  let service: ReportsService;
  const today = businessToday();
  const dayStart = new Date(`${today}T00:00:00-03:00`);
  const noon = new Date(`${today}T12:00:00-03:00`);
  let number = 0;

  beforeAll(async () => {
    db = await createEmptyTestDatabase();
    const prisma = db.prisma as PrismaService;
    service = new ReportsService(prisma, new StockRulesService(prisma));
    await db.prisma.category.create({
      data: { id: "category", name: "Prueba" },
    });
    for (const id of ["a", "b"]) {
      await db.prisma.product.create({
        data: {
          id,
          name: id,
          categoryId: "category",
          barcode: id,
          costAmountCents: 99999,
          priceAmountCents: 1000,
          marginPct: 0,
          physicalStock: 0,
        },
      });
    }
  });

  beforeEach(async () => {
    await db.prisma.inventoryAllocation.deleteMany();
    await db.prisma.inventoryLot.deleteMany();
    await db.prisma.stockMovement.deleteMany();
    await db.prisma.saleItemComponent.deleteMany();
    await db.prisma.saleItem.deleteMany();
    await db.prisma.sale.deleteMany();
  });

  afterAll(async () => {
    await db?.cleanup();
  });

  type Line = {
    productId?: string;
    qty: number;
    price: number;
    components?: Array<{ productId: string; qty: number }>;
  };
  async function sale(
    input: {
      lines?: Line[];
      allocations?: Array<{ productId: string; qty: number; cost: number }>;
      date?: Date;
      deliveredAt?: Date | null;
      status?: string;
      deliveryStatus?: string;
      discount?: number;
      surcharge?: number;
      paymentTerms?: string;
    } = {},
  ) {
    const lines = input.lines ?? [{ productId: "a", qty: 1, price: 1000 }];
    const subtotal = lines.reduce(
      (sum, line) => sum + line.qty * line.price,
      0,
    );
    const saved = await db.prisma.sale.create({
      data: {
        number: `profit-${++number}`,
        date: input.date ?? noon,
        status: input.status ?? "Confirmada",
        deliveryStatus: input.deliveryStatus ?? "Entregado",
        paymentTerms: input.paymentTerms,
        subtotalAmountCents: subtotal,
        discountAmountCents: input.discount ?? 0,
        surchargeAmountCents: input.surcharge ?? 0,
        totalAmountCents:
          subtotal - (input.discount ?? 0) + (input.surcharge ?? 0),
        items: {
          create: lines.map((line) => ({
            itemType: line.components ? "Combo" : "Product",
            productId: line.productId,
            productName: line.components ? "Pack original" : line.productId!,
            barcode: "",
            qty: line.qty,
            unitPriceAmountCents: line.price,
            lineTotalAmountCents: line.qty * line.price,
            components: {
              create: (line.components ?? []).map((component) => ({
                productId: component.productId,
                productName: component.productId,
                barcode: "",
                qtyPerCombo: component.qty,
                totalQty: component.qty * line.qty,
              })),
            },
          })),
        },
      },
    });
    if (input.deliveredAt === null || input.deliveryStatus === "Pendiente")
      return saved;
    const requirements = new Map<string, number>();
    for (const line of lines) {
      const components = line.components ?? [
        { productId: line.productId!, qty: 1 },
      ];
      for (const component of components)
        requirements.set(
          component.productId,
          (requirements.get(component.productId) ?? 0) +
            component.qty * line.qty,
        );
    }
    for (const [productId, qty] of requirements) {
      const costs = (
        input.allocations ?? [{ productId: "a", qty: 1, cost: 100 }]
      ).filter((row) => row.productId === productId);
      const movement = await db.prisma.stockMovement.create({
        data: {
          productId,
          type: "Venta",
          sourceType: "Sale",
          sourceId: saved.id,
          physicalDelta: -qty,
          createdAt: input.deliveredAt ?? noon,
          unallocatedQty: qty - costs.reduce((sum, row) => sum + row.qty, 0),
        },
      });
      for (const row of costs) {
        const lot = await db.prisma.inventoryLot.create({
          data: {
            productId,
            classification: "Pagada",
            unitCostAmountCents: row.cost,
            initialQty: row.qty,
            remainingQty: 0,
            receivedAt: new Date("2025-01-01T12:00:00Z"),
          },
        });
        await db.prisma.inventoryAllocation.create({
          data: {
            lotId: lot.id,
            stockMovementId: movement.id,
            qty: -row.qty,
          },
        });
      }
    }
    return saved;
  }

  it("returns zero profit for a day without delivered sales", async () => {
    expect(await service.getDashboardSummary()).toMatchObject({
      todayProfit: {
        salesCount: 0,
        missingCostSalesCount: 0,
        revenueAmountCents: 0,
        costAmountCents: 0,
        profitAmountCents: 0,
      },
    });
  });

  it("uses FIFO lot costs and the final discounted sale amount without repricing history", async () => {
    await sale({
      lines: [{ productId: "a", qty: 3, price: 500 }],
      discount: 499,
      allocations: [
        { productId: "a", qty: 2, cost: 101 },
        { productId: "a", qty: 1, cost: 203 },
      ],
    });
    const expected = {
      todayProfit: {
        salesCount: 1,
        missingCostSalesCount: 0,
        revenueAmountCents: 1001,
        costAmountCents: 405,
        profitAmountCents: 596,
      },
    };
    expect(await service.getDashboardSummary()).toMatchObject(expected);
    await db.prisma.product.update({
      where: { id: "a" },
      data: { costAmountCents: 123456 },
    });
    expect(await service.getDashboardSummary()).toMatchObject(expected);
  });

  it("costs original combo components and repeated products only once", async () => {
    await sale({
      lines: [
        {
          qty: 2,
          price: 1000,
          components: [
            { productId: "a", qty: 2 },
            { productId: "b", qty: 1 },
          ],
        },
        { productId: "a", qty: 1, price: 300 },
      ],
      allocations: [
        { productId: "a", qty: 5, cost: 100 },
        { productId: "b", qty: 2, cost: 200 },
      ],
    });
    expect(await service.getDashboardSummary()).toMatchObject({
      todayProfit: {
        salesCount: 1,
        missingCostSalesCount: 0,
        revenueAmountCents: 2300,
        costAmountCents: 900,
        profitAmountCents: 1400,
      },
    });
  });

  it("recognizes delivery within the Argentine day even when the sale was agreed earlier", async () => {
    await sale({
      date: new Date(dayStart.getTime() - 86400000),
      deliveredAt: dayStart,
    });
    await sale({ deliveredAt: new Date(dayStart.getTime() - 1) });
    await sale({ deliveredAt: new Date(dayStart.getTime() + 86400000) });
    await sale({ deliveredAt: new Date(dayStart.getTime() + 86400000 - 1) });
    expect(await service.getDashboardSummary()).toMatchObject({
      todayProfit: {
        salesCount: 2,
        missingCostSalesCount: 0,
        revenueAmountCents: 2000,
        costAmountCents: 200,
        profitAmountCents: 1800,
      },
    });
  });

  it("excludes pending and cancelled sales and counts installments as one sale", async () => {
    await sale({ deliveryStatus: "Pendiente" });
    await sale({ status: "Anulada" });
    await sale({ paymentTerms: "DirectInstallments", surcharge: 25 });
    await sale({ paymentTerms: "CardInstallments" });
    expect(await service.getDashboardSummary()).toMatchObject({
      todayProfit: {
        salesCount: 2,
        revenueAmountCents: 2025,
        costAmountCents: 200,
        profitAmountCents: 1825,
        missingCostSalesCount: 0,
      },
    });
  });

  it("does not assume zero cost for a historical sale without inventory allocations", async () => {
    await sale();
    await sale({ deliveredAt: null });
    expect(await service.getDashboardSummary()).toMatchObject({
      todayProfit: {
        salesCount: 2,
        revenueAmountCents: 2000,
        costAmountCents: null,
        profitAmountCents: null,
        missingCostSalesCount: 1,
      },
    });
  });

  it("identifies partially costed inventory instead of overstating profit", async () => {
    await sale({ lines: [{ productId: "a", qty: 2, price: 1000 }] });
    expect(await service.getDashboardSummary()).toMatchObject({
      todayProfit: {
        salesCount: 1,
        missingCostSalesCount: 1,
        costAmountCents: null,
        profitAmountCents: null,
      },
    });
  });

  it.each(["allocation", "sale quantity", "lot product"])(
    "keeps profit unknown for inconsistent %s even when unallocatedQty is zero",
    async (inconsistency) => {
      await sale({
        lines: [{ productId: "a", qty: 2, price: 1000 }],
        allocations: [{ productId: "a", qty: 2, cost: 100 }],
      });
      if (inconsistency === "lot product") {
        await db.prisma.inventoryLot.updateMany({ data: { productId: "b" } });
      } else {
        await db.prisma.inventoryAllocation.updateMany({ data: { qty: -1 } });
        if (inconsistency === "sale quantity") {
          await db.prisma.stockMovement.updateMany({
            data: { physicalDelta: -1 },
          });
        }
      }
      expect(await service.getDashboardSummary()).toMatchObject({
        todayProfit: {
          salesCount: 1,
          missingCostSalesCount: 1,
          costAmountCents: null,
          profitAmountCents: null,
        },
      });
    },
  );

  it("allows negative profit when products are sold below their original cost", async () => {
    await sale({ allocations: [{ productId: "a", qty: 1, cost: 1200 }] });
    expect(await service.getDashboardSummary()).toMatchObject({
      todayProfit: {
        revenueAmountCents: 1000,
        costAmountCents: 1200,
        profitAmountCents: -200,
      },
    });
  });
});
