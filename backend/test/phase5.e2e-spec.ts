import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("Phase 5 sales endpoints", () => {
  let app: INestApplication;
  let db: SeededTestDatabase;

  beforeAll(async () => {
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

  afterAll(async () => {
    await app?.close();
    await db.cleanup();
  });

  it("creates a pending sale from product ids using server totals", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/sales")
      .send({
        deliveryStatus: "Pendiente",
        paymentMethodId: "pm2",
        items: [
          { productId: "p1", qty: 1 },
          { productId: "p1", qty: 2 },
        ],
      })
      .expect(201);

    expect(response.body).toMatchObject({
      number: "000001",
      deliveryStatus: "Pendiente",
      totalAmountCents: 804000,
    });
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      productId: "p1",
      qty: 3,
      unitPriceAmountCents: 268000,
    });
  });

  it("delivers a pending sale once", async () => {
    const sale = await request(app.getHttpServer())
      .post("/api/sales")
      .send({
        deliveryStatus: "Pendiente",
        paymentMethodId: "pm2",
        items: [{ productId: "p4", qty: 2 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/sales/${sale.body.id}/deliver`)
      .expect(200)
      .expect((response) => {
        expect(response.body.deliveryStatus).toBe("Entregado");
      });

    await request(app.getHttpServer())
      .patch(`/api/sales/${sale.body.id}/deliver`)
      .expect(409);
  });

  it("cancels a delivered sale and exposes its non-fiscal receipt", async () => {
    const sale = await request(app.getHttpServer())
      .post("/api/sales")
      .send({
        deliveryStatus: "Entregado",
        paymentMethodId: "pm2",
        items: [{ productId: "p6", qty: 1 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/cancel`)
      .send({ reason: "Cliente cancela" })
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe("Anulada");
        expect(response.body.number).toBe(sale.body.number);
      });

    const receipt = await request(app.getHttpServer())
      .get(`/api/sales/${sale.body.id}/receipt`)
      .expect(200);

    expect(receipt.body).toMatchObject({
      legend: "Comprobante interno no válido como factura fiscal.",
      sale: {
        id: sale.body.id,
        number: sale.body.number,
        status: "Anulada",
      },
    });
  });

  it("rejects sales that exceed available stock", async () => {
    await request(app.getHttpServer())
      .post("/api/sales")
      .send({
        deliveryStatus: "Pendiente",
        paymentMethodId: "pm2",
        items: [{ productId: "p8", qty: 3 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/sales")
      .send({
        deliveryStatus: "Entregado",
        paymentMethodId: "pm2",
        items: [{ productId: "p8", qty: 1 }],
      })
      .expect(409);
  });
});
