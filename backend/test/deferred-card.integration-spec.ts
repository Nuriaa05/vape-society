import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import {
  createSeededTestDatabase,
  SeededTestDatabase,
} from "./prisma-test-database";

describe("deferred card calendars", () => {
  let db: SeededTestDatabase;
  let app: INestApplication;
  beforeAll(async () => {
    db = await createSeededTestDatabase();
    process.env.DATABASE_URL = db.url;
    await db.prisma.paymentMethod.update({
      where: { id: "pm5" },
      data: { supportsInstallments: true },
    });
    await db.prisma.paymentMethod.update({
      where: { id: "pm1" },
      data: { collectionEligible: true },
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
  it("shows a customer's pending card receipts separately from direct debt throughout corrections", async () => {
    const customer = await db.prisma.customer.create({
      data: { name: "Cliente saldo tarjeta" },
    });
    const other = await db.prisma.customer.create({
      data: { name: "Otro saldo tarjeta" },
    });
    await request(app.getHttpServer())
      .post(`/api/customers/${customer.id}/opening-balances`)
      .send({
        operationId: "card-balance-opening",
        title: "Deuda directa independiente",
        totalAmountCents: 10001,
        installmentCount: 1,
        firstDueDate: "2020-01-01",
      })
      .expect(201);
    const sale = await request(app.getHttpServer())
      .post("/api/sales")
      .send({
        operationId: "card-balance-sale",
        customerId: customer.id,
        paymentTerms: "CardInstallments",
        paymentMethodId: "pm5",
        deliveryStatus: "Entregado",
        items: [{ productId: "p1", qty: 1 }],
        cardPlan: {
          installmentCount: 3,
          processor: "Procesador saldo",
          settlements: [],
        },
      })
      .expect(201);
    const expectBalances = async (pending: number, unscheduled: number) => {
      const listed = await request(app.getHttpServer())
        .get("/api/customers?q=Cliente%20saldo%20tarjeta&take=1")
        .expect(200);
      const account = await request(app.getHttpServer())
        .get(`/api/customers/${customer.id}/account`)
        .expect(200);
      const summary = await request(app.getHttpServer())
        .get(`/api/collections/summary?customerId=${customer.id}`)
        .expect(200);
      const balances = {
        balanceAmountCents: 10001,
        cardPendingAmountCents: pending,
        cardUnscheduledAmountCents: unscheduled,
      };
      expect(listed.body.items).toHaveLength(1);
      expect(listed.body.items[0]).toMatchObject({
        id: customer.id,
        ...balances,
      });
      expect(account.body).toMatchObject(balances);
      expect(summary.body).toMatchObject({
        customerDebtAmountCents: 10001,
        cardPendingAmountCents: pending,
        cardUnscheduledAmountCents: unscheduled,
      });
    };
    await expectBalances(0, 274700);
    await request(app.getHttpServer())
      .post(`/api/card-settlements/sales/${sale.body.id}/schedule`)
      .send({
        operationId: "card-balance-schedule",
        settlements: [
          {
            dueDate: "2020-01-31",
            grossAmountCents: 100000,
            feeAmountCents: 1000,
          },
          {
            dueDate: "2020-02-29",
            grossAmountCents: 174700,
            feeAmountCents: 4700,
          },
        ],
      })
      .expect(201);
    await expectBalances(269000, 0);
    const settlements = await db.prisma.cardSettlement.findMany({
      where: { saleId: sale.body.id },
      orderBy: { number: "asc" },
    });
    const accreditation = await request(app.getHttpServer())
      .post(`/api/card-settlements/${settlements[0].id}/accreditations`)
      .send({
        operationId: "card-balance-partial",
        date: "2020-01-31",
        grossAmountCents: 50000,
        feeAmountCents: 2000,
      })
      .expect(201);
    await expectBalances(219500, 0);
    await request(app.getHttpServer())
      .post(
        `/api/card-settlements/accreditations/${accreditation.body.id}/reverse`,
      )
      .send({ reason: "Corregir acreditación" })
      .expect(200);
    await expectBalances(269000, 0);
    await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/cancel`)
      .send({ reason: "Anulación antes de recibir el dinero" })
      .expect(200);
    await expectBalances(269000, 0);
    const refund = await request(app.getHttpServer())
      .post("/api/collections/refunds")
      .send({
        operationId: "card-balance-refund",
        saleId: sale.body.id,
        date: "2020-02-01",
        amountCents: 274700,
        cashOutAmountCents: 0,
        reason: "Cancelar acreditaciones no recibidas",
        cancellations: settlements.map((settlement) => ({
          settlementId: settlement.id,
          grossAmountCents: settlement.grossAmountCents,
        })),
      })
      .expect(201);
    await expectBalances(0, 0);
    await request(app.getHttpServer())
      .post(`/api/collections/refunds/${refund.body.id}/reverse`)
      .send({ reason: "Corregir reintegro" })
      .expect(200);
    await expectBalances(269000, 0);
    const otherAccount = await request(app.getHttpServer())
      .get(`/api/customers/${other.id}/account`)
      .expect(200);
    expect(otherAccount.body).toMatchObject({
      balanceAmountCents: 0,
      cardPendingAmountCents: 0,
      cardUnscheduledAmountCents: 0,
    });
    expect(
      await db.prisma.collection.count({ where: { saleId: sale.body.id } }),
    ).toBe(0);
  });
  it("rejects zero-total card financing instead of creating a permanent incomplete calendar", async () => {
    const product = await db.prisma.product.findUniqueOrThrow({
      where: { id: "p1" },
    });
    await db.prisma.product.update({
      where: { id: "p1" },
      data: { priceAmountCents: 0 },
    });
    try {
      const dto = {
        paymentTerms: "CardInstallments",
        paymentMethodId: "pm5",
        deliveryStatus: "Entregado",
        items: [{ productId: "p1", qty: 1 }],
        cardPlan: {
          processor: "Procesador",
          installmentCount: 3,
          settlements: [],
        },
      };
      await request(app.getHttpServer())
        .post("/api/sales/quote")
        .send(dto)
        .expect(400);
      await request(app.getHttpServer())
        .post("/api/sales")
        .send({ ...dto, operationId: "zero-total-card" })
        .expect(400);
    } finally {
      await db.prisma.product.update({
        where: { id: "p1" },
        data: { priceAmountCents: product.priceAmountCents },
      });
    }
  });
  it("defers card settlements, then records an immutable calendar without recording cash", async () => {
    const dto = {
      operationId: "deferred-card-sale",
      paymentTerms: "CardInstallments",
      paymentMethodId: "pm5",
      deliveryStatus: "Entregado",
      items: [{ productId: "p1", qty: 1 }],
      cardPlan: {
        installmentCount: 3,
        processor: "Procesador posterior",
        settlements: [],
      },
    };
    const countBefore = await db.prisma.sale.count();
    const quote = await request(app.getHttpServer())
      .post("/api/sales/quote")
      .send(dto)
      .expect(200);
    expect(quote.body.finance.cardPlan).toMatchObject({
      deferred: true,
      settlements: [],
    });
    expect(await db.prisma.sale.count()).toBe(countBefore);
    const sale = await request(app.getHttpServer())
      .post("/api/sales")
      .send(dto)
      .expect(201);
    expect(
      await db.prisma.cardSettlement.count({ where: { saleId: sale.body.id } }),
    ).toBe(0);
    expect(
      await db.prisma.collection.count({ where: { saleId: sale.body.id } }),
    ).toBe(0);
    const pending = (
      await request(app.getHttpServer())
        .get("/api/card-settlements?month=2020-01&status=Por%20completar")
        .expect(200)
    ).body.items;
    expect(pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          saleId: sale.body.id,
          schedulePending: true,
          status: "Por completar",
          dueDate: null,
          grossAmountCents: 274700,
          feeAmountCents: null,
          netAmountCents: null,
        }),
      ]),
    );
    const summary = (
      await request(app.getHttpServer())
        .get("/api/collections/summary")
        .expect(200)
    ).body;
    expect(summary.cardUnscheduledAmountCents).toBe(274700);
    const schedule = {
      operationId: "deferred-card-schedule",
      settlements: [
        {
          dueDate: "2020-01-31",
          grossAmountCents: 100000,
          feeAmountCents: 1000,
        },
        {
          dueDate: "2020-02-28",
          grossAmountCents: 174700,
          feeAmountCents: 4700,
        },
      ],
    };
    const endpoint = `/api/card-settlements/sales/${sale.body.id}/schedule`;
    await request(app.getHttpServer())
      .post(endpoint)
      .send({ ...schedule, settlements: [schedule.settlements[0]] })
      .expect(400);
    expect(
      await db.prisma.cardSettlement.count({ where: { saleId: sale.body.id } }),
    ).toBe(0);
    const saved = await request(app.getHttpServer())
      .post(endpoint)
      .send(schedule)
      .expect(201);
    const retry = await request(app.getHttpServer())
      .post(endpoint)
      .send(schedule)
      .expect(201);
    expect(retry.body).toEqual(saved.body);
    await request(app.getHttpServer())
      .post(endpoint)
      .send({ ...schedule, operationId: "another-card-schedule" })
      .expect(409);
    await request(app.getHttpServer())
      .post(endpoint)
      .send({
        ...schedule,
        settlements: [
          { ...schedule.settlements[0], dueDate: "2020-02-01" },
          schedule.settlements[1],
        ],
      })
      .expect(409);
    expect(
      await db.prisma.cardSettlement.count({ where: { saleId: sale.body.id } }),
    ).toBe(2);
    expect(
      await db.prisma.cardAccreditation.count({
        where: { settlement: { saleId: sale.body.id } },
      }),
    ).toBe(0);
    const stored = await db.prisma.sale.findUniqueOrThrow({
      where: { id: sale.body.id },
    });
    expect(JSON.parse(stored.financeSnapshot!).cardPlan.settlements).toEqual(
      [],
    );
    const after = (
      await request(app.getHttpServer())
        .get("/api/collections/summary")
        .expect(200)
    ).body;
    expect(after.cardUnscheduledAmountCents).toBe(0);
    expect(after.collectedAmountCents).toBe(summary.collectedAmountCents);
  });
  it("requires scheduling before refunding an uncredited cancelled card sale", async () => {
    const sale = await request(app.getHttpServer())
      .post("/api/sales")
      .send({
        operationId: "deferred-cancelled-card",
        paymentTerms: "CardInstallments",
        paymentMethodId: "pm5",
        deliveryStatus: "Entregado",
        items: [{ productId: "p1", qty: 1 }],
        cardPlan: {
          installmentCount: 3,
          processor: "Procesador",
          settlements: [],
        },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/cancel`)
      .send({ reason: "Anulación antes del depósito" })
      .expect(200);
    const refund = {
      operationId: "deferred-card-refund",
      saleId: sale.body.id,
      date: "2020-01-01",
      amountCents: 274700,
      cashOutAmountCents: 274700,
      paymentMethodId: "pm1",
      reason: "Reintegro",
    };
    await request(app.getHttpServer())
      .post("/api/collections/refunds")
      .send(refund)
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/card-settlements/sales/${sale.body.id}/schedule`)
      .send({
        operationId: "cancelled-card-schedule",
        settlements: [
          {
            dueDate: "2020-01-01",
            grossAmountCents: 274700,
            feeAmountCents: 0,
          },
        ],
      })
      .expect(201);
    const settlement = await db.prisma.cardSettlement.findFirstOrThrow({
      where: { saleId: sale.body.id },
    });
    await request(app.getHttpServer())
      .post("/api/collections/refunds")
      .send({
        ...refund,
        cashOutAmountCents: 0,
        paymentMethodId: undefined,
        cancellations: [
          { settlementId: settlement.id, grossAmountCents: 274700 },
        ],
      })
      .expect(201);
    expect(
      (
        await db.prisma.refund.findFirstOrThrow({
          where: { saleId: sale.body.id },
        })
      ).cashOutAmountCents,
    ).toBe(0);
  });
});
