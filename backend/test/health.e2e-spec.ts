import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { HealthController } from "../src/health.controller";
import { PrismaService } from "../src/prisma/prisma.service";
import { createEmptyTestDatabase, type SeededTestDatabase } from "./prisma-test-database";

describe("Health endpoint", () => {
  let app: INestApplication;
  let db: SeededTestDatabase;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    db = await createEmptyTestDatabase();
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
    await db?.cleanup();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("returns local backend health metadata", async () => {
    const response = await request(app.getHttpServer())
      .get("/health")
      .expect(200);

    expect(response.body).toMatchObject({
      status: "ok",
      service: "retail-core-backend",
    });
    expect(typeof response.body.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });
});

describe("Database readiness endpoint", () => {
  let app: INestApplication;
  const prisma = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ ok: 1 }]),
    product: { count: jest.fn().mockResolvedValue(12) },
    combo: { count: jest.fn().mockResolvedValue(3) },
    sale: { count: jest.fn().mockResolvedValue(8) },
    purchase: { count: jest.fn().mockResolvedValue(5) },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("verifies minimum queries before reporting the imported database ready", async () => {
    await request(app.getHttpServer())
      .get("/health/ready")
      .expect(200, {
        status: "ready",
        service: "retail-core-backend",
        counts: { products: 12, combos: 3, sales: 8, purchases: 5 },
      });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith("SELECT 1 AS ok");
  });
});
