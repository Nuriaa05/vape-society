import { StockRulesService } from "../src/domain/stock-rules.service";
import { PurchasesService } from "../src/modules/purchases/purchases.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { SupplierPayablesService } from "../src/modules/supplier-payables/supplier-payables.service";
import { InventoryLotsService } from "../src/domain/inventory-lots.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("supplier purchase financing", () => {
  let db: SeededTestDatabase;
  let purchases: PurchasesService;
  let payables: SupplierPayablesService;
  beforeEach(async () => {
    db = await createSeededTestDatabase();
    const prisma = db.prisma as PrismaService;
    purchases = new PurchasesService(prisma, new StockRulesService(prisma));
    payables = new SupplierPayablesService(prisma);
  });
  afterEach(async () => db.cleanup());

  it("registers credit purchases as supplier debt and retries without receiving stock twice", async () => {
    const input = {
      operationId: "purchase-credit-1",
      supplierId: "s1",
      status: "Registrada" as const,
      paymentCondition: "Credito" as const,
      dueDate: "2026-12-10",
      items: [{ productId: "p1", qty: 2, unitCostAmountCents: 1000 }],
    };
    const first = await purchases.create(input);
    expect(first).toMatchObject({
      paymentCondition: "Credito",
      payable: { amountCents: 2000 },
    });
    const retry = await purchases.create(input);
    expect(retry.id).toBe(first.id);
  });

  it("rejects financing details on a legacy draft unless its payment condition is selected", async () => {
    const draft = await purchases.create({
      supplierId: "s1",
      status: "Pendiente",
      items: [{ productId: "p1", qty: 1, unitCostAmountCents: 1000 }],
    });
    await expect(
      purchases.update(draft.id, { dueDate: "2026-12-10" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("stores an incomplete paid draft but rejects registration atomically until payment details are complete", async () => {
    const draft = await purchases.create({
      operationId: "draft-paid",
      paymentCondition: "Pagada",
      supplierId: "s1",
      status: "Pendiente",
      items: [{ productId: "p1", qty: 1, unitCostAmountCents: 1000 }],
    });
    await expect(purchases.register(draft.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await db.prisma.supplierPayable.count()).toBe(0);
    expect(await db.prisma.stockMovement.count()).toBe(0);
    await purchases.update(draft.id, {
      paymentDate: "2026-01-10",
      paymentMethod: "Efectivo",
    });
    const registered = await purchases.register(draft.id);
    expect(registered.payable?.payments).toHaveLength(1);
    expect(registered.payable?.payments[0].amountCents).toBe(1000);
    await expect(purchases.register(draft.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("preserves paid opening debt and refunds through cancellation and reversal without touching stock", async () => {
    const opening = await payables.createOpening({
      operationId: "opening",
      supplierId: "s1",
      title: "Saldo anterior",
      amountCents: 401,
      dueDate: "2026-01-01",
    });
    const paymentInput = {
      operationId: "payment",
      date: "2026-01-02",
      method: "Transferencia",
    };
    const payment = await payables.pay(opening.id, paymentInput);
    expect((await payables.pay(opening.id, paymentInput)).id).toBe(payment.id);
    await expect(
      payables.pay(opening.id, {
        ...paymentInput,
        operationId: "second-payment",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await payables.cancel(opening.id, "Deuda errónea")).toMatchObject({
      balanceCents: 0,
      refundPendingCents: 401,
      status: "Anulada",
    });
    await expect(
      payables.reversePayment(payment.id, "Corregir"),
    ).rejects.toBeInstanceOf(ConflictException);
    const refundInput = {
      operationId: "refund",
      date: "2026-01-03",
      method: "Efectivo",
    };
    const refund = await payables.refund(opening.id, refundInput);
    expect((await payables.refund(opening.id, refundInput)).id).toBe(refund.id);
    expect((await payables.account("s1")).refundPendingCents).toBe(0);
    expect(
      await payables.reverseRefund(refund.id, "Registro incorrecto"),
    ).toMatchObject({ refundPendingCents: 401 });
    expect(await db.prisma.supplierPayment.count()).toBe(1);
    expect(await db.prisma.supplierRefund.count()).toBe(1);
    expect(await db.prisma.stockMovement.count()).toBe(0);
    expect(await db.prisma.purchase.count()).toBe(0);
  });

  it("validates operation collisions, real calendar dates, payment dates and full summary independent of pagination", async () => {
    const input = {
      operationId: "opening-one",
      supplierId: "s1",
      title: "Uno",
      amountCents: 101,
      dueDate: "2026-01-01",
    };
    const one = await payables.createOpening(input);
    await expect(
      payables.createOpening({ ...input, amountCents: 102 }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      payables.createOpening({
        ...input,
        operationId: "invalid-date",
        dueDate: "2026-02-30",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      payables.pay(one.id, {
        operationId: "future-pay",
        date: "2099-01-01",
        method: "QR",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await payables.createOpening({
      ...input,
      operationId: "opening-two",
      title: "Dos",
      amountCents: 202,
    });
    expect(await payables.findAll({ take: 1 })).toMatchObject({
      total: 2,
      hasMore: true,
    });
    expect(await payables.summary({ take: 1, month: "2026-01" })).toMatchObject(
      { balanceCents: 303, overdueCents: 303, dueThisMonthCents: 303 },
    );
  });

  it("summarizes all debt while selecting supplier payments by their actual month", async () => {
    const paid = await payables.createOpening({
      operationId: "month-paid",
      supplierId: "s1",
      title: "Pagada",
      amountCents: 100,
      dueDate: "2026-12-01",
    });
    await payables.pay(paid.id, {
      operationId: "january-payment",
      date: "2026-01-02",
      method: "QR",
    });
    await payables.createOpening({
      operationId: "month-unpaid",
      supplierId: "s1",
      title: "Pendiente",
      amountCents: 200,
      dueDate: "2026-11-01",
    });
    expect(
      await payables.summary({ supplierId: "s1", month: "2026-01" }),
    ).toMatchObject({
      balanceCents: 200,
      paidAmountCents: 100,
      dueThisMonthCents: 0,
    });
    expect(
      await payables.summary({ supplierId: "s1", month: "2026-02" }),
    ).toMatchObject({ balanceCents: 200, paidAmountCents: 0 });
  });

  it("blocks opening cancellation even after its credit units have been sold, because sale reversal could restore them", async () => {
    const opening = await payables.createOpening({
      operationId: "opening-stock",
      supplierId: "s1",
      title: "Stock anterior",
      amountCents: 100,
      dueDate: "2026-12-01",
    });
    await db.prisma.$transaction(async (tx) => {
      const origin = await tx.stockMovement.create({
        data: {
          productId: "p1",
          type: "Clasificacion",
          sourceType: "StockClassification",
          sourceId: "classification",
          physicalDelta: 0,
        },
      });
      const lot = await new InventoryLotsService().receive(tx, {
        productId: "p1",
        qty: 1,
        unitCostAmountCents: 100,
        payableId: opening.id,
        originMovementId: origin.id,
        classification: "Credito",
      });
      const sale = await tx.stockMovement.create({
        data: {
          productId: "p1",
          type: "Venta",
          sourceType: "Sale",
          sourceId: "sale",
          physicalDelta: -1,
        },
      });
      await tx.inventoryLot.update({
        where: { id: lot.id },
        data: { remainingQty: 0 },
      });
      await tx.inventoryAllocation.create({
        data: { lotId: lot.id, stockMovementId: sale.id, qty: -1 },
      });
    });
    await expect(
      payables.cancel(opening.id, "Anular deuda"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("absorbs inherited negative stock without inventing available units or reducing the full purchase debt", async () => {
    await db.prisma.inventoryLot.deleteMany({ where: { productId: "p1" } });
    await db.prisma.product.update({
      where: { id: "p1" },
      data: { physicalStock: -3 },
    });
    const purchase = await purchases.create({
      operationId: "negative-stock",
      supplierId: "s1",
      status: "Registrada",
      paymentCondition: "Credito",
      dueDate: "2026-12-01",
      items: [{ productId: "p1", qty: 5, unitCostAmountCents: 100 }],
    });
    expect(purchase.payable).toMatchObject({
      amountCents: 500,
      balanceCents: 500,
    });
    expect(
      await db.prisma.inventoryLot.aggregate({
        where: { productId: "p1" },
        _sum: { remainingQty: true },
      }),
    ).toMatchObject({ _sum: { remainingQty: 2 } });
  });
});
