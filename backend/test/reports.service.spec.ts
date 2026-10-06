import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { StockRulesService } from "../src/domain/stock-rules.service";
import { ReportsService } from "../src/modules/reports/reports.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("ReportsService", () => {
  let db: SeededTestDatabase;
  let service: ReportsService;

  beforeEach(async () => {
    db = await createSeededTestDatabase();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        StockRulesService,
        {
          provide: PrismaService,
          useValue: db.prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(ReportsService);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("builds dashboard metrics from confirmed sales, stock and pending deliveries", async () => {
    await createSale(db, {
      number: "910001",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      items: [
        {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          barcode: "7790001000017",
          qty: 2,
          unitPriceAmountCents: 268000,
        },
      ],
    });
    await createSale(db, {
      number: "910002",
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm2",
      items: [
        {
          productId: "p8",
          productName: "Provoletas con orégano x4",
          barcode: "7790001000086",
          qty: 2,
          unitPriceAmountCents: 386000,
        },
      ],
    });
    await createSale(db, {
      number: "910003",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm3",
      status: "Anulada",
      items: [
        {
          productId: "p3",
          productName: "Papas prefritas baston 1kg",
          barcode: "7790001000031",
          qty: 10,
          unitPriceAmountCents: 225000,
        },
      ],
    });

    const summary = await service.getDashboardSummary();

    expect(summary).toMatchObject({
      todayTotalAmountCents: 1308000,
      monthlyTotalAmountCents: 1308000,
      confirmedSalesCount: 2,
      productCount: 12,
      pendingDeliveriesTotalAmountCents: 772000,
    });
    expect(summary.pendingDeliveries).toEqual([
      expect.objectContaining({
        number: "910002",
        deliveryStatus: "Pendiente",
        totalAmountCents: 772000,
      }),
    ]);
    expect(
      summary.recentSales.map((sale: { number: string }) => sale.number),
    ).toEqual(["910002", "910001"]);
    expect(summary.stockAlerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: "p8",
          availableStock: 1,
        }),
      ]),
    );
    expect(summary.stockValueAmountCents).toBeGreaterThan(0);
  });

  it("builds commercial metrics excluding cancelled sales and inactive purchases", async () => {
    await createSale(db, {
      number: "920001",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      items: [
        {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          barcode: "7790001000017",
          qty: 2,
          unitPriceAmountCents: 268000,
        },
      ],
    });
    await createSale(db, {
      number: "920002",
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm2",
      items: [
        {
          productId: "p3",
          productName: "Papas prefritas baston 1kg",
          barcode: "7790001000031",
          qty: 2,
          unitPriceAmountCents: 225000,
        },
      ],
    });
    await createSale(db, {
      number: "920003",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm3",
      status: "Anulada",
      items: [
        {
          productId: "p7",
          productName: "Nuggets de pollo 500g",
          barcode: "7790001000079",
          qty: 5,
          unitPriceAmountCents: 315000,
        },
      ],
    });
    await createPurchase(db, {
      id: "registered-purchase",
      status: "Registrada",
      totalAmountCents: 500000,
    });
    await createPurchase(db, {
      id: "pending-purchase",
      status: "Pendiente",
      totalAmountCents: 900000,
    });

    const summary = await service.getCommercialSummary();

    expect(summary).toMatchObject({
      dailyTotalAmountCents: 986000,
      monthlyTotalAmountCents: 986000,
      monthlyPurchasesAmountCents: 500000,
      salesPurchasesDifferenceAmountCents: 486000,
      deliveredSalesCount: 1,
      pendingSalesCount: 1,
      pendingSalesTotalAmountCents: 450000,
      productCount: 12,
    });
    expect(summary.sales.map((sale: { number: string }) => sale.number)).toEqual(
      ["920002", "920001"],
    );
  });

  it("aggregates top products from confirmed sales only", async () => {
    await createSale(db, {
      number: "930001",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      items: [
        {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          barcode: "7790001000017",
          qty: 1,
          unitPriceAmountCents: 268000,
        },
        {
          productId: "p3",
          productName: "Papas prefritas baston 1kg",
          barcode: "7790001000031",
          qty: 2,
          unitPriceAmountCents: 225000,
        },
      ],
    });
    await createSale(db, {
      number: "930002",
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm2",
      items: [
        {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          barcode: "7790001000017",
          qty: 2,
          unitPriceAmountCents: 268000,
        },
      ],
    });
    await createSale(db, {
      number: "930003",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm3",
      status: "Anulada",
      items: [
        {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          barcode: "7790001000017",
          qty: 50,
          unitPriceAmountCents: 268000,
        },
      ],
    });

    const topProducts = await service.getTopProducts();

    expect(topProducts[0]).toMatchObject({
      productId: "p1",
      name: "Hamburguesas de carne x4",
      qty: 3,
      totalAmountCents: 804000,
    });
    expect(topProducts[1]).toMatchObject({
      productId: "p3",
      qty: 2,
      totalAmountCents: 450000,
    });
  });

  it("sorts top products by units by default and by revenue when requested", async () => {
    await createSale(db, {
      number: "930101",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      items: [
        {
          productId: "p1",
          productName: "Mas unidades",
          barcode: "7790001000017",
          qty: 5,
          unitPriceAmountCents: 10000,
        },
      ],
    });
    await createSale(db, {
      number: "930102",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      items: [
        {
          productId: "p3",
          productName: "Mas ingresos",
          barcode: "7790001000031",
          qty: 1,
          unitPriceAmountCents: 100000,
        },
      ],
    });

    const byQuantity = await service.getTopProducts();
    const byRevenue = await service.getTopProducts(
      undefined,
      undefined,
      undefined,
      "revenue",
    );

    expect(byQuantity.map((item) => item.name)).toEqual([
      "Mas unidades",
      "Mas ingresos",
    ]);
    expect(byRevenue.map((item) => item.name)).toEqual([
      "Mas ingresos",
      "Mas unidades",
    ]);
  });

  it("filters top products by an exact half-open interval", async () => {
    const from = new Date("2026-07-06T03:00:00.000Z");
    const to = new Date("2026-07-13T03:00:00.000Z");

    await createSale(db, {
      number: "930201",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      date: from,
      items: [
        {
          productId: "p1",
          productName: "Dentro del tramo",
          barcode: "7790001000017",
          qty: 2,
          unitPriceAmountCents: 50000,
        },
      ],
    });
    await createSale(db, {
      number: "930202",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      date: to,
      items: [
        {
          productId: "p3",
          productName: "Fuera del tramo",
          barcode: "7790001000031",
          qty: 9,
          unitPriceAmountCents: 50000,
        },
      ],
    });

    const topProducts = await service.getTopProducts(
      undefined,
      from.toISOString(),
      to.toISOString(),
    );

    expect(topProducts.map((item) => item.name)).toEqual(["Dentro del tramo"]);
  });

  it("rejects ambiguous or invalid top product filters", async () => {
    const from = "2026-07-06T03:00:00.000Z";
    const to = "2026-07-13T03:00:00.000Z";

    await expect(
      service.getTopProducts("30d", from, to),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getTopProducts(undefined, from),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getTopProducts(undefined, "fecha-invalida", to),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getTopProducts(undefined, to, from),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getTopProducts(undefined, undefined, undefined, "unknown"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns every sold product so the frontend can progressively reveal them", async () => {
    const productIds = ["p1", "p2", "p3", "p4", "p5", "p6"];

    for (const [index, productId] of productIds.entries()) {
      await createSale(db, {
        number: `93100${index}`,
        deliveryStatus: "Entregado",
        paymentMethodId: "pm1",
        items: [
          {
            productId,
            productName: `Producto ${index + 1}`,
            barcode: `77900010010${index}`,
            qty: 1,
            unitPriceAmountCents: (index + 1) * 10000,
          },
        ],
      });
    }

    const topProducts = await service.getTopProducts();

    expect(topProducts).toHaveLength(6);
    expect(topProducts.map((item) => item.name)).toContain("Producto 1");
  });

  it("filters sold products by range while keeping all-time totals available", async () => {
    const oldDate = new Date();
    oldDate.setUTCFullYear(oldDate.getUTCFullYear() - 2);

    await createSale(db, {
      number: "932001",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      date: oldDate,
      items: [
        {
          productId: "p1",
          productName: "Producto historico",
          barcode: "7790001000017",
          qty: 4,
          unitPriceAmountCents: 100000,
        },
      ],
    });
    await createSale(db, {
      number: "932002",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      items: [
        {
          productId: "p3",
          productName: "Producto reciente",
          barcode: "7790001000031",
          qty: 2,
          unitPriceAmountCents: 200000,
        },
      ],
    });

    const allTime = await service.getTopProducts("all");
    const last30Days = await service.getTopProducts("30d");

    expect(allTime.map((item) => item.name)).toEqual(
      expect.arrayContaining(["Producto historico", "Producto reciente"]),
    );
    expect(last30Days.map((item) => item.name)).toEqual(["Producto reciente"]);
  });

  it("reports direct, combo, delivered and reserved product consumption", async () => {
    await createSale(db, {
      number: "933001",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      items: [
        {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          barcode: "7790001000017",
          qty: 2,
          unitPriceAmountCents: 268000,
        },
      ],
    });
    await createSale(db, {
      number: "933002",
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm1",
      items: [
        {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          barcode: "7790001000017",
          qty: 1,
          unitPriceAmountCents: 268000,
        },
      ],
    });
    await createComboSale(db, {
      number: "933003",
      comboId: "combo-consumption",
      comboName: "Combo consumo",
      qty: 3,
      unitPriceAmountCents: 600000,
      components: [
        {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          barcode: "7790001000017",
          qtyPerCombo: 2,
        },
        {
          productId: "p3",
          productName: "Papas prefritas baston 1kg",
          barcode: "7790001000031",
          qtyPerCombo: 1,
        },
      ],
    });

    const consumption = await (
      service as ReportsService & {
        getProductConsumption: (range?: string) => Promise<
          Array<{
            productId: string;
            directQty: number;
            comboQty: number;
            deliveredQty: number;
            reservedQty: number;
            totalQty: number;
          }>
        >;
      }
    ).getProductConsumption("all");

    expect(consumption).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: "p1",
          directQty: 3,
          comboQty: 6,
          deliveredQty: 8,
          reservedQty: 1,
          totalQty: 9,
        }),
        expect.objectContaining({
          productId: "p3",
          directQty: 0,
          comboQty: 3,
          deliveredQty: 3,
          reservedQty: 0,
          totalQty: 3,
        }),
      ]),
    );
  });

  it("returns every confirmed sale for all-time report exports", async () => {
    const oldDate = new Date();
    oldDate.setUTCFullYear(oldDate.getUTCFullYear() - 2);

    await createSale(db, {
      number: "934001",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      date: oldDate,
      items: [
        {
          productId: "p1",
          productName: "Venta historica",
          barcode: "7790001000017",
          qty: 1,
          unitPriceAmountCents: 100000,
        },
      ],
    });
    await createSale(db, {
      number: "934002",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      items: [
        {
          productId: "p3",
          productName: "Venta reciente",
          barcode: "7790001000031",
          qty: 1,
          unitPriceAmountCents: 200000,
        },
      ],
    });
    await createSale(db, {
      number: "934003",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      status: "Anulada",
      items: [
        {
          productId: "p7",
          productName: "Venta anulada",
          barcode: "7790001000079",
          qty: 1,
          unitPriceAmountCents: 300000,
        },
      ],
    });

    const reportService = service as ReportsService & {
      getSalesExport: (range?: string) => Promise<Array<{ number: string }>>;
    };
    const allTime = await reportService.getSalesExport("all");
    const last30Days = await reportService.getSalesExport("30d");

    expect(allTime.map((sale) => sale.number)).toEqual([
      "934002",
      "934001",
    ]);
    expect(last30Days.map((sale) => sale.number)).toEqual(["934002"]);
  });

  it("reports combo sales as combos instead of individual components", async () => {
    await createComboSale(db, {
      number: "935001",
      comboId: "combo-report",
      comboName: "Combo Reporte",
      qty: 3,
      unitPriceAmountCents: 600000,
      components: [
        {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          barcode: "7790001000017",
          qtyPerCombo: 1,
        },
        {
          productId: "p3",
          productName: "Papas prefritas baston 1kg",
          barcode: "7790001000031",
          qtyPerCombo: 2,
        },
      ],
    });

    const topProducts = await service.getTopProducts();

    expect(topProducts[0]).toMatchObject({
      comboId: "combo-report",
      name: "Combo Reporte",
      qty: 3,
      totalAmountCents: 1800000,
      components: [
        expect.objectContaining({
          productId: "p1",
          qty: 3,
        }),
        expect.objectContaining({
          productId: "p3",
          qty: 6,
        }),
      ],
    });
    expect(topProducts.some((item) => item.productId === "p1")).toBe(false);
    expect(topProducts.some((item) => item.productId === "p3")).toBe(false);
  });

  it("groups confirmed sales by historical payment labels", async () => {
    await createSale(db, {
      number: "940001",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      paymentMethodName: "Efectivo",
      items: [
        {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          barcode: "7790001000017",
          qty: 1,
          unitPriceAmountCents: 60000,
        },
      ],
    });
    await createSale(db, {
      number: "940002",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      paymentMethodName: "Caja",
      items: [
        {
          productId: "p3",
          productName: "Papas prefritas baston 1kg",
          barcode: "7790001000031",
          qty: 1,
          unitPriceAmountCents: 40000,
        },
      ],
    });
    await createSale(db, {
      number: "940003",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm3",
      paymentMethodName: "Tarjeta historica",
      status: "Anulada",
      items: [
        {
          productId: "p7",
          productName: "Nuggets de pollo 500g",
          barcode: "7790001000079",
          qty: 1,
          unitPriceAmountCents: 100000,
        },
      ],
    });

    const methods = await service.getPaymentMethodsBreakdown();

    expect(methods).toEqual([
      expect.objectContaining({
        paymentMethodId: "pm1",
        label: "Caja",
        totalAmountCents: 40000,
        salesCount: 1,
        pct: 40,
      }),
      expect.objectContaining({
        paymentMethodId: "pm1",
        label: "Efectivo",
        totalAmountCents: 60000,
        salesCount: 1,
        pct: 60,
      }),
      expect.objectContaining({
        paymentMethodId: "pm2",
        label: "Transferencia",
        totalAmountCents: 0,
        salesCount: 0,
        pct: 0,
      }),
      expect.objectContaining({
        paymentMethodId: "pm3",
        label: "Tarjeta",
        totalAmountCents: 0,
        salesCount: 0,
        pct: 0,
      }),
      expect.objectContaining({
        paymentMethodId: "pm4",
        label: "QR",
        totalAmountCents: 0,
        salesCount: 0,
        pct: 0,
      }),
      expect.objectContaining({
        paymentMethodId: "pm5",
        label: "Tarjeta Debito",
        totalAmountCents: 0,
        salesCount: 0,
        pct: 0,
      }),
      expect.objectContaining({
        paymentMethodId: "pm6",
        label: "Tarjeta Credito un pago",
        totalAmountCents: 0,
        salesCount: 0,
        pct: 0,
      }),
      expect.objectContaining({
        paymentMethodId: "pm7",
        label: "Tarjeta Credito cuotas",
        totalAmountCents: 0,
        salesCount: 0,
        pct: 0,
      }),
    ]);
  });

  it("returns full hourly sales series for supported periods and rejects unknown periods", async () => {
    const argentinaDayStart = startOfArgentinaDayForTest(new Date());
    await createSale(db, {
      number: "950001",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      date: addHoursForTest(argentinaDayStart, 7.5),
      items: [
        {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          barcode: "7790001000017",
          qty: 1,
          unitPriceAmountCents: 999000,
        },
      ],
    });
    await createSale(db, {
      number: "950002",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      date: addHoursForTest(argentinaDayStart, 8.5),
      items: [
        {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          barcode: "7790001000017",
          qty: 1,
          unitPriceAmountCents: 123000,
        },
      ],
    });
    await createSale(db, {
      number: "950003",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      date: addHoursForTest(argentinaDayStart, 21.25),
      items: [
        {
          productId: "p3",
          productName: "Papas prefritas baston 1kg",
          barcode: "7790001000031",
          qty: 1,
          unitPriceAmountCents: 45000,
        },
      ],
    });
    await createSale(db, {
      number: "950004",
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      date: addHoursForTest(argentinaDayStart, 22.25),
      items: [
        {
          productId: "p7",
          productName: "Nuggets de pollo 500g",
          barcode: "7790001000079",
          qty: 1,
          unitPriceAmountCents: 777000,
        },
      ],
    });

    const hourly = await service.getSalesSeries("hour");
    const monthly = await service.getSalesSeries("month");

    expect(hourly.period).toBe("hour");
    expect(hourly.points).toHaveLength(24);
    expect(hourly.points[0].label).toBe("00:00");
    expect(hourly.points.at(-1)?.label).toBe("23:00");
    expect(hourly.points[0]).toMatchObject({
      from: expect.any(String),
      to: expect.any(String),
    });
    expect(new Date(hourly.points[0].from).getTime()).toBeLessThan(
      new Date(hourly.points[0].to).getTime(),
    );
    expect(hourly.points[0].fullLabel).not.toContain("T");
    expect(hourly.points[0].fullLabel).not.toContain("Z");
    expect(hourly.points[7].v).toBe(999000);
    expect(hourly.points[8].v).toBe(123000);
    expect(hourly.points[21].v).toBe(45000);
    expect(hourly.points[22].v).toBe(777000);
    expect(
      hourly.points.reduce(
        (sum: number, point: { v: number }) => sum + point.v,
        0,
      ),
    ).toBe(1944000);
    expect(monthly.points).toHaveLength(10);
    await expect(service.getSalesSeries("invalid")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  describe("sold units series", () => {
    beforeEach(() => {
      jest.useFakeTimers({
        now: new Date("2026-10-04T01:30:00.000Z"),
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

    afterEach(() => {
      jest.useRealTimers();
    });

    async function sellUnits(
      number: string,
      date: string,
      qty: number,
      options: {
        status?: "Confirmada" | "Anulada";
        deliveryStatus?: "Pendiente" | "Entregado";
      } = {},
    ) {
      return createSale(db, {
        number,
        date: new Date(date),
        deliveryStatus: options.deliveryStatus ?? "Entregado",
        status: options.status,
        paymentMethodId: "pm1",
        items: [
          {
            productId: "p1",
            productName: "Producto de prueba",
            barcode: "7790001000017",
            qty,
            unitPriceAmountCents: 123000,
          },
        ],
      });
    }

    it("counts direct and combo units across seven Argentine days, excluding cancellations and dates outside the period", async () => {
      await sellUnits("960001", "2026-09-27T03:00:00.000Z", 2);
      await sellUnits("960002", "2026-10-04T01:00:00.000Z", 3, {
        deliveryStatus: "Pendiente",
      });
      await sellUnits("960003", "2026-10-03T15:00:00.000Z", 20, {
        status: "Anulada",
      });
      await sellUnits("960004", "2026-09-27T02:59:59.999Z", 100);
      await sellUnits("960005", "2026-10-04T03:00:00.000Z", 50);
      await createComboSale(db, {
        number: "960006",
        comboId: "units-combo",
        comboName: "Combo de prueba",
        qty: 3,
        unitPriceAmountCents: 450000,
        components: [
          {
            productId: "p1",
            productName: "Producto de prueba",
            barcode: "7790001000017",
            qtyPerCombo: 2,
          },
          {
            productId: "p2",
            productName: "Otro producto de prueba",
            barcode: "7790001000024",
            qtyPerCombo: 1,
          },
        ],
      });

      const series = await service.getSoldUnitsSeries();

      expect(series.period).toBe("week");
      expect(series.meta.subtitle).toBe("Últimos 7 días");
      expect(series.points.map((point) => point.units)).toEqual([
        2, 0, 0, 0, 0, 0, 12,
      ]);
      expect(series.points.map((point) => point.label)).toEqual([
        "Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb",
      ]);
      expect(series.points[0]).toMatchObject({
        fullLabel: "27/09/2026",
        from: "2026-09-27T03:00:00.000Z",
      });
      expect(series.points.at(-1)?.to).toBe("2026-10-04T03:00:00.000Z");
    });

    it("keeps all twelve calendar months and groups sold units using Argentine month boundaries", async () => {
      await sellUnits("961001", "2026-01-01T03:00:00.000Z", 2);
      await sellUnits("961002", "2026-09-01T02:59:59.999Z", 3);
      await sellUnits("961003", "2026-09-01T03:00:00.000Z", 4);
      await sellUnits("961004", "2026-10-01T02:59:59.999Z", 5);
      await sellUnits("961005", "2026-10-01T03:00:00.000Z", 6);
      await sellUnits("961006", "2026-01-01T02:59:59.999Z", 100);
      await sellUnits("961007", "2026-10-04T03:00:00.000Z", 50);
      await sellUnits("961008", "2026-11-01T03:00:00.000Z", 25);

      const series = await service.getSoldUnitsSeries("month");

      expect(series.meta.subtitle).toBe("Unidades por mes, 2026");
      expect(series.points.map((point) => point.label)).toEqual([
        "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
      ]);
      expect(series.points.map((point) => point.units)).toEqual([
        2, 0, 0, 0, 0, 0, 0, 3, 9, 6, 0, 0,
      ]);
      expect(series.points[0].from).toBe("2026-01-01T03:00:00.000Z");
      expect(series.points[9].to).toBe("2026-11-01T03:00:00.000Z");
      expect(series.points.at(-1)?.to).toBe("2027-01-01T03:00:00.000Z");
    });

    it("shows January through December at the start of the Argentine year without counting future sales", async () => {
      jest.setSystemTime(new Date("2026-01-01T03:30:00.000Z"));
      await sellUnits("963001", "2026-01-01T02:59:59.999Z", 100);
      await sellUnits("963002", "2026-01-01T03:00:00.000Z", 2);
      await sellUnits("963003", "2026-02-01T03:00:00.000Z", 50);

      const series = await service.getSoldUnitsSeries("month");

      expect(series.meta.subtitle).toBe("Unidades por mes, 2026");
      expect(series.points.map((point) => point.label)).toEqual([
        "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
      ]);
      expect(series.points.map((point) => point.units)).toEqual([
        2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ]);
      expect(series.points.every((point) => point.from < point.to)).toBe(true);
      expect(series.points[0].from).toBe("2026-01-01T03:00:00.000Z");
      expect(series.points.at(-1)?.to).toBe("2027-01-01T03:00:00.000Z");
    });

    it("zero-fills empty periods and chooses the Argentine year at the UTC year boundary", async () => {
      jest.setSystemTime(new Date("2026-01-01T01:30:00.000Z"));

      const weekly = await service.getSoldUnitsSeries("week");
      const monthly = await service.getSoldUnitsSeries("month");

      expect(weekly.points).toHaveLength(7);
      expect(weekly.points.at(-1)?.fullLabel).toBe("31/12/2025");
      expect(monthly.meta.subtitle).toBe("Unidades por mes, 2025");
      expect(monthly.points).toHaveLength(12);
      expect(monthly.points[0].from).toBe("2025-01-01T03:00:00.000Z");
      expect(monthly.points.at(-1)?.to).toBe("2026-01-01T03:00:00.000Z");
      expect([...weekly.points, ...monthly.points].every((point) => point.units === 0)).toBe(true);
    });

    it("rejects unsupported unit periods", async () => {
      await expect(service.getSoldUnitsSeries("year")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});

function addHoursForTest(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function startOfArgentinaDayForTest(date: Date): Date {
  const entries = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)] as const);
  const parts = Object.fromEntries(entries) as {
    year: number;
    month: number;
    day: number;
  };

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 3));
}

type SaleItemInput = {
  productId: string;
  productName: string;
  barcode: string;
  qty: number;
  unitPriceAmountCents: number;
};

async function createSale(
  db: SeededTestDatabase,
  input: {
    number: string;
    deliveryStatus: "Pendiente" | "Entregado";
    paymentMethodId: string;
    paymentMethodName?: string;
    items: SaleItemInput[];
    status?: "Confirmada" | "Anulada";
    date?: Date;
  },
) {
  const totalAmountCents = input.items.reduce(
    (sum, item) => sum + item.qty * item.unitPriceAmountCents,
    0,
  );

  return db.prisma.sale.create({
    data: {
      number: input.number,
      date: input.date ?? new Date(),
      deliveryStatus: input.deliveryStatus,
      status: input.status ?? "Confirmada",
      paymentMethodId: input.paymentMethodId,
      paymentMethodName: input.paymentMethodName ?? "",
      subtotalAmountCents: totalAmountCents,
      totalAmountCents,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          barcode: item.barcode,
          qty: item.qty,
          unitPriceAmountCents: item.unitPriceAmountCents,
          lineTotalAmountCents: item.qty * item.unitPriceAmountCents,
        })),
      },
    },
  });
}

async function createPurchase(
  db: SeededTestDatabase,
  input: {
    id: string;
    status: "Pendiente" | "Registrada" | "Anulada";
    totalAmountCents: number;
  },
) {
  return db.prisma.purchase.create({
    data: {
      id: input.id,
      supplierId: "s1",
      date: new Date(),
      status: input.status,
      totalAmountCents: input.totalAmountCents,
      items: {
        create: {
          productId: "p1",
          productName: "Hamburguesas de carne x4",
          qty: 1,
          unitCostAmountCents: input.totalAmountCents,
          lineTotalAmountCents: input.totalAmountCents,
        },
      },
    },
  });
}

async function createComboSale(
  db: SeededTestDatabase,
  input: {
    number: string;
    comboId: string;
    comboName: string;
    qty: number;
    unitPriceAmountCents: number;
    components: Array<{
      productId: string;
      productName: string;
      barcode: string;
      qtyPerCombo: number;
    }>;
  },
) {
  await db.prisma.combo.create({
    data: {
      id: input.comboId,
      name: input.comboName,
      priceAmountCents: input.unitPriceAmountCents,
      items: {
        create: input.components.map((component) => ({
          productId: component.productId,
          qty: component.qtyPerCombo,
        })),
      },
    },
  });

  return db.prisma.sale.create({
    data: {
      number: input.number,
      date: new Date(),
      deliveryStatus: "Entregado",
      status: "Confirmada",
      paymentMethodId: "pm1",
      subtotalAmountCents: input.qty * input.unitPriceAmountCents,
      totalAmountCents: input.qty * input.unitPriceAmountCents,
      items: {
        create: {
          itemType: "Combo",
          comboId: input.comboId,
          productId: null,
          productName: input.comboName,
          barcode: "",
          qty: input.qty,
          unitPriceAmountCents: input.unitPriceAmountCents,
          lineTotalAmountCents: input.qty * input.unitPriceAmountCents,
          comboDiscountAmountCents: 0,
          components: {
            create: input.components.map((component) => ({
              productId: component.productId,
              productName: component.productName,
              barcode: component.barcode,
              qtyPerCombo: component.qtyPerCombo,
              totalQty: component.qtyPerCombo * input.qty,
            })),
          },
        },
      },
    },
  });
}
