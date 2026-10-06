import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { StockRulesService, type StockReadModel } from "../../domain/stock-rules.service";
import { PrismaService } from "../../prisma/prisma.service";

export type ReportsPeriod = "hour" | "month" | "90d" | "year";
export type SoldUnitsPeriod = "week" | "month";
export type ReportRange = "all" | "30d" | "90d" | "year";

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";
const ARGENTINA_UTC_OFFSET_HOURS = 3;
const argentinaPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ARGENTINA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  hourCycle: "h23",
});
const argentinaDateFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: ARGENTINA_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const argentinaMonthFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: ARGENTINA_TIME_ZONE,
  month: "short",
  year: "numeric",
});

const reportSaleInclude = {
  paymentMethod: true,
  items: {
    include: { components: { orderBy: { productName: "asc" } } },
    orderBy: { productName: "asc" },
  },
} satisfies Prisma.SaleInclude;

type ReportSale = Prisma.SaleGetPayload<{ include: typeof reportSaleInclude }>;

type ReportPoint = {
  label: string;
  fullLabel: string;
  v: number;
};

type Bucket = ReportPoint & {
  start: Date;
  end: Date;
};

export type ReportSaleResponse = {
  id: string;
  number: string;
  date: string;
  deliveryStatus: string;
  status: string;
  paymentMethodId: string;
  payment: string;
  items: Array<{
    id: string;
    productId: string | null;
    comboId: string | null;
    itemType: string;
    productName: string;
    name: string;
    barcode: string;
    qty: number;
    unitPriceAmountCents: number;
    lineTotalAmountCents: number;
    comboDiscountAmountCents: number;
    components: Array<{
      productId: string;
      productName: string;
      name: string;
      barcode: string;
      qtyPerCombo: number;
      qty: number;
    }>;
  }>;
  totalAmountCents: number;
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockRulesService: StockRulesService,
  ) {}

  async getDashboardSummary() {
    const now = new Date();
    const todayStart = startOfArgentinaDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    const monthStart = startOfArgentinaMonth(now);
    const nextMonthStart = addMonths(monthStart, 1);

    const [
      todaySales,
      monthlySales,
      recentSales,
      pendingDeliveries,
      stockRows,
      products,
    ] = await Promise.all([
      this.findConfirmedSalesBetween(todayStart, tomorrowStart),
      this.findConfirmedSalesBetween(monthStart, nextMonthStart),
      this.prisma.sale.findMany({
        where: { status: "Confirmada" },
        include: reportSaleInclude,
        orderBy: { date: "desc" },
        take: 6,
      }),
      this.prisma.sale.findMany({
        where: {
          status: "Confirmada",
          deliveryStatus: "Pendiente",
        },
        include: reportSaleInclude,
        orderBy: { date: "desc" },
      }),
      this.stockRulesService.getStockForProducts(),
      this.prisma.product.findMany({
        where: { archived: false },
        select: {
          id: true,
          costAmountCents: true,
          physicalStock: true,
        },
      }),
    ]);

    return {
      todayTotalAmountCents: sumSales(todaySales),
      monthlyTotalAmountCents: sumSales(monthlySales),
      confirmedSalesCount: todaySales.length,
      stockValueAmountCents: products.reduce(
        (sum, product) => sum + product.costAmountCents * product.physicalStock,
        0,
      ),
      productCount: products.length,
      recentSales: recentSales.map((sale) => this.serializeSale(sale)),
      pendingDeliveries: pendingDeliveries.map((sale) =>
        this.serializeSale(sale),
      ),
      pendingDeliveriesTotalAmountCents: sumSales(pendingDeliveries),
      stockAlerts: this.getStockAlerts(stockRows),
    };
  }

  async getCommercialSummary() {
    const now = new Date();
    const todayStart = startOfArgentinaDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    const monthStart = startOfArgentinaMonth(now);
    const nextMonthStart = addMonths(monthStart, 1);

    const [dailySales, monthlySales, registeredPurchases, productCount] =
      await Promise.all([
        this.findConfirmedSalesBetween(todayStart, tomorrowStart),
        this.findConfirmedSalesBetween(monthStart, nextMonthStart),
        this.prisma.purchase.findMany({
          where: {
            status: "Registrada",
            date: {
              gte: monthStart,
              lt: nextMonthStart,
            },
          },
          select: { totalAmountCents: true },
        }),
        this.prisma.product.count({ where: { archived: false } }),
      ]);

    const monthlyTotalAmountCents = sumSales(monthlySales);
    const monthlyPurchasesAmountCents = registeredPurchases.reduce(
      (sum, purchase) => sum + purchase.totalAmountCents,
      0,
    );
    const pendingSales = monthlySales.filter(
      (sale) => sale.deliveryStatus === "Pendiente",
    );

    return {
      sales: monthlySales.map((sale) => this.serializeSale(sale)),
      dailyTotalAmountCents: sumSales(dailySales),
      monthlyTotalAmountCents,
      monthlyPurchasesAmountCents,
      salesPurchasesDifferenceAmountCents:
        monthlyTotalAmountCents - monthlyPurchasesAmountCents,
      deliveredSalesCount: monthlySales.filter(
        (sale) => sale.deliveryStatus === "Entregado",
      ).length,
      pendingSalesCount: pendingSales.length,
      pendingSalesTotalAmountCents: sumSales(pendingSales),
      productCount,
    };
  }

  async getSalesSeries(periodInput?: string) {
    const period = this.parsePeriod(periodInput ?? "month");
    const buckets = buildBuckets(period, new Date());
    const sales = await this.prisma.sale.findMany({
      where: {
        status: "Confirmada",
        date: {
          gte: buckets[0].start,
          lt: buckets[buckets.length - 1].end,
        },
      },
      select: {
        date: true,
        totalAmountCents: true,
      },
    });

    return {
      period,
      meta: getPeriodMeta(period),
      points: buckets.map((bucket) => ({
        label: bucket.label,
        fullLabel: bucket.fullLabel,
        from: bucket.start.toISOString(),
        to: bucket.end.toISOString(),
        v: sales
          .filter((sale) => sale.date >= bucket.start && sale.date < bucket.end)
          .reduce((sum, sale) => sum + sale.totalAmountCents, 0),
      })),
    };
  }

  async getSoldUnitsSeries(periodInput = "week") {
    if (periodInput !== "week" && periodInput !== "month") {
      throw new BadRequestException("Período de unidades no válido");
    }

    const now = new Date();
    const buckets = buildSoldUnitsBuckets(periodInput, now);
    const salesEnd = addDays(startOfArgentinaDay(now), 1);
    const sales = await this.prisma.sale.findMany({
      where: {
        status: "Confirmada",
        date: {
          gte: buckets[0].start,
          lt: salesEnd,
        },
      },
      select: {
        date: true,
        items: {
          select: {
            itemType: true,
            qty: true,
            components: { select: { totalQty: true } },
          },
        },
      },
    });

    return {
      period: periodInput,
      meta: {
        title: "Unidades vendidas",
        subtitle:
          periodInput === "week"
            ? "Últimos 7 días"
            : `Unidades por mes, ${getArgentinaParts(now).year}`,
      },
      points: buckets.map((bucket) => ({
        label: bucket.label,
        fullLabel: bucket.fullLabel,
        from: bucket.start.toISOString(),
        to: bucket.end.toISOString(),
        units: sales
          .filter((sale) => sale.date >= bucket.start && sale.date < bucket.end)
          .reduce(
            (sum, sale) =>
              sum +
              sale.items.reduce(
                (itemSum, item) =>
                  itemSum +
                  (item.itemType === "Combo"
                    ? item.components.reduce(
                        (componentSum, component) =>
                          componentSum + component.totalQty,
                        0,
                      )
                    : item.qty),
                0,
              ),
            0,
          ),
      })),
    };
  }

  async getTopProducts(
    rangeInput?: string,
    fromInput?: string,
    toInput?: string,
    sortInput = "quantity",
  ) {
    const saleWhere = this.getTopProductsSalesWhere(
      rangeInput,
      fromInput,
      toInput,
    );
    const sort = this.parseTopProductsSort(sortInput);
    const items = await this.prisma.saleItem.findMany({
      where: { sale: saleWhere },
      include: {
        components: { orderBy: { productName: "asc" } },
      },
    });
    const byVisibleItem = new Map<
      string,
      {
        productId: string | null;
        comboId: string | null;
        itemType: string;
        name: string;
        qty: number;
        totalAmountCents: number;
        components: Map<
          string,
          {
            productId: string;
            name: string;
            barcode: string;
            qty: number;
          }
        >;
      }
    >();

    for (const item of items) {
      const key =
        item.itemType === "Combo"
          ? `Combo:${item.comboId ?? item.productName}`
          : `Product:${item.productId ?? item.productName}`;
      const current =
        byVisibleItem.get(key) ??
        {
          productId: item.productId,
          comboId: item.comboId,
          itemType: item.itemType,
          name: item.productName,
          qty: 0,
          totalAmountCents: 0,
          components: new Map(),
        };

      current.qty += item.qty;
      current.totalAmountCents += item.lineTotalAmountCents;

      for (const component of item.components) {
        const componentCurrent =
          current.components.get(component.productId) ??
          {
            productId: component.productId,
            name: component.productName,
            barcode: component.barcode,
            qty: 0,
          };
        componentCurrent.qty += component.totalQty;
        current.components.set(component.productId, componentCurrent);
      }

      byVisibleItem.set(key, current);
    }

    return [...byVisibleItem.values()]
      .map((item) => ({
        productId: item.productId,
        comboId: item.comboId,
        itemType: item.itemType,
        name: item.name,
        qty: item.qty,
        totalAmountCents: item.totalAmountCents,
        components: [...item.components.values()],
      }))
      .sort((a, b) =>
        sort === "quantity"
          ? b.qty - a.qty ||
            b.totalAmountCents - a.totalAmountCents ||
            a.name.localeCompare(b.name)
          : b.totalAmountCents - a.totalAmountCents ||
            b.qty - a.qty ||
            a.name.localeCompare(b.name),
      );
  }

  async getProductConsumption(rangeInput = "all") {
    const items = await this.prisma.saleItem.findMany({
      where: { sale: this.getConfirmedSalesWhere(rangeInput) },
      include: {
        sale: { select: { deliveryStatus: true } },
        components: true,
      },
    });
    const byProduct = new Map<
      string,
      {
        productId: string;
        name: string;
        directQty: number;
        comboQty: number;
        deliveredQty: number;
        reservedQty: number;
        totalQty: number;
      }
    >();

    const addConsumption = (
      productId: string,
      name: string,
      qty: number,
      source: "direct" | "combo",
      deliveryStatus: string,
    ) => {
      const current = byProduct.get(productId) ?? {
        productId,
        name,
        directQty: 0,
        comboQty: 0,
        deliveredQty: 0,
        reservedQty: 0,
        totalQty: 0,
      };

      if (source === "direct") current.directQty += qty;
      else current.comboQty += qty;

      if (deliveryStatus === "Pendiente") current.reservedQty += qty;
      else current.deliveredQty += qty;
      current.totalQty += qty;
      byProduct.set(productId, current);
    };

    for (const item of items) {
      if (item.itemType === "Combo") {
        for (const component of item.components) {
          addConsumption(
            component.productId,
            component.productName,
            component.totalQty,
            "combo",
            item.sale.deliveryStatus,
          );
        }
        continue;
      }

      if (item.productId) {
        addConsumption(
          item.productId,
          item.productName,
          item.qty,
          "direct",
          item.sale.deliveryStatus,
        );
      }
    }

    return [...byProduct.values()].sort(
      (a, b) => b.totalQty - a.totalQty || a.name.localeCompare(b.name),
    );
  }

  async getSalesExport(rangeInput = "all") {
    const sales = await this.prisma.sale.findMany({
      where: this.getConfirmedSalesWhere(rangeInput),
      include: reportSaleInclude,
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });

    return sales.map((sale) => this.serializeSale(sale));
  }

  async getPaymentMethodsBreakdown() {
    const [paymentMethods, groupedSales] = await Promise.all([
      this.prisma.paymentMethod.findMany({ orderBy: { id: "asc" } }),
      this.prisma.sale.groupBy({
        by: ["paymentMethodId", "paymentMethodName"],
        where: { status: "Confirmada" },
        _count: { _all: true },
        _sum: { totalAmountCents: true },
      }),
    ]);
    const currentNameById = new Map(
      paymentMethods.map((method) => [method.id, method.name]),
    );
    const rowsByHistoricalLabel = new Map<
      string,
      {
        paymentMethodId: string;
        label: string;
        totalAmountCents: number;
        salesCount: number;
      }
    >();

    for (const sale of groupedSales) {
      const label =
        sale.paymentMethodName ||
        currentNameById.get(sale.paymentMethodId) ||
        sale.paymentMethodId;
      const key = `${sale.paymentMethodId}:${label}`;
      const current = rowsByHistoricalLabel.get(key) ?? {
        paymentMethodId: sale.paymentMethodId,
        label,
        totalAmountCents: 0,
        salesCount: 0,
      };
      current.totalAmountCents += sale._sum.totalAmountCents ?? 0;
      current.salesCount += sale._count._all;
      rowsByHistoricalLabel.set(key, current);
    }

    const paymentIdsWithSales = new Set(
      groupedSales.map((sale) => sale.paymentMethodId),
    );
    for (const method of paymentMethods) {
      if (!paymentIdsWithSales.has(method.id)) {
        rowsByHistoricalLabel.set(`${method.id}:${method.name}`, {
          paymentMethodId: method.id,
          label: method.name,
          totalAmountCents: 0,
          salesCount: 0,
        });
      }
    }

    const rows = [...rowsByHistoricalLabel.values()].sort(
      (a, b) =>
        a.paymentMethodId.localeCompare(b.paymentMethodId) ||
        a.label.localeCompare(b.label),
    );
    const grandTotalAmountCents = rows.reduce(
      (sum, row) => sum + row.totalAmountCents,
      0,
    );

    return rows.map((row) => ({
      ...row,
      pct:
        grandTotalAmountCents > 0
          ? Math.round(
              (row.totalAmountCents / grandTotalAmountCents) * 100,
            )
          : 0,
    }));
  }

  private findConfirmedSalesBetween(
    start: Date,
    end: Date,
  ): Promise<ReportSale[]> {
    return this.prisma.sale.findMany({
      where: {
        status: "Confirmada",
        date: {
          gte: start,
          lt: end,
        },
      },
      include: reportSaleInclude,
      orderBy: { date: "desc" },
    });
  }

  private getConfirmedSalesWhere(rangeInput: string): Prisma.SaleWhereInput {
    const range = this.parseReportRange(rangeInput);
    if (range === "all") return { status: "Confirmada" };

    const todayStart = startOfArgentinaDay(new Date());
    const end = addDays(todayStart, 1);
    const start =
      range === "30d"
        ? addDays(todayStart, -29)
        : range === "90d"
          ? addDays(todayStart, -89)
          : addMonths(startOfArgentinaMonth(new Date()), -11);

    return {
      status: "Confirmada",
      date: { gte: start, lt: end },
    };
  }

  private getTopProductsSalesWhere(
    rangeInput?: string,
    fromInput?: string,
    toInput?: string,
  ): Prisma.SaleWhereInput {
    const hasRange = rangeInput !== undefined;
    const hasFrom = fromInput !== undefined;
    const hasTo = toInput !== undefined;

    if (hasRange && (hasFrom || hasTo)) {
      throw new BadRequestException(
        "No se puede combinar un rango predefinido con fechas exactas.",
      );
    }
    if (hasFrom !== hasTo) {
      throw new BadRequestException(
        "Las fechas desde y hasta deben enviarse juntas.",
      );
    }
    if (!hasFrom || !hasTo) {
      return this.getConfirmedSalesWhere(rangeInput ?? "all");
    }

    const from = new Date(fromInput);
    const to = new Date(toInput);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException("El intervalo de fechas no es válido.");
    }

    return {
      status: "Confirmada",
      date: { gte: from, lt: to },
    };
  }

  private parseTopProductsSort(input: string): "quantity" | "revenue" {
    if (input === "quantity" || input === "revenue") return input;

    throw new BadRequestException("Criterio de ranking no soportado.");
  }

  private getStockAlerts(stockRows: StockReadModel[]) {
    return stockRows
      .filter(
        (row) => !row.archived && row.availableStock <= row.minStock,
      )
      .sort((a, b) => a.availableStock - b.availableStock)
      .slice(0, 5)
      .map((row) => ({
        productId: row.productId,
        barcode: row.barcode,
        productName: row.productName,
        name: row.productName,
        category: row.category,
        supplier: row.supplier,
        costAmountCents: row.costAmountCents,
        marginPct: row.marginPct,
        priceAmountCents: row.priceAmountCents,
        physicalStock: row.physicalStock,
        reservedStock: row.reservedStock,
        availableStock: row.availableStock,
        minStock: row.minStock,
      }));
  }

  private parsePeriod(period: string): ReportsPeriod {
    if (
      period === "hour" ||
      period === "month" ||
      period === "90d" ||
      period === "year"
    ) {
      return period;
    }

    throw new BadRequestException("Periodo de reporte no soportado.");
  }

  private parseReportRange(range: string): ReportRange {
    if (
      range === "all" ||
      range === "30d" ||
      range === "90d" ||
      range === "year"
    ) {
      return range;
    }

    throw new BadRequestException("Rango de reporte no soportado.");
  }

  private serializeSale(sale: ReportSale): ReportSaleResponse {
    return {
      id: sale.id,
      number: sale.number,
      date: sale.date.toISOString(),
      deliveryStatus: sale.deliveryStatus,
      status: sale.status,
      paymentMethodId: sale.paymentMethodId,
      payment: sale.paymentMethodName || sale.paymentMethod.name,
      items: sale.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        comboId: item.comboId,
        itemType: item.itemType,
        productName: item.productName,
        name: item.productName,
        barcode: item.barcode,
        qty: item.qty,
        unitPriceAmountCents: item.unitPriceAmountCents,
        lineTotalAmountCents: item.lineTotalAmountCents,
        comboDiscountAmountCents: item.comboDiscountAmountCents,
        components: item.components.map((component) => ({
          productId: component.productId,
          productName: component.productName,
          name: component.productName,
          barcode: component.barcode,
          qtyPerCombo: component.qtyPerCombo,
          qty: component.totalQty,
        })),
      })),
      totalAmountCents: sale.totalAmountCents,
    };
  }
}

function sumSales(sales: Array<{ totalAmountCents: number }>): number {
  return sales.reduce((sum, sale) => sum + sale.totalAmountCents, 0);
}

function getPeriodMeta(period: ReportsPeriod) {
  const meta: Record<ReportsPeriod, { title: string; subtitle: string }> = {
    hour: {
      title: "Ventas por hora",
      subtitle: "Hoy por hora",
    },
    month: {
      title: "Ventas por períodos de 3 días",
      subtitle: "Últimos 30 días",
    },
    "90d": {
      title: "Ventas semanales",
      subtitle: "Últimos 90 días",
    },
    year: {
      title: "Ventas mensuales",
      subtitle: "Últimos 12 meses",
    },
  };

  return meta[period];
}

function buildSoldUnitsBuckets(
  period: SoldUnitsPeriod,
  now: Date,
): Omit<Bucket, "v">[] {
  const today = startOfArgentinaDay(now);
  const { year } = getArgentinaParts(now);
  const first =
    period === "week"
      ? addDays(today, -6)
      : argentinaLocalToUtc(year, 1, 1);
  const count = period === "week" ? 7 : 12;
  const labelFormatter = new Intl.DateTimeFormat("es-AR", {
    timeZone: ARGENTINA_TIME_ZONE,
    ...(period === "week" ? { weekday: "short" } : { month: "short" }),
  });

  return Array.from({ length: count }, (_, index) => {
    const start =
      period === "week" ? addDays(first, index) : addMonths(first, index);
    const next = period === "week" ? addDays(start, 1) : addMonths(start, 1);
    const label = labelFormatter.format(start).replace(/\.$/, "").slice(0, 3);

    return {
      label: label[0].toLocaleUpperCase("es-AR") + label.slice(1),
      fullLabel:
        period === "week"
          ? formatArgentinaDate(start)
          : formatArgentinaMonth(start),
      start,
      end: next,
    };
  });
}

function buildBuckets(period: ReportsPeriod, now: Date): Bucket[] {
  if (period === "hour") {
    const firstStart = startOfArgentinaDay(now);

    return Array.from({ length: 24 }, (_, index) => {
      const start = addHours(firstStart, index);
      const end = addHours(start, 1);

      return {
        label: `${index.toString().padStart(2, "0")}:00`,
        fullLabel: `${formatArgentinaDate(start)} ${index
          .toString()
          .padStart(2, "0")}:00`,
        start,
        end,
        v: 0,
      };
    });
  }

  if (period === "month") {
    const firstStart = addDays(startOfArgentinaDay(now), -29);

    return Array.from({ length: 10 }, (_, index) => {
      const start = addDays(firstStart, index * 3);
      const end = addDays(start, 3);
      const startDay = index * 3 + 1;

      return {
        label: `${startDay}-${startDay + 2}`,
        fullLabel: formatArgentinaRange(start, end),
        start,
        end,
        v: 0,
      };
    });
  }

  if (period === "90d") {
    const firstStart = addDays(startOfArgentinaDay(now), -89);

    return Array.from({ length: 13 }, (_, index) => {
      const start = addDays(firstStart, index * 7);
      const end =
        index === 12 ? addDays(startOfArgentinaDay(now), 1) : addDays(start, 7);

      return {
        label: `S${index + 1}`,
        fullLabel: formatArgentinaRange(start, end),
        start,
        end,
        v: 0,
      };
    });
  }

  const currentMonthStart = startOfArgentinaMonth(now);
  const firstStart = addMonths(currentMonthStart, -11);

  return Array.from({ length: 12 }, (_, index) => {
    const start = addMonths(firstStart, index);
    const end = addMonths(start, 1);

    return {
      label: formatArgentinaMonth(start),
      fullLabel: formatArgentinaMonth(start),
      start,
      end,
      v: 0,
    };
  });
}

function startOfArgentinaDay(date: Date): Date {
  const parts = getArgentinaParts(date);
  return argentinaLocalToUtc(parts.year, parts.month, parts.day);
}

function startOfArgentinaMonth(date: Date): Date {
  const parts = getArgentinaParts(date);
  return argentinaLocalToUtc(parts.year, parts.month, 1);
}

function getArgentinaParts(date: Date) {
  const entries = argentinaPartsFormatter
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)] as const);
  const parts = Object.fromEntries(entries) as {
    year: number;
    month: number;
    day: number;
    hour: number;
  };

  return parts;
}

function argentinaLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
): Date {
  return new Date(
    Date.UTC(year, month - 1, day, hour + ARGENTINA_UTC_OFFSET_HOURS),
  );
}

function formatArgentinaDate(date: Date): string {
  return argentinaDateFormatter.format(date);
}

function formatArgentinaMonth(date: Date): string {
  return argentinaMonthFormatter.format(date);
}

function formatArgentinaRange(start: Date, exclusiveEnd: Date): string {
  const inclusiveEnd = new Date(exclusiveEnd.getTime() - 1);
  return `${formatArgentinaDate(start)} al ${formatArgentinaDate(inclusiveEnd)}`;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}
