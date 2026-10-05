import { Test } from "@nestjs/testing";

import { StockRulesService } from "../src/domain/stock-rules.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("StockRulesService", () => {
  let db: SeededTestDatabase;
  let service: StockRulesService;

  beforeEach(async () => {
    db = await createSeededTestDatabase();

    const moduleRef = await Test.createTestingModule({
      providers: [
        StockRulesService,
        {
          provide: PrismaService,
          useValue: db.prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(StockRulesService);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("calculates reserved stock from active pending sales only", async () => {
    await createSale("pending-1", "000901", "Pendiente", "Confirmada", [
      { productId: "p1", qty: 5 },
      { productId: "p2", qty: 1 },
    ]);
    await createSale("pending-2", "000902", "Pendiente", "Confirmada", [
      { productId: "p1", qty: 3 },
    ]);
    await createSale("delivered", "000903", "Entregado", "Confirmada", [
      { productId: "p1", qty: 4 },
    ]);
    await createSale("cancelled", "000904", "Pendiente", "Anulada", [
      { productId: "p1", qty: 7 },
    ]);

    await expect(service.getReservedStockByProductIds(["p1", "p2"])).resolves.toEqual(
      new Map([
        ["p1", 8],
        ["p2", 1],
      ]),
    );
  });

  it("calculates available stock as physical minus reserved without using StockMovement", async () => {
    await createSale("pending-1", "000905", "Pendiente", "Confirmada", [
      { productId: "p1", qty: 8 },
    ]);
    await db.prisma.stockMovement.create({
      data: {
        productId: "p1",
        type: "Ajuste",
        sourceType: "ManualAdjustment",
        sourceId: "manual-test",
        physicalDelta: -99,
        note: "No debe afectar reservas",
      },
    });

    const stock = await service.getStockForProducts(["p1"]);

    expect(stock).toHaveLength(1);
    expect(stock[0]).toMatchObject({
      productId: "p1",
      physicalStock: 24,
      reservedStock: 8,
      availableStock: 16,
    });
  });

  async function createSale(
    id: string,
    number: string,
    deliveryStatus: "Pendiente" | "Entregado",
    status: "Confirmada" | "Anulada",
    items: Array<{ productId: string; qty: number }>,
  ): Promise<void> {
    await db.prisma.sale.create({
      data: {
      paymentMethodName: ({ pm1: "Efectivo", pm2: "Transferencia", pm3: "Tarjeta" } as Record<string, string>)["pm1"] ?? "Efectivo",
        id,
        number,
        deliveryStatus,
        status,
        paymentMethodId: "pm1",
        subtotalAmountCents: 1000,
        totalAmountCents: 1000,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            productName: `Producto ${item.productId}`,
            barcode: `barcode-${item.productId}`,
            qty: item.qty,
            unitPriceAmountCents: 1000,
            lineTotalAmountCents: item.qty * 1000,
          })),
        },
      },
    });
  }
});
