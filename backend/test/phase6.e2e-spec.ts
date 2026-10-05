import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("Phase 6 purchases endpoints", () => {
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

  it("creates pending and registered purchases with the correct stock effects", async () => {
    const pending = await request(app.getHttpServer())
      .post("/api/purchases")
      .send({
        supplierId: "s1",
        status: "Pendiente",
        items: [{ productId: "p1", qty: 2, unitCostAmountCents: 185000 }],
      })
      .expect(201);

    expect(pending.body).toMatchObject({
      supplierId: "s1",
      status: "Pendiente",
      totalAmountCents: 370000,
    });
    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } }),
    ).resolves.toMatchObject({ physicalStock: 24 });

    const registered = await request(app.getHttpServer())
      .post("/api/purchases")
      .send({
        supplierId: "s2",
        status: "Registrada",
        items: [{ productId: "p3", qty: 5, unitCostAmountCents: 145000 }],
      })
      .expect(201);

    expect(registered.body).toMatchObject({
      status: "Registrada",
      totalAmountCents: 725000,
    });
    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p3" } }),
    ).resolves.toMatchObject({ physicalStock: 37 });
  });

  it("registers a pending purchase only once", async () => {
    const purchase = await request(app.getHttpServer())
      .post("/api/purchases")
      .send({
        supplierId: "s3",
        status: "Pendiente",
        items: [{ productId: "p7", qty: 4, unitCostAmountCents: 210000 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/purchases/${purchase.body.id}/register`)
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe("Registrada");
      });

    await request(app.getHttpServer())
      .post(`/api/purchases/${purchase.body.id}/register`)
      .expect(409);
  });

  it("rejects cancelling a registered purchase when reserved stock would make available stock negative", async () => {
    const purchase = await request(app.getHttpServer())
      .post("/api/purchases")
      .send({
        supplierId: "s1",
        status: "Registrada",
        items: [{ productId: "p8", qty: 5, unitCostAmountCents: 280000 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/sales")
      .send({
        deliveryStatus: "Pendiente",
        paymentMethodId: "pm2",
        items: [{ productId: "p8", qty: 7 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/purchases/${purchase.body.id}/cancel`)
      .send({ reason: "Remito incorrecto" })
      .expect(409);

    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p8" } }),
    ).resolves.toMatchObject({ physicalStock: 8 });
  });

  it("cancels a registered purchase without requiring a reason", async () => {
    const purchase = await request(app.getHttpServer())
      .post("/api/purchases")
      .send({
        supplierId: "s1",
        status: "Registrada",
        items: [{ productId: "p10", qty: 1, unitCostAmountCents: 162000 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/purchases/${purchase.body.id}/cancel`)
      .send({})
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe("Anulada");
        expect(response.body.cancelReason).toBeNull();
      });
  });

  it("hard-deletes pending purchase drafts and rejects deleting registered purchases", async () => {
    const pending = await request(app.getHttpServer())
      .post("/api/purchases")
      .send({
        supplierId: "s1",
        status: "Pendiente",
        items: [{ productId: "p10", qty: 2, unitCostAmountCents: 162000 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/purchases/${pending.body.id}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({ id: pending.body.id, deleted: true });
      });

    const registered = await request(app.getHttpServer())
      .post("/api/purchases")
      .send({
        supplierId: "s1",
        status: "Registrada",
        items: [{ productId: "p10", qty: 1, unitCostAmountCents: 162000 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/purchases/${registered.body.id}`)
      .expect(409);
  });
});
