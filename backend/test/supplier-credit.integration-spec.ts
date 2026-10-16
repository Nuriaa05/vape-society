import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import {
  createSeededTestDatabase,
  SeededTestDatabase,
} from "./prisma-test-database";

describe("supplier credit and physical inventory together", () => {
  let db: SeededTestDatabase;
  let app: INestApplication;
  let serial = 0;
  const operation = () => `supplier-integration-${++serial}`;
  const server = () => app.getHttpServer();
  beforeAll(async () => {
    db = await createSeededTestDatabase();
    process.env.DATABASE_URL = db.url;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await db?.cleanup();
  });
  async function product(stock = 0) {
    const result = await request(server())
      .post("/api/products")
      .send({
        name: `Stock financiado ${operation()}`,
        categoryId: "c0",
        supplierId: "s1",
        costAmountCents: 10001,
        priceAmountCents: 20000,
        marginPct: 100,
        physicalStock: stock,
        minStock: 0,
      })
      .expect(201);
    return result.body.id as string;
  }

  it("registers and retries a paid purchase with its date and no payment method or reference", async () => {
    const productId = await product();
    const input = {
      operationId: operation(),
      supplierId: "s1",
      status: "Registrada",
      paymentCondition: "Pagada",
      paymentDate: "2026-01-15",
      items: [{ productId, qty: 2, unitCostAmountCents: 10001 }],
    };
    const first = await request(server())
      .post("/api/purchases")
      .send(input)
      .expect(201);
    expect(first.body.paymentMethod).toBeNull();
    expect(first.body.paymentReference).toBeNull();
    expect(first.body.payable.payments).toEqual([
      expect.objectContaining({
        date: "2026-01-15",
        amountCents: 20002,
        method: "Sin especificar",
        reference: null,
      }),
    ]);
    const retry = await request(server())
      .post("/api/purchases")
      .send(input)
      .expect(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(retry.body.payable.payments).toHaveLength(1);
    expect(await stock(productId)).toMatchObject({ paidQty: 2, creditQty: 0 });
  });
  async function stock(id: string) {
    return (await request(server()).get("/api/stock").expect(200)).body.find(
      (row: { productId: string }) => row.productId === id,
    );
  }
  async function credit(
    productId: string,
    qty: number,
    extra: Record<string, unknown> = {},
  ) {
    const dto = {
      operationId: operation(),
      supplierId: "s1",
      date: "2026-01-15",
      status: "Registrada",
      paymentCondition: "Credito",
      dueDate: "2026-02-28",
      items: [{ productId, qty, unitCostAmountCents: 10001 }],
      ...extra,
    };
    const result = await request(server())
      .post("/api/purchases")
      .send(dto)
      .expect(201);
    return { dto, purchase: result.body };
  }
  async function account() {
    return (
      await request(server())
        .get("/api/supplier-payables/account/s1")
        .expect(200)
    ).body;
  }

  it("keeps debt for ten while only six credit units remain, and pays/reverses without a stock movement", async () => {
    const id = await product();
    const { dto, purchase } = await credit(id, 10);
    const retry = await request(server())
      .post("/api/purchases")
      .send(dto)
      .expect(201);
    expect(retry.body.id).toBe(purchase.id);
    expect(await stock(id)).toMatchObject({
      physicalStock: 10,
      creditQty: 10,
      creditValueCents: 100010,
    });
    const sale = await request(server())
      .post("/api/sales")
      .send({
        paymentMethodId: "pm2",
        deliveryStatus: "Entregado",
        items: [{ productId: id, qty: 4 }],
      })
      .expect(201);
    const payable = (await account()).payables.find(
      (row: { purchaseId: string }) => row.purchaseId === purchase.id,
    );
    expect(payable).toMatchObject({ balanceCents: 100010, status: "Vencida" });
    expect(await stock(id)).toMatchObject({
      physicalStock: 6,
      creditQty: 6,
      creditValueCents: 60006,
    });
    const movementCount = await db.prisma.stockMovement.count();
    const payDto = {
      operationId: operation(),
      date: "2026-03-01",
      method: "Transferencia",
    };
    const payment = await request(server())
      .post(`/api/supplier-payables/${payable.id}/payments`)
      .send(payDto)
      .expect(201);
    const paymentRetry = await request(server())
      .post(`/api/supplier-payables/${payable.id}/payments`)
      .send(payDto)
      .expect(201);
    expect(paymentRetry.body.id).toBe(payment.body.id);
    expect(await stock(id)).toMatchObject({
      physicalStock: 6,
      paidQty: 6,
      creditQty: 0,
      paidValueCents: 60006,
    });
    expect(await db.prisma.stockMovement.count()).toBe(movementCount);
    await request(server())
      .post(`/api/supplier-payables/${payable.id}/payments`)
      .send({ ...payDto, operationId: operation() })
      .expect(409);
    await request(server())
      .post(`/api/supplier-payables/payments/${payment.body.id}/reverse`)
      .send({ reason: "Importe registrado en cuenta equivocada" })
      .expect(201);
    expect(await stock(id)).toMatchObject({ creditQty: 6, paidQty: 0 });
    await request(server())
      .post(`/api/sales/${sale.body.id}/cancel`)
      .send({ reason: "Cancelación completa" })
      .expect(200);
    expect(await stock(id)).toMatchObject({ physicalStock: 10, creditQty: 10 });
  });

  it("classifies existing units against an older debt without duplicating stock or purchases", async () => {
    const id = await product(6);
    const purchaseCount = await db.prisma.purchase.count();
    const opening = await request(server())
      .post("/api/supplier-payables/opening")
      .send({
        operationId: operation(),
        supplierId: "s1",
        title: "Deuda por diez, quedan seis",
        amountCents: 100010,
        dueDate: "2026-12-31",
      })
      .expect(201);
    const classifyDto = {
      operationId: operation(),
      productId: id,
      qty: 6,
      classification: "Credito",
      unitCostAmountCents: 10001,
      payableId: opening.body.id,
      reason: "Clasificación de stock anterior",
    };
    await request(server())
      .post("/api/stock/classifications")
      .send(classifyDto)
      .expect(201);
    await request(server())
      .post("/api/stock/classifications")
      .send(classifyDto)
      .expect(201);
    expect(await stock(id)).toMatchObject({
      physicalStock: 6,
      creditQty: 6,
      unclassifiedQty: 0,
      totalValueCents: 60006,
    });
    expect(await db.prisma.purchase.count()).toBe(purchaseCount);
    await request(server())
      .post(`/api/supplier-payables/${opening.body.id}/payments`)
      .send({
        operationId: operation(),
        date: "2026-01-20",
        method: "Efectivo",
      })
      .expect(201);
    expect(await stock(id)).toMatchObject({
      physicalStock: 6,
      paidQty: 6,
      creditQty: 0,
    });
  });

  it("keeps drafts inert, receives once and preserves supplier refunds after canceling a paid purchase", async () => {
    const id = await product();
    const { purchase } = await credit(id, 2, {
      status: "Pendiente",
      paymentCondition: "Pagada",
      paymentDate: "2026-01-15",
      paymentMethod: "QR",
    });
    expect(await stock(id)).toMatchObject({ physicalStock: 0, paidQty: 0 });
    expect(
      (await account()).payables.some(
        (row: { purchaseId: string }) => row.purchaseId === purchase.id,
      ),
    ).toBe(false);
    await request(server())
      .post(`/api/purchases/${purchase.id}/register`)
      .send({})
      .expect(200);
    expect(await stock(id)).toMatchObject({
      physicalStock: 2,
      paidQty: 2,
      paidValueCents: 20002,
    });
    await request(server())
      .post(`/api/purchases/${purchase.id}/cancel`)
      .send({ reason: "Proveedor retiró la mercadería" })
      .expect(200);
    const payable = (await account()).payables.find(
      (row: { purchaseId: string }) => row.purchaseId === purchase.id,
    );
    expect(payable).toMatchObject({
      status: "Anulada",
      balanceCents: 0,
      refundPendingCents: 20002,
    });
    expect(await stock(id)).toMatchObject({ physicalStock: 0, paidQty: 0 });
    const refund = await request(server())
      .post(`/api/supplier-payables/${payable.id}/refunds`)
      .send({ operationId: operation(), date: "2026-01-20", method: "QR" })
      .expect(201);
    expect(
      (await account()).payables.find(
        (row: { id: string }) => row.id === payable.id,
      ).refundPendingCents,
    ).toBe(0);
    await request(server())
      .post(`/api/supplier-payables/refunds/${refund.body.id}/reverse`)
      .send({ reason: "Recepción anotada por error" })
      .expect(201);
    expect(
      (await account()).payables.find(
        (row: { id: string }) => row.id === payable.id,
      ).refundPendingCents,
    ).toBe(20002);
  });

  it("uses FIFO for mixed costs and refuses to cancel sold origin units even if a later purchase replenishes stock", async () => {
    const id = await product();
    const first = await credit(id, 3, {
      date: "2026-01-01",
      paymentCondition: "Pagada",
      paymentDate: "2026-01-01",
      paymentMethod: "Efectivo",
      items: [{ productId: id, qty: 3, unitCostAmountCents: 8000 }],
    });
    await credit(id, 5, { date: "2026-01-02" });
    await request(server())
      .post("/api/sales")
      .send({
        paymentMethodId: "pm2",
        deliveryStatus: "Entregado",
        items: [{ productId: id, qty: 4 }],
      })
      .expect(201);
    expect(await stock(id)).toMatchObject({
      physicalStock: 4,
      paidQty: 0,
      creditQty: 4,
      creditValueCents: 40004,
    });
    await request(server())
      .post(`/api/purchases/${first.purchase.id}/cancel`)
      .send({ reason: "No debería permitirlo" })
      .expect(409);
    await request(server())
      .patch(`/api/products/${id}`)
      .send({ costAmountCents: 99999 })
      .expect(200);
    expect(await stock(id)).toMatchObject({ totalValueCents: 40004 });
  });

  it("preserves the explicit negative-stock override and restores only physically available units", async () => {
    const id = await product(2);
    const sale = await request(server())
      .post("/api/sales")
      .send({
        paymentMethodId: "pm2",
        deliveryStatus: "Entregado",
        allowNegativeStock: true,
        items: [{ productId: id, qty: 5 }],
      })
      .expect(201);
    expect(await stock(id)).toMatchObject({
      physicalStock: -3,
      unclassifiedQty: 0,
    });
    await request(server())
      .post(`/api/sales/${sale.body.id}/cancel`)
      .send({ reason: "Corregir egreso" })
      .expect(200);
    expect(await stock(id)).toMatchObject({
      physicalStock: 2,
      unclassifiedQty: 2,
    });
  });

  it("keeps a deleted draft operation as a retry tombstone without resurrecting a purchase", async () => {
    const id = await product();
    const { dto, purchase } = await credit(id, 1, { status: "Pendiente" });
    await request(server()).delete(`/api/purchases/${purchase.id}`).expect(200);
    await request(server()).post("/api/purchases").send(dto).expect(409);
    expect(await stock(id)).toMatchObject({ physicalStock: 0 });
  });

  it("preserves credit provenance when two negative-stock sales are canceled in order", async () => {
    const id = await product();
    const { purchase } = await credit(id, 1);
    const sales = [];
    for (let i = 0; i < 2; i++)
      sales.push(
        (
          await request(server())
            .post("/api/sales")
            .send({
              paymentMethodId: "pm2",
              deliveryStatus: "Entregado",
              allowNegativeStock: true,
              items: [{ productId: id, qty: 1 }],
            })
            .expect(201)
        ).body,
      );
    for (const sale of sales)
      await request(server())
        .post(`/api/sales/${sale.id}/cancel`)
        .send({ reason: "Corregir venta" })
        .expect(200);
    expect(await stock(id)).toMatchObject({
      physicalStock: 1,
      creditQty: 1,
      unclassifiedQty: 0,
      creditValueCents: 10001,
    });
    await request(server())
      .post(`/api/purchases/${purchase.id}/cancel`)
      .send({ reason: "Compra devuelta" })
      .expect(200);
  });

  it("links later replenishment to a negative sale so cancellation restores the actual purchase cost", async () => {
    const id = await product();
    const sale = (
      await request(server())
        .post("/api/sales")
        .send({
          paymentMethodId: "pm2",
          deliveryStatus: "Entregado",
          allowNegativeStock: true,
          items: [{ productId: id, qty: 2 }],
        })
        .expect(201)
    ).body;
    await credit(id, 3);
    expect(await stock(id)).toMatchObject({ physicalStock: 1, creditQty: 1 });
    await request(server())
      .post(`/api/sales/${sale.id}/cancel`)
      .send({ reason: "Corregir venta" })
      .expect(200);
    expect(await stock(id)).toMatchObject({
      physicalStock: 3,
      creditQty: 3,
      unclassifiedQty: 0,
      creditValueCents: 30003,
    });
  });

  it("does not assign new stock to historical sales whose origin was never tracked", async () => {
    const id = await product(1);
    const old = (
      await request(server())
        .post("/api/sales")
        .send({
          paymentMethodId: "pm2",
          deliveryStatus: "Entregado",
          items: [{ productId: id, qty: 1 }],
        })
        .expect(201)
    ).body;
    const oldMovement = await db.prisma.stockMovement.findFirstOrThrow({
      where: { sourceType: "Sale", sourceId: old.id },
    });
    await db.prisma.inventoryAllocation.deleteMany({
      where: { stockMovementId: oldMovement.id },
    });
    await db.prisma.inventoryLot.deleteMany({ where: { productId: id } });
    const negative = (
      await request(server())
        .post("/api/sales")
        .send({
          paymentMethodId: "pm2",
          deliveryStatus: "Entregado",
          allowNegativeStock: true,
          items: [{ productId: id, qty: 2 }],
        })
        .expect(201)
    ).body;
    await credit(id, 3);
    await request(server())
      .post(`/api/sales/${negative.id}/cancel`)
      .send({ reason: "Corregir venta" })
      .expect(200);
    expect(await stock(id)).toMatchObject({
      physicalStock: 3,
      creditQty: 3,
      unclassifiedQty: 0,
    });
    expect(
      await db.prisma.inventoryAllocation.count({
        where: { stockMovementId: oldMovement.id },
      }),
    ).toBe(0);
  });
});
