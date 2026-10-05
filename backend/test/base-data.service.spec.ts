import { Test } from "@nestjs/testing";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

import { BaseDataService } from "../src/base-data.service";
import { PrismaService } from "../src/prisma/prisma.service";

type TestDatabase = {
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
};

const backendRoot = join(__dirname, "..");
const prismaCli = join(
  backendRoot,
  "node_modules",
  "prisma",
  "build",
  "index.js",
);

const toSqliteUrl = (path: string): string =>
  `file:${path.replace(/\\/g, "/")}`;

async function createUnseededTestDatabase(): Promise<TestDatabase> {
  const tempDir = mkdtempSync(join(tmpdir(), "lozano-production-init-"));
  const databasePath = join(tempDir, "test.db");
  const databaseUrl = toSqliteUrl(databasePath);

  writeFileSync(databasePath, "");

  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  return {
    prisma,
    cleanup: async () => {
      await prisma.$disconnect();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

describe("BaseDataService", () => {
  let db: TestDatabase;
  let service: BaseDataService;

  beforeEach(async () => {
    db = await createUnseededTestDatabase();

    const moduleRef = await Test.createTestingModule({
      providers: [
        BaseDataService,
        {
          provide: PrismaService,
          useValue: db.prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(BaseDataService);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("creates only production base settings and payment methods", async () => {
    await service.ensureBaseData();

    await expect(db.prisma.paymentMethod.findMany()).resolves.toHaveLength(6);
    await expect(
      db.prisma.paymentMethod.findUnique({ where: { id: "pm1" } }),
    ).resolves.toMatchObject({ cashHandling: true, surchargeBasisPoints: 0 });
    await expect(
      db.prisma.paymentMethod.findUnique({ where: { id: "pm5" } }),
    ).resolves.toMatchObject({
      cashHandling: false,
      surchargeBasisPoints: 250,
    });
    await expect(
      db.prisma.businessSettings.findUnique({
        where: { id: "default" },
      }),
    ).resolves.toMatchObject({ name: "Nuevo comercio" });
    await expect(
      db.prisma.receiptSettings.findUnique({
        where: { id: "default" },
      }),
    ).resolves.toMatchObject({ header: "Nuevo comercio" });
    await expect(
      db.prisma.appSettings.findUnique({
        where: { id: "default" },
      }),
    ).resolves.toMatchObject({ defaultMarginPct: 45 });
    await expect(
      db.prisma.counter.findUnique({
        where: { key: "saleReceiptNumber" },
      }),
    ).resolves.toMatchObject({ value: 0 });
    await expect(
      db.prisma.supplier.findUnique({
        where: { id: "local" },
      }),
    ).resolves.toMatchObject({
      name: "Local",
      phone: "-",
      email: "",
      active: true,
    });

    await expect(db.prisma.product.count()).resolves.toBe(0);
    await expect(db.prisma.supplier.count()).resolves.toBe(1);
    await expect(db.prisma.purchase.count()).resolves.toBe(0);
    await expect(db.prisma.sale.count()).resolves.toBe(0);
  });

  it("does not overwrite existing local settings on later starts", async () => {
    await service.ensureBaseData();
    await db.prisma.businessSettings.update({
      where: { id: "default" },
      data: {
        name: "Nombre editado",
        address: "Direccion editada",
        cuit: "CUIT editado",
        phone: "Telefono editado",
      },
    });
    await db.prisma.paymentMethod.update({
      where: { id: "pm2" },
      data: { enabled: false, surchargeBasisPoints: 725, cashHandling: true },
    });

    await service.ensureBaseData();

    await expect(
      db.prisma.businessSettings.findUnique({
        where: { id: "default" },
      }),
    ).resolves.toMatchObject({
      name: "Nombre editado",
      address: "Direccion editada",
      cuit: "CUIT editado",
      phone: "Telefono editado",
    });
    await expect(
      db.prisma.paymentMethod.findUnique({
        where: { id: "pm2" },
      }),
    ).resolves.toMatchObject({
      enabled: false,
      surchargeBasisPoints: 725,
      cashHandling: true,
    });
  });

  it("disables the legacy generic card without removing it", async () => {
    await db.prisma.paymentMethod.create({
      data: { id: "pm3", name: "Tarjeta", enabled: true },
    });
    await service.ensureBaseData();
    await expect(
      db.prisma.paymentMethod.findUnique({ where: { id: "pm3" } }),
    ).resolves.toMatchObject({ name: "Tarjeta", enabled: false });
  });
});
