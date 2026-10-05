import { BadRequestException, ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { StockRulesService } from "../src/domain/stock-rules.service";
import { PurchasesService } from "../src/modules/purchases/purchases.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("PurchasesService", () => {
  let db: SeededTestDatabase;
  let service: PurchasesService;

  beforeEach(async () => {
    db = await createSeededTestDatabase();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasesService,
        StockRulesService,
        {
          provide: PrismaService,
          useValue: db.prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(PurchasesService);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("creates a pending purchase without changing physical stock or movements", async () => {
    const purchase = await service.create({
      supplierId: "s1",
      status: "Pendiente",
      items: [{ productId: "p1", qty: 4, unitCostAmountCents: 185000 }],
    });

    expect(purchase).toMatchObject({
      supplierId: "s1",
      status: "Pendiente",
      totalAmountCents: 740000,
    });
    expect(purchase.items).toEqual([
      expect.objectContaining({
        productId: "p1",
        qty: 4,
        unitCostAmountCents: 185000,
        lineTotalAmountCents: 740000,
      }),
    ]);
    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } }),
    ).resolves.toMatchObject({ physicalStock: 24 });
    await expect(db.prisma.stockMovement.count()).resolves.toBe(0);
  });

  it("rejects new purchases from inactive suppliers", async () => {
    await expect(
      service.create({
        supplierId: "s4",
        status: "Pendiente",
        items: [{ productId: "p1", qty: 1, unitCostAmountCents: 185000 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("creates a registered purchase, increases physical stock, and writes stock movements", async () => {
    const purchase = await service.create({
      supplierId: "s2",
      status: "Registrada",
      items: [{ productId: "p3", qty: 6, unitCostAmountCents: 145000 }],
    });

    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p3" } }),
    ).resolves.toMatchObject({ physicalStock: 38 });
    await expect(db.prisma.stockMovement.findMany()).resolves.toEqual([
      expect.objectContaining({
        productId: "p3",
        type: "Compra",
        sourceType: "Purchase",
        sourceId: purchase.id,
        physicalDelta: 6,
      }),
    ]);
  });

  it("updates supplier last purchase when a purchase is registered", async () => {
    await service.create({
      supplierId: "s2",
      date: "2026-06-20",
      status: "Registrada",
      items: [{ productId: "p3", qty: 1, unitCostAmountCents: 145000 }],
    });

    await expect(
      db.prisma.supplier.findUniqueOrThrow({ where: { id: "s2" } }),
    ).resolves.toMatchObject({
      lastPurchase: new Date("2026-06-20T00:00:00.000Z"),
    });
  });

  it("recalculates supplier last purchase when the latest registered purchase is cancelled", async () => {
    const older = await service.create({
      supplierId: "s2",
      date: "2026-06-10",
      status: "Registrada",
      items: [{ productId: "p3", qty: 1, unitCostAmountCents: 145000 }],
    });
    const latest = await service.create({
      supplierId: "s2",
      date: "2026-06-22",
      status: "Registrada",
      items: [{ productId: "p4", qty: 1, unitCostAmountCents: 118000 }],
    });

    await service.cancel(latest.id, { reason: "" });

    await expect(
      db.prisma.supplier.findUniqueOrThrow({ where: { id: "s2" } }),
    ).resolves.toMatchObject({
      lastPurchase: new Date("2026-06-10T00:00:00.000Z"),
    });

    await service.cancel(older.id, { reason: "" });

    await expect(
      db.prisma.supplier.findUniqueOrThrow({ where: { id: "s2" } }),
    ).resolves.toMatchObject({ lastPurchase: null });
  });

  it("rejects purchase items with zero unit cost", async () => {
    await expect(
      service.create({
        supplierId: "s1",
        status: "Pendiente",
        items: [{ productId: "p1", qty: 1, unitCostAmountCents: 0 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("registers a pending purchase exactly once", async () => {
    const purchase = await service.create({
      supplierId: "s3",
      status: "Pendiente",
      items: [{ productId: "p7", qty: 5, unitCostAmountCents: 210000 }],
    });

    const registered = await service.register(purchase.id);

    expect(registered.status).toBe("Registrada");
    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p7" } }),
    ).resolves.toMatchObject({ physicalStock: 26 });
    await expect(service.register(purchase.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(db.prisma.stockMovement.count()).resolves.toBe(1);
  });

  it("cancels pending purchases without changing physical stock", async () => {
    const purchase = await service.create({
      supplierId: "s1",
      status: "Pendiente",
      items: [{ productId: "p2", qty: 3, unitCostAmountCents: 320000 }],
    });

    const cancelled = await service.cancel(purchase.id, {
      reason: "Error de carga",
    });

    expect(cancelled).toMatchObject({
      status: "Anulada",
      cancelReason: "Error de carga",
    });
    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p2" } }),
    ).resolves.toMatchObject({ physicalStock: 18 });
    await expect(db.prisma.stockMovement.count()).resolves.toBe(0);
  });

  it("normalizes empty purchase cancellation reason to null", async () => {
    const purchase = await service.create({
      supplierId: "s1",
      status: "Pendiente",
      items: [{ productId: "p2", qty: 1, unitCostAmountCents: 320000 }],
    });

    const cancelled = await service.cancel(purchase.id, { reason: "" });

    expect(cancelled).toMatchObject({
      status: "Anulada",
      cancelReason: null,
    });
  });

  it("cancels registered purchases, reverses physical stock, and writes reversal movements", async () => {
    const purchase = await service.create({
      supplierId: "s1",
      status: "Registrada",
      items: [{ productId: "p5", qty: 4, unitCostAmountCents: 295000 }],
    });

    await service.cancel(purchase.id, { reason: "Proveedor corrige remito" });

    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p5" } }),
    ).resolves.toMatchObject({ physicalStock: 14 });
    await expect(db.prisma.stockMovement.findMany()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: "p5",
          type: "Compra",
          sourceType: "Purchase",
          sourceId: purchase.id,
          physicalDelta: 4,
        }),
        expect.objectContaining({
          productId: "p5",
          type: "Reverso",
          sourceType: "Purchase",
          sourceId: purchase.id,
          physicalDelta: -4,
        }),
      ]),
    );
  });

  it("rejects cancelling registered purchases when the reversal would make available stock negative", async () => {
    const purchase = await service.create({
      supplierId: "s1",
      status: "Registrada",
      items: [{ productId: "p8", qty: 5, unitCostAmountCents: 280000 }],
    });

    await db.prisma.sale.create({
      data: {
        number: "999001",
        deliveryStatus: "Pendiente",
        status: "Confirmada",
        paymentMethodId: "pm1",
        subtotalAmountCents: 2100000,
        totalAmountCents: 2100000,
        items: {
          create: {
            productId: "p8",
            productName: "Provoletas con orégano x4",
            barcode: "7790001000086",
            qty: 7,
            unitPriceAmountCents: 300000,
            lineTotalAmountCents: 2100000,
          },
        },
      },
    });

    await expect(
      service.cancel(purchase.id, { reason: "Error" }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p8" } }),
    ).resolves.toMatchObject({ physicalStock: 8 });
    await expect(
      db.prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } }),
    ).resolves.toMatchObject({ status: "Registrada" });
  });

  it("hard-deletes only pending purchase drafts", async () => {
    const pending = await service.create({
      supplierId: "s1",
      status: "Pendiente",
      items: [{ productId: "p10", qty: 2, unitCostAmountCents: 162000 }],
    });
    const registered = await service.create({
      supplierId: "s1",
      status: "Registrada",
      items: [{ productId: "p10", qty: 1, unitCostAmountCents: 162000 }],
    });

    await expect(service.deleteDraft(pending.id)).resolves.toEqual({
      id: pending.id,
      deleted: true,
    });
    await expect(
      db.prisma.purchase.findUnique({ where: { id: pending.id } }),
    ).resolves.toBeNull();
    await expect(service.deleteDraft(registered.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
