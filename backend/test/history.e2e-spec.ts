import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("History endpoints", () => {
  let app: INestApplication;
  let db: SeededTestDatabase;

  beforeEach(async () => {
    db = await createSeededTestDatabase();
    process.env.DATABASE_URL = db.url;
    await db.prisma.product.create({
      data: {
        id: "history-http-product",
        name: "Producto HTTP",
        categoryId: "c1",
        costAmountCents: 10000,
        priceAmountCents: 15000,
        marginPct: 50,
        createdAt: new Date("2026-04-15T15:00:00.000Z"),
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

  afterEach(async () => {
    await app?.close();
    await db.cleanup();
  });

  it("lists activity months and filtered events", async () => {
    await request(app.getHttpServer())
      .get("/api/history/months")
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ month: "2026-04" }),
          ]),
        );
      });

    await request(app.getHttpServer())
      .get("/api/history?month=2026-04&type=products&query=HTTP&take=10&skip=0")
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ total: 1, hasMore: false });
        expect(response.body.items[0]).toMatchObject({
          type: "products",
          title: "Producto creado",
          description: expect.stringContaining("Producto HTTP"),
        });
      });
  });

  it("rejects invalid filters and does not expose history mutations", async () => {
    await request(app.getHttpServer())
      .get("/api/history?month=2026-13")
      .expect(400);
    await request(app.getHttpServer())
      .get("/api/history?month=2026-04&type=unknown")
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/history")
      .send({})
      .expect(404);
  });
});
