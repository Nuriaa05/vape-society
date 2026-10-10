import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { BadRequestException } from "@nestjs/common";

import { StockRulesService } from "../src/domain/stock-rules.service";
import { HistoryService } from "../src/modules/history/history.service";
import { PurchasesService } from "../src/modules/purchases/purchases.service";
import { ReportsService } from "../src/modules/reports/reports.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

const migrationName = "20261010000000_purchase_calendar_dates";
const backendRoot = join(__dirname, "..");

describe("purchase calendar dates", () => {
  let db: SeededTestDatabase;
  let purchases: PurchasesService;
  let history: HistoryService;
  let reports: ReportsService;

  beforeAll(async () => {
    db = await createSeededTestDatabase();
    const prisma = db.prisma as PrismaService;
    const stockRules = new StockRulesService(prisma);
    purchases = new PurchasesService(prisma, stockRules);
    history = new HistoryService(prisma);
    reports = new ReportsService(prisma, stockRules);
  });

  beforeEach(async () => {
    await db.prisma.stockMovement.deleteMany();
    await db.prisma.purchaseItem.deleteMany();
    await db.prisma.purchase.deleteMany();
    await db.prisma.supplier.updateMany({ data: { lastPurchase: null } });
    jest.useFakeTimers({
      now: new Date("2026-10-10T12:00:00.000Z"),
      doNotFake: [
        "hrtime",
        "nextTick",
        "performance",
        "queueMicrotask",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
  });

  afterEach(() => jest.useRealTimers());
  afterAll(async () => db.cleanup());

  function createPurchase(
    date?: string,
    status: "Pendiente" | "Registrada" = "Pendiente",
    unitCostAmountCents = 150000,
  ) {
    return purchases.create({
      supplierId: "s1",
      date,
      status,
      items: [{ productId: "p1", qty: 1, unitCostAmountCents }],
    });
  }

  it.each(["2026-10-01", "2027-01-01"])(
    "preserves the selected calendar day %s",
    async (day) => {
      const previousCount =
        (await history.getMonths()).find(
          (month) => month.month === day.slice(0, 7),
        )?.eventCount ?? 0;
      const purchase = await createPurchase(day);
      expect(purchase.date).toBe(`${day}T03:00:00.000Z`);
      const events = await history.findAll({
        month: day.slice(0, 7),
        day,
        type: "purchases",
      });
      expect(events.items.map((event) => event.entityId)).toEqual([
        purchase.id,
      ]);
      const months = await history.getMonths();
      expect(
        months.find((month) => month.month === day.slice(0, 7))?.eventCount,
      ).toBe(previousCount + 1);
    },
  );

  it("keeps the selected day when editing, registering and cancelling a draft", async () => {
    const purchase = await createPurchase("2026-09-30");
    const edited = await purchases.update(purchase.id, { date: "2026-10-01" });
    expect(edited.date).toBe("2026-10-01T03:00:00.000Z");
    expect((await purchases.register(purchase.id)).date).toBe(edited.date);
    expect(
      (await purchases.cancel(purchase.id, { reason: "Prueba" })).date,
    ).toBe(edited.date);
    const cancelled = await db.prisma.purchase.findUniqueOrThrow({
      where: { id: purchase.id },
    });
    expect(cancelled.cancelledAt?.toISOString()).toBe(
      "2026-10-10T12:00:00.000Z",
    );
  });

  it.each([
    ["2026-11-01T02:59:59.999Z", "2026-10-31"],
    ["2026-11-01T03:00:00.000Z", "2026-11-01"],
    ["2027-01-01T02:59:59.999Z", "2026-12-31"],
    ["2027-01-01T03:00:00.000Z", "2027-01-01"],
  ])("defaults to the Argentine calendar day at %s", async (now, day) => {
    jest.setSystemTime(new Date(now));
    expect((await createPurchase()).date).toBe(`${day}T03:00:00.000Z`);
  });

  it.each(["2026-10-01T02:30:00.000Z", "2026-10-01T23:30:00-03:00"])(
    "preserves an explicitly supplied timestamp %s",
    async (timestamp) => {
      expect((await createPurchase(timestamp)).date).toBe(
        new Date(timestamp).toISOString(),
      );
    },
  );

  it("rejects impossible calendar dates instead of moving them to another month", async () => {
    await expect(createPurchase("2026-02-31")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await db.prisma.purchase.count()).toBe(0);
  });

  it("includes first-day registered purchases in their month and excludes other months and statuses", async () => {
    const first = await createPurchase("2026-10-01", "Registrada");
    await createPurchase("2026-09-30", "Registrada");
    await createPurchase("2026-11-01", "Registrada", 900000);
    await createPurchase("2026-10-01", "Pendiente");
    const cancelled = await createPurchase("2026-10-01", "Registrada");
    await purchases.cancel(cancelled.id, { reason: "Prueba" });

    expect(
      (await reports.getCommercialSummary()).monthlyPurchasesAmountCents,
    ).toBe(150000);
    const october = await history.findAll({
      month: "2026-10",
      day: "2026-10-01",
      type: "purchases",
    });
    expect(october.items).toHaveLength(3);
    expect(october.items.some((event) => event.entityId === first.id)).toBe(
      true,
    );
    expect(
      october.items.every(
        (event) => event.occurredAt === "2026-10-01T03:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("migrates legacy calendar dates once while preserving operational data and actual timestamps", async () => {
    const entries = [
      {
        id: "legacy-registered",
        supplierId: "s1",
        date: "2026-10-01T00:00:00.000Z",
        status: "Registrada",
      },
      {
        id: "legacy-pending",
        supplierId: "s2",
        date: "2026-10-31T00:00:00.000Z",
        status: "Pendiente",
      },
      {
        id: "legacy-cancelled",
        supplierId: "s2",
        date: "2027-01-01T00:00:00.000Z",
        status: "Anulada",
      },
      {
        id: "already-correct",
        supplierId: "s3",
        date: "2026-10-03T03:00:00.000Z",
        status: "Registrada",
      },
      {
        id: "actual-time",
        supplierId: "s1",
        date: "2026-10-01T02:30:00.000Z",
        status: "Registrada",
      },
    ];
    for (const entry of entries) {
      await db.prisma.purchase.create({
        data: {
          ...entry,
          date: new Date(entry.date),
          totalAmountCents: 150000,
          createdAt: new Date("2026-10-10T12:34:56.000Z"),
          updatedAt: new Date("2026-10-10T13:00:00.000Z"),
          cancelledAt:
            entry.status === "Anulada"
              ? new Date("2027-01-03T16:00:00.000Z")
              : null,
          cancelReason: entry.status === "Anulada" ? "Prueba anterior" : null,
          items: {
            create: {
              productId: "p1",
              productName: "Pod de prueba",
              qty: 1,
              unitCostAmountCents: 150000,
              lineTotalAmountCents: 150000,
            },
          },
        },
      });
    }
    await db.prisma.supplier.update({
      where: { id: "s1" },
      data: { lastPurchase: new Date("2026-10-01T02:30:00.000Z") },
    });
    await db.prisma.supplier.update({
      where: { id: "s2" },
      data: { lastPurchase: new Date("2026-07-15T00:00:00.000Z") },
    });
    const before = await db.prisma.purchase.findMany({
      include: { items: true },
      orderBy: { id: "asc" },
    });
    const stockBefore = await db.prisma.product.findMany({
      select: { id: true, physicalStock: true },
      orderBy: { id: "asc" },
    });
    // Simulate an installed database before this migration, only inside this temporary database.
    await db.prisma
      .$executeRaw`DELETE FROM "_prisma_migrations" WHERE "migration_name" = ${migrationName}`;
    await deployMigrations();

    const after = await db.prisma.purchase.findMany({
      include: { items: true },
      orderBy: { id: "asc" },
    });
    expect(after).toEqual(
      before.map((purchase) => ({
        ...purchase,
        date: purchase.id.startsWith("legacy-")
          ? new Date(
              purchase.date.toISOString().slice(0, 10) + "T03:00:00.000Z",
            )
          : purchase.date,
      })),
    );
    expect(
      await db.prisma.product.findMany({
        select: { id: true, physicalStock: true },
        orderBy: { id: "asc" },
      }),
    ).toEqual(stockBefore);
    expect(await db.prisma.stockMovement.count()).toBe(0);
    expect(
      (
        await db.prisma.supplier.findUniqueOrThrow({ where: { id: "s1" } })
      ).lastPurchase?.toISOString(),
    ).toBe("2026-10-01T03:00:00.000Z");
    expect(
      (
        await db.prisma.supplier.findUniqueOrThrow({ where: { id: "s2" } })
      ).lastPurchase?.toISOString(),
    ).toBe("2026-07-15T00:00:00.000Z");
    expect(
      (await reports.getCommercialSummary()).monthlyPurchasesAmountCents,
    ).toBe(300000);
    expect(
      (
        await history.findAll({
          month: "2026-10",
          day: "2026-10-01",
          type: "purchases",
        })
      ).items.map((event) => event.entityId),
    ).toEqual(["legacy-registered"]);

    const explicitMidnight = await createPurchase("2026-10-02T00:00:00.000Z");
    const snapshot = await db.prisma.purchase.findMany({
      orderBy: { id: "asc" },
    });
    await deployMigrations();
    expect(
      await db.prisma.purchase.findMany({ orderBy: { id: "asc" } }),
    ).toEqual(snapshot);
    expect((await purchases.findById(explicitMidnight.id)).date).toBe(
      "2026-10-02T00:00:00.000Z",
    );
  });

  async function deployMigrations() {
    await db.prisma.$disconnect();
    execFileSync(
      process.execPath,
      [
        join(backendRoot, "node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
      ],
      {
        cwd: backendRoot,
        env: { ...process.env, DATABASE_URL: db.url, CHECKPOINT_DISABLE: "1" },
        stdio: "pipe",
      },
    );
  }
});
