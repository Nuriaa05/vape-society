import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("Phase 7 reports endpoints", () => {
  let app: INestApplication;
  let db: SeededTestDatabase;

  beforeEach(async () => {
    db = await createSeededTestDatabase();
    process.env.DATABASE_URL = db.url;

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

  afterEach(async () => {
    await app?.close();
    await db.cleanup();
  });

  it("serves dashboard and commercial summaries from persisted data", async () => {
    await createSale(db, {
      number: "970001",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      totalAmountCents: 500000,
    });
    await createSale(db, {
      number: "970002",
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm2",
      totalAmountCents: 300000,
    });
    await createSale(db, {
      number: "970003",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm3",
      totalAmountCents: 900000,
      status: "Anulada",
    });

    await request(app.getHttpServer())
      .get("/api/reports/dashboard")
      .expect(200)
      .expect((response) => {
        expect(response.body.todayTotalAmountCents).toBe(800000);
        expect(response.body.pendingDeliveries).toHaveLength(1);
        expect(response.body.pendingDeliveries[0]).toMatchObject({
          number: "970002",
          deliveryStatus: "Pendiente",
        });
      });

    for (const period of ["week", "month"]) {
      await request(app.getHttpServer())
        .get(`/api/reports/units-series?period=${period}`)
        .expect(200)
        .expect((response) => {
          expect(response.body.period).toBe(period);
          expect(response.body.points.reduce((sum: number, point: { units: number }) => sum + point.units, 0)).toBe(2);
        });
    }

    await request(app.getHttpServer())
      .get("/api/reports/commercial")
      .expect(200)
      .expect((response) => {
        expect(response.body.dailyTotalAmountCents).toBe(800000);
        expect(response.body.deliveredSalesCount).toBe(1);
        expect(response.body.pendingSalesCount).toBe(1);
      });
  });

  it("serves sales series, top products and payment breakdown", async () => {
    await createSale(db, {
      number: "980001",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      totalAmountCents: 500000,
      productId: "p1",
      productName: "Hamburguesas de carne x4",
      date: argentinaNoonForTest(),
    });
    await createSale(db, {
      number: "980002",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm2",
      totalAmountCents: 300000,
      productId: "p3",
      productName: "Papas prefritas baston 1kg",
      date: argentinaNoonForTest(),
    });

    await request(app.getHttpServer())
      .get("/api/reports/sales-series?period=hour")
      .expect(200)
      .expect((response) => {
        expect(response.body.period).toBe("hour");
        expect(response.body.points).toHaveLength(24);
        expect(response.body.points[0].label).toBe("00:00");
        expect(response.body.points.at(-1).label).toBe("23:00");
        expect(response.body.points[0]).toMatchObject({
          from: expect.any(String),
          to: expect.any(String),
        });
        expect(response.body.points[0].fullLabel).not.toContain("T");
        expect(
          response.body.points.reduce(
            (sum: number, point: { v: number }) => sum + point.v,
            0,
          ),
        ).toBe(800000);
      });

    await request(app.getHttpServer())
      .get("/api/reports/top-products")
      .expect(200)
      .expect((response) => {
        expect(response.body[0]).toMatchObject({
          productId: "p1",
          totalAmountCents: 500000,
        });
      });

    const exactFrom = argentinaNoonForTest();
    const exactTo = new Date(exactFrom.getTime() + 60 * 60 * 1000);

    await request(app.getHttpServer())
      .get("/api/reports/top-products")
      .query({
        from: exactFrom.toISOString(),
        to: exactTo.toISOString(),
        sort: "quantity",
      })
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(2);
      });

    await request(app.getHttpServer())
      .get("/api/reports/top-products")
      .query({
        range: "30d",
        from: exactFrom.toISOString(),
        to: exactTo.toISOString(),
      })
      .expect(400);

    await request(app.getHttpServer())
      .get("/api/reports/product-consumption?range=all")
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              productId: "p1",
              directQty: 1,
              totalQty: 1,
            }),
          ]),
        );
      });

    await request(app.getHttpServer())
      .get("/api/reports/sales?range=all")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((sale: { number: string }) => sale.number)).toEqual([
          "980002",
          "980001",
        ]);
      });

    await request(app.getHttpServer())
      .get("/api/reports/payment-methods")
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ label: "Efectivo", pct: 63 }),
            expect.objectContaining({ label: "Transferencia", pct: 38 }),
          ]),
        );
      });
  });

  it("rejects unsupported report periods and exposes reports as read-only endpoints", async () => {
    await request(app.getHttpServer())
      .get("/api/reports/units-series?period=decade")
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/reports/units-series")
      .send({})
      .expect(404);

    await request(app.getHttpServer())
      .get("/api/reports/sales-series?period=decade")
      .expect(400);

    await request(app.getHttpServer())
      .get("/api/reports/top-products?range=decade")
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/reports/dashboard")
      .send({})
      .expect(404);
  });
});

async function createSale(
  db: SeededTestDatabase,
  input: {
    number: string;
    deliveryStatus: "Pendiente" | "Entregado";
    paymentMethodId: string;
    totalAmountCents: number;
    status?: "Confirmada" | "Anulada";
    productId?: string;
    productName?: string;
    date?: Date;
  },
) {
  const productId = input.productId ?? "p1";
  const productName = input.productName ?? "Hamburguesas de carne x4";

  return db.prisma.sale.create({
    data: {
      number: input.number,
      date: input.date,
      deliveryStatus: input.deliveryStatus,
      status: input.status ?? "Confirmada",
      paymentMethodId: input.paymentMethodId,
      subtotalAmountCents: input.totalAmountCents,
      totalAmountCents: input.totalAmountCents,
      items: {
        create: {
          productId,
          productName,
          barcode: "7790001000017",
          qty: 1,
          unitPriceAmountCents: input.totalAmountCents,
          lineTotalAmountCents: input.totalAmountCents,
        },
      },
    },
  });
}

function argentinaNoonForTest(): Date {
  const entries = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)] as const);
  const parts = Object.fromEntries(entries) as {
    year: number;
    month: number;
    day: number;
  };

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 15));
}
