import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import {
  createSeededTestDatabase,
  SeededTestDatabase,
} from "./prisma-test-database";

describe("tracked financed sales", () => {
  let db: SeededTestDatabase;
  let app: INestApplication;
  let customerId: string;
  beforeAll(async () => {
    db = await createSeededTestDatabase();
    process.env.DATABASE_URL = db.url;
    customerId = (
      await db.prisma.customer.create({
        data: { name: "Comprador", phone: "123" },
      })
    ).id;
    await db.prisma.paymentMethod.update({
      where: { id: "pm1" },
      data: { collectionEligible: true },
    });
    await db.prisma.paymentMethod.update({
      where: { id: "pm5" },
      data: { supportsInstallments: true },
    });
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
  it("quotes then atomically records fixed direct schedules, upfront and idempotence", async () => {
    const dto = {
      operationId: "sale-direct-1",
      customerId,
      paymentTerms: "DirectInstallments",
      deliveryStatus: "Pendiente",
      items: [{ productId: "p1", qty: 1 }],
      directPlan: {
        installmentCount: 3,
        firstDueDate: "2026-01-31",
        surchargeBasisPoints: 1000,
        upfrontAmountCents: 10000,
        upfrontPaymentMethodId: "pm1",
        upfrontCashReceivedAmountCents: 12000,
      },
    };
    const quote = await request(app.getHttpServer())
      .post("/api/sales/quote")
      .send(dto)
      .expect(200);
    expect(quote.body.totalAmountCents).toBe(294800);
    expect(
      quote.body.finance.installments.map(
        (i: { amountCents: number }) => i.amountCents,
      ),
    ).toEqual([94933, 94933, 94934]);
    const sale = await request(app.getHttpServer())
      .post("/api/sales")
      .send(dto)
      .expect(201);
    expect(sale.body).toMatchObject({
      customerName: "Comprador",
      paymentMethodId: null,
      payment: "Cuotas directas",
      paymentTerms: "DirectInstallments",
    });
    const retry = await request(app.getHttpServer())
      .post("/api/sales")
      .send(dto)
      .expect(201);
    expect(retry.body.id).toBe(sale.body.id);
    expect(await db.prisma.sale.count()).toBe(1);
    expect(await db.prisma.collection.count()).toBe(1);
    const upfront = await db.prisma.collection.findFirstOrThrow({
      where: { saleId: sale.body.id },
    });
    await request(app.getHttpServer())
      .post(`/api/collections/${upfront.id}/reverse`)
      .send({ reason: "Corregir anticipo" })
      .expect(409);
    expect(
      (
        await db.prisma.collection.findUniqueOrThrow({
          where: { id: upfront.id },
        })
      ).reversedAt,
    ).toBeNull();
    await request(app.getHttpServer())
      .post("/api/sales")
      .send({ ...dto, customerName: "Distinto" })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/cancel`)
      .send({ reason: "Anulada" })
      .expect(200);
    const refunds = await request(app.getHttpServer())
      .get("/api/collections/refunds")
      .expect(200);
    expect(refunds.body.items[0].refundableAmountCents).toBe(10000);
  });
  it("retains pending card settlements after commercial cancellation and reconciles refunds", async () => {
    const dto = {
      operationId: "sale-card-1",
      customerId,
      paymentTerms: "CardInstallments",
      paymentMethodId: "pm5",
      deliveryStatus: "Pendiente",
      items: [{ productId: "p1", qty: 1 }],
      cardPlan: {
        installmentCount: 6,
        processor: "Procesador",
        settlements: [
          {
            dueDate: "2020-01-01",
            grossAmountCents: 274700,
            feeAmountCents: 10000,
          },
        ],
      },
    };
    const sale = await request(app.getHttpServer())
      .post("/api/sales")
      .send(dto)
      .expect(201);
    const settlement = (
      await request(app.getHttpServer())
        .get("/api/card-settlements")
        .expect(200)
    ).body.items[0];
    const accreditation = await request(app.getHttpServer())
      .post(`/api/card-settlements/${settlement.id}/accreditations`)
      .send({
        operationId: "accredit-1",
        date: "2020-01-01",
        grossAmountCents: 100000,
        feeAmountCents: 4000,
      })
      .expect(201);
    const repeatedAccreditation = await request(app.getHttpServer())
      .post(`/api/card-settlements/${settlement.id}/accreditations`)
      .send({
        operationId: "accredit-1",
        date: "2020-01-01",
        grossAmountCents: 100000,
        feeAmountCents: 4000,
      })
      .expect(201);
    expect(repeatedAccreditation.body).toEqual(accreditation.body);
    await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/cancel`)
      .send({ reason: "Anulada" })
      .expect(200);
    const rows = (
      await request(app.getHttpServer())
        .get("/api/card-settlements")
        .expect(200)
    ).body.items;
    expect(rows[0].remainingGrossAmountCents).toBe(174700);
    const refund = await request(app.getHttpServer())
      .post("/api/collections/refunds")
      .send({
        operationId: "refund-card-1",
        saleId: sale.body.id,
        date: "2020-01-02",
        amountCents: 274700,
        cashOutAmountCents: 100000,
        paymentMethodId: "pm1",
        reason: "Devolución",
        cancellations: [
          { settlementId: settlement.id, grossAmountCents: 174700 },
        ],
      })
      .expect(201);
    expect(
      (await request(app.getHttpServer()).get("/api/card-settlements")).body
        .items[0].remainingGrossAmountCents,
    ).toBe(0);
    const summary = (
      await request(app.getHttpServer())
        .get("/api/collections/summary?month=2020-01")
        .expect(200)
    ).body;
    expect(summary.collectedAmountCents).toBe(96000);
    expect(summary.refundedAmountCents).toBe(100000);
    await request(app.getHttpServer())
      .post(`/api/collections/refunds/${refund.body.id}/reverse`)
      .send({ reason: "Corrección" })
      .expect(200);
    await request(app.getHttpServer())
      .post(
        `/api/card-settlements/accreditations/${accreditation.body.id}/reverse`,
      )
      .send({ reason: "Corrección" })
      .expect(200);
    const restored = (
      await request(app.getHttpServer())
        .get("/api/card-settlements")
        .expect(200)
    ).body.items[0];
    expect(restored.remainingGrossAmountCents).toBe(274700);
    expect(restored.creditedNetAmountCents).toBe(0);
  });

  it("requires commercial cancellation before reversing an immediate sale receipt", async () => {
    const sale = await request(app.getHttpServer())
      .post("/api/sales")
      .send({
        operationId: "immediate-reversal",
        customerId,
        paymentTerms: "Immediate",
        paymentMethodId: "pm1",
        cashReceivedAmountCents: 268000,
        deliveryStatus: "Pendiente",
        items: [{ productId: "p1", qty: 1 }],
      })
      .expect(201);
    const receipt = await db.prisma.collection.findFirstOrThrow({
      where: { saleId: sale.body.id },
    });
    await request(app.getHttpServer())
      .post(`/api/collections/${receipt.id}/reverse`)
      .send({ reason: "Corrección" })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/cancel`)
      .send({ reason: "Corrección de la operación" })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/collections/${receipt.id}/reverse`)
      .send({ reason: "El cobro no ocurrió" })
      .expect(200);
  });
});
