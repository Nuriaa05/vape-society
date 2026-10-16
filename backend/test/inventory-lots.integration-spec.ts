import { ConflictException } from "@nestjs/common";
import { InventoryLotsService } from "../src/domain/inventory-lots.service";
import { StockRulesService } from "../src/domain/stock-rules.service";
import { StockService } from "../src/modules/stock/stock.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("inventory lot integrity", () => {
  let db: SeededTestDatabase;
  const lots = new InventoryLotsService();
  let stock: StockService;
  beforeEach(async () => {
    db = await createSeededTestDatabase();
    stock = new StockService(
      db.prisma as PrismaService,
      new StockRulesService(db.prisma as PrismaService),
    );
  });
  afterEach(async () => {
    if (db) await db.cleanup();
  });

  it("preserves each original arrival date when classification spans several lots", async () => {
    await db.prisma.inventoryLot.updateMany({
      where: { productId: "p1" },
      data: { receivedAt: new Date("2020-01-01") },
    });
    const inbound = await stock.createAdjustment({
      productId: "p1",
      type: "Ingreso",
      qty: 2,
    });
    await db.prisma.inventoryLot.updateMany({
      where: { originMovementId: inbound.id },
      data: { receivedAt: new Date("2022-01-01") },
    });
    const middle = await db.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: "p1" },
        data: { physicalStock: { increment: 2 } },
      });
      return lots.receive(tx, {
        productId: "p1",
        qty: 2,
        unitCostAmountCents: 20,
        classification: "Pagada",
        receivedAt: new Date("2021-01-01"),
      });
    });
    const input = {
      operationId: "classify-spanning",
      productId: "p1",
      qty: 25,
      classification: "Pagada" as const,
      unitCostAmountCents: 100,
      reason: "Revisar inventario",
    };
    const classification = await stock.classify(input);
    expect(
      await db.prisma.inventoryLot.findMany({
        where: { originMovementId: classification.id },
        orderBy: { receivedAt: "asc" },
        select: { initialQty: true, receivedAt: true },
      }),
    ).toEqual([
      { initialQty: 24, receivedAt: new Date("2020-01-01") },
      { initialQty: 1, receivedAt: new Date("2022-01-01") },
    ]);
    await stock.reverseMovement(classification.id, {
      reason: "Corregir clasificación",
    });
    expect(
      (await stock.findAll()).find((row) => row.productId === "p1"),
    ).toMatchObject({ physicalStock: 28, unclassifiedQty: 26, paidQty: 2 });
    await stock.classify({ ...input, operationId: "classify-spanning-again" });
    await stock.createAdjustment({ productId: "p1", type: "Egreso", qty: 24 });
    expect(
      await db.prisma.inventoryLot.findUnique({ where: { id: middle.id } }),
    ).toMatchObject({ remainingQty: 2 });
  });

  it("consumes FIFO acquisition costs and restores the same lots on adjustment reversal", async () => {
    await db.prisma.inventoryLot.deleteMany({ where: { productId: "p1" } });
    await db.prisma.$transaction(async (tx) => {
      await lots.receive(tx, {
        productId: "p1",
        qty: 2,
        unitCostAmountCents: 100,
        classification: "Pagada",
        receivedAt: new Date("2020-01-01"),
      });
      await lots.receive(tx, {
        productId: "p1",
        qty: 22,
        unitCostAmountCents: 200,
        classification: "Credito",
        receivedAt: new Date("2021-01-01"),
      });
    });
    const movement = await stock.createAdjustment({
      productId: "p1",
      type: "Egreso",
      qty: 3,
    });
    expect(
      (await stock.findAll()).find((r) => r.productId === "p1"),
    ).toMatchObject({
      paidQty: 0,
      creditQty: 21,
      creditValueCents: 4200,
      totalValueCents: 4200,
    });
    await stock.reverseMovement(movement.id);
    expect(
      (await stock.findAll()).find((r) => r.productId === "p1"),
    ).toMatchObject({ paidQty: 2, creditQty: 22, totalValueCents: 4600 });
  });

  it("blocks inbound reversal after source units were consumed even when newer stock exists", async () => {
    const inbound = await stock.createAdjustment({
      productId: "p1",
      type: "Ingreso",
      qty: 2,
    });
    const source = await db.prisma.inventoryLot.findFirstOrThrow({
      where: { originMovementId: inbound.id },
    });
    await db.prisma.inventoryLot.updateMany({
      where: { productId: "p1" },
      data: { receivedAt: new Date("2030-01-01") },
    });
    await db.prisma.inventoryLot.update({
      where: { id: source.id },
      data: { receivedAt: new Date("2000-01-01") },
    });
    await stock.createAdjustment({ productId: "p1", type: "Egreso", qty: 1 });
    await stock.createAdjustment({ productId: "p1", type: "Ingreso", qty: 5 });
    await expect(stock.reverseMovement(inbound.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(
      (await db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } }))
        .physicalStock,
    ).toBe(30);
  });

  it("classifies unclassified units once without changing physical stock and keeps captured cost", async () => {
    const dto = {
      operationId: "classify-1",
      productId: "p1",
      qty: 3,
      classification: "Pagada" as const,
      unitCostAmountCents: 123,
      reason: "Saldo inicial",
    };
    const first = await stock.classify(dto);
    const retry = await stock.classify(dto);
    expect(retry.id).toBe(first.id);
    const row = (await stock.findAll()).find((r) => r.productId === "p1");
    expect(row).toMatchObject({
      physicalStock: 24,
      paidQty: 3,
      paidValueCents: 369,
      unclassifiedQty: 21,
    });
    expect(
      await db.prisma.stockMovement.count({
        where: { sourceType: "StockClassification" },
      }),
    ).toBe(1);
    await expect(stock.classify({ ...dto, qty: 4 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("reverses an intact classification without changing physical stock and restores original unclassified costs", async () => {
    const classification = await stock.classify({
      operationId: "classify-reverse",
      productId: "p1",
      qty: 3,
      classification: "Pagada",
      unitCostAmountCents: 123,
      reason: "Saldo inicial",
    });
    const reversal = await stock.reverseMovement(classification.id, {
      reason: "Importe incorrecto",
    });
    expect(reversal).toMatchObject({
      qty: 0,
      reversalOf: classification.id,
      sourceType: "StockClassification",
    });
    expect(
      (await stock.findAll()).find((row) => row.productId === "p1"),
    ).toMatchObject({
      physicalStock: 24,
      paidQty: 0,
      unclassifiedQty: 24,
      unclassifiedValueCents: 24 * 185000,
    });
    await expect(
      stock.reverseMovement(classification.id, { reason: "Duplicado" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("receives only positive on-hand units when an adjustment clears negative legacy stock", async () => {
    await db.prisma.inventoryLot.deleteMany({ where: { productId: "p1" } });
    await db.prisma.product.update({
      where: { id: "p1" },
      data: { physicalStock: -3 },
    });
    await stock.createAdjustment({ productId: "p1", type: "Ingreso", qty: 10 });
    expect(
      (await stock.findAll()).find((row) => row.productId === "p1"),
    ).toMatchObject({ physicalStock: 7, unclassifiedQty: 7 });
  });

  it("rejects credit classification without an active unpaid obligation", async () => {
    await expect(
      stock.classify({
        operationId: "classify-credit",
        productId: "p1",
        qty: 1,
        classification: "Credito",
        unitCostAmountCents: 123,
        reason: "Saldo inicial",
        payableId: "missing",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("legacy inbound reversal consumes only unclassified lots", async () => {
    await db.prisma.inventoryLot.updateMany({
      where: { productId: "p1" },
      data: { classification: "Pagada" },
    });
    const movement = await db.prisma.stockMovement.create({
      data: {
        productId: "p1",
        type: "Ajuste",
        sourceType: "ManualAdjustment",
        sourceId: "legacy",
        physicalDelta: 2,
      },
    });
    await expect(stock.reverseMovement(movement.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(
      (await db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } }))
        .physicalStock,
    ).toBe(24);
  });
});
