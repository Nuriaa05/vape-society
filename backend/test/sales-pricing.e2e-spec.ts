import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("Authoritative sale pricing endpoints", () => {
  let app: INestApplication;
  let db: SeededTestDatabase;

  beforeAll(async () => {
    db = await createSeededTestDatabase();
    process.env.DATABASE_URL = db.url;

    await db.prisma.coupon.createMany({
      data: [
        {
          code: "VERANO10",
          discountType: "Percentage",
          discountBasisPoints: 1_000,
          enabled: true,
        },
        {
          code: "INACTIVO",
          discountType: "FixedAmount",
          discountAmountCents: 10_000,
          enabled: false,
        },
      ],
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
    await db.cleanup();
  });

  it("quotes exact server values without persisting sales or stock movements", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/sales/quote")
      .send({
        deliveryStatus: "Entregado",
        paymentMethodId: "pm5",
        couponCode: " verano10 ",
        items: [{ productId: "p1", qty: 1 }],
      })
      .expect(200);

    expect(response.body).toMatchObject({
      couponCode: "VERANO10",
      couponType: "Percentage",
      couponBasisPoints: 1_000,
      couponValueAmountCents: null,
      subtotalAmountCents: 268_000,
      discountAmountCents: 26_800,
      netAmountCents: 241_200,
      surchargeBasisPoints: 250,
      surchargeAmountCents: 6_030,
      totalAmountCents: 247_230,
      cashReceivedAmountCents: null,
      changeAmountCents: null,
      cashShortfallAmountCents: 0,
    });
    await expect(db.prisma.sale.count()).resolves.toBe(0);
    await expect(db.prisma.stockMovement.count()).resolves.toBe(0);
  });

  it("recalculates and persists immutable pricing snapshots on creation", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/sales")
      .send({
        deliveryStatus: "Pendiente",
        paymentMethodId: "pm5",
        couponCode: "VERANO10",
        items: [{ productId: "p1", qty: 1 }],
      })
      .expect(201);

    expect(response.body).toMatchObject({
      payment: "Tarjeta Debito",
      couponCode: "VERANO10",
      couponType: "Percentage",
      couponBasisPoints: 1_000,
      couponValueAmountCents: null,
      subtotalAmountCents: 268_000,
      discountAmountCents: 26_800,
      netAmountCents: 241_200,
      surchargeBasisPoints: 250,
      surchargeAmountCents: 6_030,
      totalAmountCents: 247_230,
      cashReceivedAmountCents: null,
      changeAmountCents: null,
      cashShortfallAmountCents: 0,
    });

    await expect(
      db.prisma.sale.findUniqueOrThrow({ where: { id: response.body.id } }),
    ).resolves.toMatchObject({
      paymentMethodName: "Tarjeta Debito",
      couponCode: "VERANO10",
      couponType: "Percentage",
      couponBasisPoints: 1_000,
      couponValueAmountCents: null,
      subtotalAmountCents: 268_000,
      discountAmountCents: 26_800,
      surchargeBasisPoints: 250,
      surchargeAmountCents: 6_030,
      totalAmountCents: 247_230,
      cashReceivedAmountCents: null,
      changeAmountCents: null,
    });
  });

  it("rejects inactive coupons and invalid cash payloads", async () => {
    const baseInput = {
      deliveryStatus: "Entregado",
      items: [{ productId: "p2", qty: 1 }],
    };

    await request(app.getHttpServer())
      .post("/api/sales/quote")
      .send({
        ...baseInput,
        paymentMethodId: "pm5",
        couponCode: "INACTIVO",
      })
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/sales")
      .send({ ...baseInput, paymentMethodId: "pm1" })
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/sales")
      .send({
        ...baseInput,
        paymentMethodId: "pm1",
        cashReceivedAmountCents: 1,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/sales")
      .send({
        ...baseInput,
        paymentMethodId: "pm5",
        cashReceivedAmountCents: 1_000_000,
      })
      .expect(400);
  });

  it("rejects client-authored prices and totals", async () => {
    await request(app.getHttpServer())
      .post("/api/sales/quote")
      .send({
        deliveryStatus: "Entregado",
        paymentMethodId: "pm5",
        totalAmountCents: 1,
        items: [
          {
            productId: "p2",
            qty: 1,
            unitPriceAmountCents: 1,
          },
        ],
      })
      .expect(400);
  });

  it("accepts and reloads optional customer details through the sale endpoints", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/sales")
      .send({
        deliveryStatus: "Pendiente",
        paymentMethodId: "pm2",
        items: [{ productId: "p3", qty: 1 }],
        customerName: "  María López  ",
        customerPhone: "  +54 9 362 412-3456  ",
      })
      .expect(201);
    const expected = {
      customerName: "María López",
      customerPhone: "+54 9 362 412-3456",
    };

    expect(response.body).toMatchObject(expected);
    const loaded = await request(app.getHttpServer())
      .get(`/api/sales/${response.body.id}`)
      .expect(200);
    expect(loaded.body).toMatchObject(expected);
    const receipt = await request(app.getHttpServer())
      .get(`/api/sales/${response.body.id}/receipt`)
      .expect(200);
    expect(receipt.body.sale).toMatchObject(expected);
  });

  it.each([
    { customerName: 42 },
    { customerPhone: 3624123456 },
    { customerName: "x".repeat(101) },
    { customerPhone: "1".repeat(41) },
  ])(
    "rejects invalid customer details %j without creating a sale",
    async (customer) => {
      const count = await db.prisma.sale.count();
      await request(app.getHttpServer())
        .post("/api/sales")
        .send({
          deliveryStatus: "Pendiente",
          paymentMethodId: "pm2",
          items: [{ productId: "p3", qty: 1 }],
          ...customer,
        })
        .expect(400);
      await expect(db.prisma.sale.count()).resolves.toBe(count);
    },
  );
});
