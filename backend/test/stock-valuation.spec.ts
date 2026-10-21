import { StockRulesService } from "../src/domain/stock-rules.service";
import { StockService } from "../src/modules/stock/stock.service";
import { SupplierPayablesService } from "../src/modules/supplier-payables/supplier-payables.service";
import { businessToday } from "../src/modules/collections/finance-rules";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createEmptyTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("Stock valuations", () => {
  let db: SeededTestDatabase;
  let service: StockService;

  beforeAll(async () => {
    db = await createEmptyTestDatabase();
    const prisma = db.prisma as unknown as PrismaService;
    service = new StockService(prisma, new StockRulesService(prisma));
    await db.prisma.category.create({
      data: { id: "category", name: "Stock" },
    });
    await db.prisma.supplier.createMany({
      data: [
        { id: "supplier", name: "Proveedor", phone: "", email: "" },
        {
          id: "archived-supplier",
          name: "Proveedor archivado",
          phone: "",
          email: "",
          active: false,
        },
      ],
    });
    for (const [id, name, qty, price, cost] of [
      ["a", "Producto A", 10, 1000, 432],
      ["b", "Producto B", 3, 600, 200],
      ["c", "Producto C", 2, 300, 99],
      ["empty", "Sin unidades", 0, 500, 100],
      ["negative", "Faltante", -2, 500, 100],
    ] as const) {
      await db.prisma.product.create({
        data: {
          id,
          name,
          barcode: `codigo-${id}`,
          categoryId: "category",
          physicalStock: qty,
          priceAmountCents: price,
          costAmountCents: 9999,
          marginPct: 0,
          archived: id === "b",
        },
      });
      if (qty > 0) {
        await db.prisma.inventoryLot.create({
          data: {
            productId: id,
            classification: id === "b" ? "Credito" : "Pagada",
            initialQty: qty,
            remainingQty: qty,
            unitCostAmountCents: cost,
            receivedAt: new Date("2026-10-01T12:00:00Z"),
          },
        });
      }
    }
    await db.prisma.combo.create({
      data: {
        id: "pack",
        name: "Pack A",
        priceAmountCents: 2500,
        items: { create: { productId: "a", qty: 3 } },
      },
    });
    await db.prisma.sale.create({
      data: {
        number: "000001",
        deliveryStatus: "Pendiente",
        status: "Confirmada",
        subtotalAmountCents: 4500,
        totalAmountCents: 4500,
        items: {
          create: [
            {
              productId: "a",
              productName: "Producto A",
              barcode: "codigo-a",
              qty: 2,
              unitPriceAmountCents: 1000,
              lineTotalAmountCents: 2000,
            },
            {
              itemType: "Combo",
              comboId: "pack",
              productName: "Pack A",
              barcode: "",
              qty: 1,
              unitPriceAmountCents: 2500,
              lineTotalAmountCents: 2500,
              components: {
                create: {
                  productId: "a",
                  productName: "Producto A",
                  barcode: "codigo-a",
                  qtyPerCombo: 3,
                  totalQty: 3,
                },
              },
            },
          ],
        },
      },
    });
    await db.prisma.priceList.create({
      data: {
        id: "private-list",
        name: "Particular",
        tiers: {
          create: {
            minimumQty: 3,
            prices: { create: { productId: "a", priceAmountCents: 1 } },
          },
        },
      },
    });
    await db.prisma.priceList.upsert({
      where: { id: "general" },
      create: { id: "general", name: "General", isGeneral: true },
      update: {},
    });
  });

  beforeEach(async () => {
    await db.prisma.supplierPayment.deleteMany();
    await db.prisma.supplierRefund.deleteMany();
    await db.prisma.supplierPayable.deleteMany();
    await db.prisma.product.update({
      where: { id: "a" },
      data: { priceAmountCents: 1000 },
    });
    await db.prisma.priceListTier.deleteMany({
      where: { priceListId: "general" },
    });
    await db.prisma.priceList.update({
      where: { id: "general" },
      data: {
        active: true,
        isGeneral: true,
        tiers: {
          create: [
            {
              minimumQty: 1,
              prices: { create: { productId: "a", priceAmountCents: 800 } },
            },
            {
              minimumQty: 3,
              prices: {
                create: [
                  { productId: "b", priceAmountCents: 400 },
                  { comboId: "pack", priceAmountCents: 1 },
                ],
              },
            },
            {
              minimumQty: 10,
              prices: { create: { productId: "a", priceAmountCents: 500 } },
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await db?.cleanup();
  });

  it("keeps original lot costs and values all physical units at retail and General for three units", async () => {
    const summary = await service.summary();

    expect(summary).toMatchObject({
      totalValueCents: 5118,
      retailValueCents: 12400,
      wholesaleValueCents: 9800,
      supplierDebtCents: 0,
      netRetailValueCents: 12400,
      reservedStock: 5,
      wholesaleReference: {
        listName: "General",
        quantity: 3,
        fallbackProductCount: 1,
      },
    });
  });

  it("applies search to every valuation without changing the fixed wholesale reference", async () => {
    const summary = await service.summary("codigo-a");

    expect(summary).toMatchObject({
      totalValueCents: 4320,
      retailValueCents: 10000,
      wholesaleValueCents: 8000,
      wholesaleReference: { quantity: 3, fallbackProductCount: 0 },
    });
  });

  it("returns zero values for an empty result or nonpositive stock", async () => {
    for (const query of ["no-existe", "Faltante", "Sin unidades"]) {
      await expect(service.summary(query)).resolves.toMatchObject({
        totalValueCents: 0,
        retailValueCents: 0,
        wholesaleValueCents: 0,
        wholesaleReference: { fallbackProductCount: 0 },
      });
    }
  });

  it("uses habitual prices and identifies the fallback when General has no configured prices", async () => {
    await db.prisma.priceListTier.deleteMany({
      where: { priceListId: "general" },
    });

    await expect(service.summary()).resolves.toMatchObject({
      retailValueCents: 12400,
      wholesaleValueCents: 12400,
      wholesaleReference: {
        listName: "General",
        quantity: 3,
        fallbackProductCount: 3,
      },
    });
  });

  it("does not substitute a private list when the General reference is unavailable", async () => {
    await db.prisma.priceList.update({
      where: { id: "general" },
      data: { isGeneral: false },
    });

    await expect(service.summary()).resolves.toMatchObject({
      totalValueCents: 5118,
      retailValueCents: 12400,
      wholesaleValueCents: null,
      wholesaleReference: null,
    });
  });

  it("accepts aggregate inventory values above the per-operation integer limit without rounding cents", async () => {
    await db.prisma.product.update({
      where: { id: "a" },
      data: { priceAmountCents: 2147483647 },
    });

    await expect(service.summary("codigo-a")).resolves.toMatchObject({
      retailValueCents: 21474836470,
      wholesaleValueCents: 8000,
    });
  });

  it("subtracts all outstanding supplier debt, including old and future balances and archived suppliers", async () => {
    await db.prisma.supplierPayable.create({
      data: {
        supplierId: "supplier",
        title: "Deuda anterior",
        amountCents: 4000,
        dueDate: "2024-01-01",
      },
    });
    await db.prisma.supplierPayable.create({
      data: {
        supplierId: "archived-supplier",
        title: "Pago revertido",
        amountCents: 2000,
        dueDate: "2028-12-31",
        payments: {
          create: {
            date: "2026-01-01",
            method: "Transferencia",
            amountCents: 2000,
            reversedAt: new Date(),
            reversalReason: "Pago incorrecto",
          },
        },
      },
    });
    await db.prisma.supplierPayable.create({
      data: {
        supplierId: "supplier",
        title: "Compra pagada",
        amountCents: 1000,
        dueDate: "2025-01-01",
        payments: {
          create: {
            date: "2025-01-01",
            method: "Efectivo",
            amountCents: 1000,
          },
        },
      },
    });
    await db.prisma.supplierPayable.create({
      data: {
        supplierId: "supplier",
        title: "Compra anulada con reintegro pendiente",
        amountCents: 9000,
        dueDate: "2025-01-01",
        status: "Anulada",
        cancelReason: "Compra anulada",
        cancelledAt: new Date(),
        payments: {
          create: {
            date: "2025-01-01",
            method: "Efectivo",
            amountCents: 9000,
          },
        },
      },
    });

    await expect(service.summary()).resolves.toMatchObject({
      retailValueCents: 12400,
      wholesaleValueCents: 9800,
      supplierDebtCents: 6000,
      netRetailValueCents: 6400,
      creditValueCents: 600,
    });
  });

  it("updates net stock value after recording, paying and reversing a debt without physical movements", async () => {
    const debts = new SupplierPayablesService(db.prisma as PrismaService);
    const before = await service.summary();
    const debt = await debts.createOpening({
      operationId: "stock-net-opening",
      supplierId: "supplier",
      title: "Mercadería ya recibida",
      amountCents: 4000,
      dueDate: businessToday(),
    });
    await expect(service.summary()).resolves.toMatchObject({
      supplierDebtCents: 4000,
      netRetailValueCents: 8400,
    });

    const payment = await debts.pay(debt.id, {
      operationId: "stock-net-payment",
      date: businessToday(),
      method: "Transferencia",
    });
    await expect(service.summary()).resolves.toMatchObject({
      supplierDebtCents: 0,
      netRetailValueCents: 12400,
    });

    await debts.reversePayment(payment.id, "Pago registrado por error");
    await expect(service.summary()).resolves.toMatchObject({
      supplierDebtCents: 4000,
      netRetailValueCents: 8400,
      physicalStock: before.physicalStock,
      totalValueCents: before.totalValueCents,
      retailValueCents: before.retailValueCents,
      wholesaleValueCents: before.wholesaleValueCents,
    });
    expect(await db.prisma.purchase.count()).toBe(0);
    expect(await db.prisma.stockMovement.count()).toBe(0);
  });

  it("shows a negative net stock value when the debt exceeds the retail valuation", async () => {
    await db.prisma.supplierPayable.create({
      data: {
        supplierId: "supplier",
        title: "Deuda mayor al stock disponible",
        amountCents: 20000,
        dueDate: "2026-01-01",
      },
    });

    await expect(service.summary()).resolves.toMatchObject({
      retailValueCents: 12400,
      supplierDebtCents: 20000,
      netRetailValueCents: -7600,
    });
  });
});
