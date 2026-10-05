import { BadRequestException, ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { StockRulesService } from "../src/domain/stock-rules.service";
import { StockService } from "../src/modules/stock/stock.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("StockService", () => {
  let db: SeededTestDatabase;
  let service: StockService;

  beforeEach(async () => {
    db = await createSeededTestDatabase();

    const moduleRef = await Test.createTestingModule({
      providers: [
        StockService,
        StockRulesService,
        {
          provide: PrismaService,
          useValue: db.prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(StockService);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("returns stock rows with product identity and computed availability", async () => {
    await db.prisma.sale.create({
      data: {
      paymentMethodName: ({ pm1: "Efectivo", pm2: "Transferencia", pm3: "Tarjeta" } as Record<string, string>)["pm1"] ?? "Efectivo",
        id: "sale-stock-service",
        number: "000910",
        deliveryStatus: "Pendiente",
        status: "Confirmada",
        paymentMethodId: "pm1",
        subtotalAmountCents: 1000,
        totalAmountCents: 1000,
        items: {
          create: {
            productId: "p5",
            productName: "Empanadas de carne x12",
            barcode: "7790001000055",
            qty: 2,
            unitPriceAmountCents: 419000,
            lineTotalAmountCents: 838000,
          },
        },
      },
    });

    const rows = await service.findAll();
    const product = rows.find((row) => row.productId === "p5");

    expect(product).toMatchObject({
      productId: "p5",
      barcode: "7790001000055",
      productName: "Empanadas de carne x12",
      physicalStock: 14,
      reservedStock: 2,
      availableStock: 12,
      minStock: 5,
    });
  });

  it("returns physical stock movement audit rows with product names", async () => {
    await db.prisma.stockMovement.create({
      data: {
        productId: "p3",
        type: "Compra",
        sourceType: "Purchase",
        sourceId: "purchase-test",
        physicalDelta: 30,
        note: "Compra inicial",
      },
    });

    const movements = await service.findMovements();

    expect(movements[0]).toMatchObject({
      productId: "p3",
      productName: "Papas prefritas baston 1kg",
      type: "Compra",
      qty: 30,
      sourceType: "Purchase",
      sourceId: "purchase-test",
      note: "Compra inicial",
    });
  });

  it("allows manual stock adjustments without an audit reason", async () => {
    const movement = await service.createAdjustment({
      productId: "p1",
      type: "Ingreso",
      qty: 1,
      reason: "   ",
    });

    expect(movement).toMatchObject({
      productId: "p1",
      type: "Ajuste",
      qty: 1,
      note: null,
    });
  });

  it("creates manual ingreso adjustments, increases physical stock and writes audit movement", async () => {
    const movement = await service.createAdjustment({
      productId: "p1",
      type: "Ingreso",
      qty: 5,
      reason: "Conteo de camara",
    });

    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } }),
    ).resolves.toMatchObject({ physicalStock: 29 });
    expect(movement).toMatchObject({
      productId: "p1",
      type: "Ajuste",
      qty: 5,
      sourceType: "ManualAdjustment",
      note: "Conteo de camara",
    });
  });

  it("creates manual egreso adjustments and rejects ones that would leave available stock negative", async () => {
    await db.prisma.sale.create({
      data: {
      paymentMethodName: ({ pm1: "Efectivo", pm2: "Transferencia", pm3: "Tarjeta" } as Record<string, string>)["pm1"] ?? "Efectivo",
        id: "reserved-for-adjustment",
        number: "000930",
        deliveryStatus: "Pendiente",
        status: "Confirmada",
        paymentMethodId: "pm1",
        subtotalAmountCents: 1000,
        totalAmountCents: 1000,
        items: {
          create: {
            productId: "p1",
            productName: "Hamburguesas de carne x4",
            barcode: "7790001000017",
            qty: 20,
            unitPriceAmountCents: 268000,
            lineTotalAmountCents: 5360000,
          },
        },
      },
    });

    await service.createAdjustment({
      productId: "p1",
      type: "Egreso",
      qty: 4,
      reason: "Merma real",
    });

    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } }),
    ).resolves.toMatchObject({ physicalStock: 20 });

    await expect(
      service.createAdjustment({
        productId: "p1",
        type: "Egreso",
        qty: 1,
        reason: "No disponible",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("creates physical count adjustments with calculated delta", async () => {
    const movement = await service.createAdjustment({
      productId: "p3",
      type: "ConteoFisico",
      physicalStock: 20,
      reason: "Conteo físico semanal",
    });

    expect(movement).toMatchObject({
      productId: "p3",
      type: "Ajuste",
      qty: -12,
      sourceType: "ManualAdjustment",
      note: "Conteo físico semanal",
    });
    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p3" } }),
    ).resolves.toMatchObject({ physicalStock: 20 });
  });

  it("reverses only manual adjustments once and writes the opposite movement", async () => {
    const adjustment = await service.createAdjustment({
      productId: "p1",
      type: "Ingreso",
      qty: 5,
      reason: "Ingreso manual",
    });

    const reversal = await service.reverseMovement(adjustment.id, {
      reason: "Carga duplicada",
    });

    expect(reversal).toMatchObject({
      productId: "p1",
      type: "Reverso",
      qty: -5,
      sourceType: "ManualAdjustment",
      reversalOf: adjustment.id,
      note: "Carga duplicada",
    });
    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } }),
    ).resolves.toMatchObject({ physicalStock: 24 });

    await expect(
      service.reverseMovement(adjustment.id, { reason: "Otra vez" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects reversal of sale and purchase movements", async () => {
    const saleMovement = await db.prisma.stockMovement.create({
      data: {
        productId: "p1",
        type: "Venta",
        sourceType: "Sale",
        sourceId: "sale-id",
        physicalDelta: -1,
      },
    });
    const purchaseMovement = await db.prisma.stockMovement.create({
      data: {
        productId: "p1",
        type: "Compra",
        sourceType: "Purchase",
        sourceId: "purchase-id",
        physicalDelta: 1,
      },
    });

    await expect(
      service.reverseMovement(saleMovement.id, { reason: "No manual" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reverseMovement(purchaseMovement.id, { reason: "No manual" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
