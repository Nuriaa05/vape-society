import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { seedDatabase } from "../prisma/seed";

const toSqliteUrl = (path: string): string =>
  `file:${path.replace(/\\/g, "/")}`;
const backendRoot = join(__dirname, "..");
const prismaCli = join(
  backendRoot,
  "node_modules",
  "prisma",
  "build",
  "index.js",
);

describe("database seed", () => {
  let prisma: PrismaClient;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "lozano-seed-"));
    const databasePath = join(tempDir, "seed-test.db");
    const databaseUrl = toSqliteUrl(databasePath);

    writeFileSync(databasePath, "");

    execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
      cwd: backendRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "pipe",
    });

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });

    await seedDatabase(prisma);
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("initializes settings without loading a commercial catalog", async () => {
    await expect(prisma.category.count()).resolves.toBe(0);
    await expect(prisma.paymentMethod.count()).resolves.toBe(6);
    await expect(prisma.coupon.count()).resolves.toBe(0);
    await expect(prisma.supplier.count()).resolves.toBe(1);
    await expect(prisma.product.count()).resolves.toBe(0);
    await expect(prisma.sale.count()).resolves.toBe(0);
    await expect(prisma.purchase.count()).resolves.toBe(0);
  });

  it("seeds settings and receipt counter", async () => {
    await expect(
      prisma.counter.findUniqueOrThrow({
        where: { key: "saleReceiptNumber" },
      }),
    ).resolves.toMatchObject({ value: 0 });

    await expect(
      prisma.businessSettings.findUniqueOrThrow({
        where: { id: "default" },
      }),
    ).resolves.toMatchObject({
      name: "Nuevo comercio",
      cuit: "",
    });

    await expect(
      prisma.receiptSettings.findUniqueOrThrow({
        where: { id: "default" },
      }),
    ).resolves.toMatchObject({
      header: "Nuevo comercio",
    });

    await expect(
      prisma.appSettings.findUniqueOrThrow({
        where: { id: "default" },
      }),
    ).resolves.toMatchObject({
      defaultMarginPct: 45,
    });
  });

  it("preserves user settings when initialization is repeated", async () => {
    await prisma.businessSettings.update({
      where: { id: "default" },
      data: { name: "Perfumería de prueba" },
    });
    await prisma.counter.update({
      where: { key: "saleReceiptNumber" },
      data: { value: 42 },
    });
    await seedDatabase(prisma);
    expect(
      await prisma.businessSettings.findUniqueOrThrow({
        where: { id: "default" },
      }),
    ).toMatchObject({ name: "Perfumería de prueba" });
    expect(
      await prisma.counter.findUniqueOrThrow({
        where: { key: "saleReceiptNumber" },
      }),
    ).toMatchObject({ value: 42 });
  });
});
