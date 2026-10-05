import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("Phase 3 endpoints", () => {
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

  it("serves product lookup by barcode", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/products/barcode/7790001000017")
      .expect(200);

    expect(response.body).toMatchObject({
      barcode: "7790001000017",
      name: "Hamburguesas de carne x4",
      costAmountCents: 185000,
      priceAmountCents: 268000,
    });
  });

  it("rejects product payloads with unknown fields", async () => {
    await request(app.getHttpServer())
      .post("/api/products")
      .send({
        barcode: "7790001999999",
        name: "Producto prueba",
        categoryId: "c0",
        supplierId: "s1",
        costAmountCents: 100000,
        priceAmountCents: 150000,
        marginPct: 50,
        physicalStock: 4,
        minStock: 1,
        unexpected: true,
      })
      .expect(400);
  });

  it("does not allow product update to mutate physical stock directly", async () => {
    await request(app.getHttpServer())
      .patch("/api/products/p1")
      .send({ physicalStock: 999 })
      .expect(400);
  });

  it("loads settings for the frontend", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/settings")
      .expect(200);

    expect(response.body).toMatchObject({
      business: {
        name: "Lozano Congelados",
      },
      defaultMarginPct: 45,
      defaultMargin: 45,
    });
    expect(response.body.categories).toHaveLength(9);
    expect(response.body.paymentMethods).toHaveLength(7);
    expect(response.body.paymentMethods[0]).toEqual(
      expect.objectContaining({
        surchargeBasisPoints: expect.any(Number),
        cashHandling: expect.any(Boolean),
      }),
    );
  });

  it("partially updates business settings", async () => {
    await request(app.getHttpServer())
      .patch("/api/settings/business")
      .send({ phone: "+54 11 4000-0000" })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get("/api/settings")
      .expect(200);

    expect(response.body.business.phone).toBe("+54 11 4000-0000");
  });

  it("deletes unused categories and payment methods through settings endpoints", async () => {
    const category = await request(app.getHttpServer())
      .post("/api/settings/categories")
      .send({ name: "Categoría temporal" })
      .expect(201);
    const paymentMethod = await request(app.getHttpServer())
      .post("/api/settings/payment-methods")
      .send({ name: "Pago temporal", enabled: true })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/settings/categories/${category.body.id}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          id: category.body.id,
          deleted: true,
        });
      });
    await request(app.getHttpServer())
      .delete(`/api/settings/payment-methods/${paymentMethod.body.id}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          id: paymentMethod.body.id,
          deleted: true,
        });
      });
  });

  it("updates supplier status", async () => {
    await request(app.getHttpServer())
      .patch("/api/suppliers/s2/status")
      .send({ active: false })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get("/api/suppliers?activeOnly=true")
      .expect(200);

    expect(response.body.map((supplier: { id: string }) => supplier.id)).not.toContain(
      "s2",
    );
  });
});
