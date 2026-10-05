import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("Phase 4 stock endpoints", () => {
  let app: INestApplication;
  let db: SeededTestDatabase;

  beforeAll(async () => {
    db = await createSeededTestDatabase();
    process.env.DATABASE_URL = db.url;

    await db.prisma.sale.create({
      data: {
      paymentMethodName: ({ pm1: "Efectivo", pm2: "Transferencia", pm3: "Tarjeta" } as Record<string, string>)["pm1"] ?? "Efectivo",
        id: "sale-stock-e2e",
        number: "000920",
        deliveryStatus: "Pendiente",
        status: "Confirmada",
        paymentMethodId: "pm1",
        subtotalAmountCents: 1000,
        totalAmountCents: 1000,
        items: {
          create: {
            productId: "p1",
            productName: "Hamburguesas de carne x4",
            barcode: "7790001000017",
            qty: 8,
            unitPriceAmountCents: 268000,
            lineTotalAmountCents: 2144000,
          },
        },
      },
    });

    await db.prisma.stockMovement.create({
      data: {
        productId: "p1",
        type: "Ajuste",
        sourceType: "ManualAdjustment",
        sourceId: "manual-e2e",
        physicalDelta: -99,
        note: "Auditoria, no reserva",
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
    await db.cleanup();
  });

  it("serves stock rows with reserved and available stock", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/stock")
      .expect(200);

    const product = response.body.find(
      (row: { productId: string }) => row.productId === "p1",
    );

    expect(product).toMatchObject({
      productId: "p1",
      productName: "Hamburguesas de carne x4",
      physicalStock: 24,
      reservedStock: 8,
      availableStock: 16,
    });
  });

  it("serves physical stock movements as audit rows", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/stock/movements")
      .expect(200);

    expect(response.body[0]).toMatchObject({
      productId: "p1",
      productName: "Hamburguesas de carne x4",
      type: "Ajuste",
      qty: -99,
      sourceType: "ManualAdjustment",
      sourceId: "manual-e2e",
    });
    expect(typeof response.body[0].date).toBe("string");
  });

  it("creates manual adjustment movements through the stock endpoint", async () => {
    await request(app.getHttpServer())
      .post("/api/stock/adjustments")
      .send({
        productId: "p1",
        type: "Ingreso",
        qty: 1,
        reason: "Ajuste e2e",
      })
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          productId: "p1",
          type: "Ajuste",
          qty: 1,
          sourceType: "ManualAdjustment",
          note: "Ajuste e2e",
        });
      });
  });
});
