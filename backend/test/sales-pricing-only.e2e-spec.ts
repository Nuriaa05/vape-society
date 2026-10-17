import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("Sale pricing before finance details are complete", () => {
  let app: INestApplication;
  let db: SeededTestDatabase;
  const baseInput = {
    deliveryStatus: "Pendiente",
    items: [{ productId: "p1", qty: 1 }],
  };

  beforeAll(async () => {
    db = await createSeededTestDatabase();
    process.env.DATABASE_URL = db.url;
    await db.prisma.paymentMethod.updateMany({
      where: { id: { in: ["pm1", "pm3", "pm5"] } },
      data: { supportsInstallments: true },
    });
    await db.prisma.coupon.create({
      data: {
        code: "DIRECT10",
        discountType: "Percentage",
        discountBasisPoints: 1_000,
        enabled: true,
      },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
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

  afterEach(async () => {
    await expect(db.prisma.sale.count()).resolves.toBe(0);
    await expect(db.prisma.stockMovement.count()).resolves.toBe(0);
    await expect(db.prisma.receivablePlan.count()).resolves.toBe(0);
    await expect(db.prisma.collection.count()).resolves.toBe(0);
    await expect(db.prisma.cardSettlement.count()).resolves.toBe(0);
    await expect(db.prisma.financialOperation.count()).resolves.toBe(0);
  });

  it("quotes direct totals with coupon and surcharge before choosing a customer or plan", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/sales/quote")
      .send({
        ...baseInput,
        pricingOnly: true,
        paymentTerms: "DirectInstallments",
        directSurchargeBasisPoints: 1_000,
        couponCode: "DIRECT10",
      })
      .expect(200);
    expect(response.body).toMatchObject({
      subtotalAmountCents: 268_000,
      discountAmountCents: 26_800,
      netAmountCents: 241_200,
      surchargeBasisPoints: 1_000,
      surchargeAmountCents: 24_120,
      totalAmountCents: 265_320,
    });
    expect(response.body.finance).toBeUndefined();
  });

  it("quotes card totals without processor or settlement calendar", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/sales/quote")
      .send({
        ...baseInput,
        pricingOnly: true,
        paymentTerms: "CardInstallments",
        paymentMethodId: "pm5",
      })
      .expect(200);
    expect(response.body).toMatchObject({
      surchargeBasisPoints: 250,
      surchargeAmountCents: 6_700,
      totalAmountCents: 274_700,
    });
    expect(response.body.finance).toBeUndefined();
  });

  it("rejects unknown customers even when quoting pricing only", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/sales/quote")
      .send({
        ...baseInput,
        pricingOnly: true,
        paymentTerms: "DirectInstallments",
        customerId: "customer-not-created-yet",
        directPlan: {
          installmentCount: 3,
          firstDueDate: "",
          surchargeBasisPoints: 500,
        },
      })
      .expect(400);
    expect(response.body.message).toContain("cliente");
  });

  it("uses an explicit zero surcharge before the fallback plan surcharge", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/sales/quote")
      .send({
        ...baseInput,
        pricingOnly: true,
        paymentTerms: "DirectInstallments",
        directSurchargeBasisPoints: 0,
        directPlan: {
          installmentCount: 3,
          firstDueDate: "",
          surchargeBasisPoints: 500,
        },
      })
      .expect(200);
    expect(response.body.totalAmountCents).toBe(268_000);
  });

  it.each(["pm1", "pm2", "pm3", "missing"])(
    "rejects an ineligible card method %s even in pricing-only mode",
    async (paymentMethodId) => {
      await request(app.getHttpServer())
        .post("/api/sales/quote")
        .send({
          ...baseInput,
          pricingOnly: true,
          paymentTerms: "CardInstallments",
          paymentMethodId,
        })
        .expect(400);
    },
  );

  it("retains stock validation in pricing-only mode", async () => {
    await request(app.getHttpServer())
      .post("/api/sales/quote")
      .send({
        ...baseInput,
        pricingOnly: true,
        paymentTerms: "DirectInstallments",
        items: [{ productId: "p1", qty: 1_000_000 }],
      })
      .expect(409);
  });

  it("calculates immediate cash shortfall before finance details are complete", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/sales/quote")
      .send({
        ...baseInput,
        pricingOnly: true,
        paymentTerms: "Immediate",
        paymentMethodId: "pm1",
        cashReceivedAmountCents: 200_000,
      })
      .expect(200);
    expect(response.body).toMatchObject({
      totalAmountCents: 268_000,
      cashReceivedAmountCents: 200_000,
      cashShortfallAmountCents: 68_000,
      changeAmountCents: null,
    });
  });

  it.each([-1, 100_001, 2.5, "1000"])(
    "rejects an invalid pricing surcharge %j",
    async (directSurchargeBasisPoints) => {
      await request(app.getHttpServer())
        .post("/api/sales/quote")
        .send({
          ...baseInput,
          pricingOnly: true,
          paymentTerms: "DirectInstallments",
          directSurchargeBasisPoints,
        })
        .expect(400);
    },
  );

  it.each([undefined, false])(
    "keeps full quote validation with pricingOnly=%j",
    async (pricingOnly) => {
      await request(app.getHttpServer())
        .post("/api/sales/quote")
        .send({
          ...baseInput,
          pricingOnly,
          paymentTerms: "DirectInstallments",
        })
        .expect(400);
    },
  );

  it.each([{ pricingOnly: true }, { directSurchargeBasisPoints: 0 }])(
    "rejects quote-only fields when creating a sale: %j",
    async (quoteFields) => {
      const response = await request(app.getHttpServer())
        .post("/api/sales")
        .send({ ...baseInput, paymentMethodId: "pm2", ...quoteFields })
        .expect(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining("should not exist")]),
      );
    },
  );

  it("still rejects an incomplete direct sale on creation", async () => {
    await request(app.getHttpServer())
      .post("/api/sales")
      .send({
        ...baseInput,
        paymentTerms: "DirectInstallments",
        operationId: "incomplete-direct-sale",
      })
      .expect(400);
  });
});
