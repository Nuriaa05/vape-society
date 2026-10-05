import { apiClient } from "@/lib/api-client";
import type { Category, Product, Sale } from "@/lib/contracts";
import { amountCentsToPesos } from "@/lib/money";

export type ReportsPeriod = "hour" | "month" | "90d" | "year";
export type SoldUnitsPeriod = "week" | "month";
export type SoldUnitsDataset = {
  period: SoldUnitsPeriod;
  meta: { title: string; subtitle: string };
  points: Array<{
    label: string;
    fullLabel: string;
    from: string;
    to: string;
    units: number;
  }>;
};
export type ReportRange = "all" | "30d" | "90d" | "year";
export type TopProductsSort = "quantity" | "revenue";
export type TopProductsQuery = {
  range?: ReportRange;
  from?: string;
  to?: string;
  sort?: TopProductsSort;
};

export type ReportSubPoint = {
  label: string;
  v: number;
  fullLabel: string;
};

export type ReportPoint = {
  label: string;
  v: number;
  fullLabel: string;
  from: string;
  to: string;
  children?: ReportSubPoint[];
};

export interface ReportProductBreakdownItem {
  name: string;
  qty: number;
  total: number;
  itemType?: "Product" | "Combo";
  components?: Array<{ productName: string; qty: number }>;
}

export interface ReportProductConsumptionItem {
  productId: string;
  name: string;
  directQty: number;
  comboQty: number;
  deliveredQty: number;
  reservedQty: number;
  totalQty: number;
}

type ApiSale = {
  id: string;
  number: string;
  date: string;
  deliveryStatus: Sale["delivery"];
  status: Sale["status"];
  payment: string;
  items: Array<{
    productId: string;
    name: string;
    productName: string;
    qty: number;
    unitPriceAmountCents: number;
  }>;
  totalAmountCents: number;
};

type ApiStockAlert = {
  productId: string;
  barcode: string | null;
  productName: string;
  name: string;
  category: { id: string; name: string };
  supplier: { id: string; name: string } | null;
  costAmountCents: number;
  marginPct: number;
  priceAmountCents: number;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  minStock: number;
};

type ApiDashboardSummary = {
  todayTotalAmountCents: number;
  monthlyTotalAmountCents: number;
  confirmedSalesCount: number;
  stockValueAmountCents: number;
  productCount: number;
  recentSales: ApiSale[];
  pendingDeliveries: ApiSale[];
  pendingDeliveriesTotalAmountCents: number;
  stockAlerts: ApiStockAlert[];
};

type ApiCommercialSummary = {
  sales: ApiSale[];
  dailyTotalAmountCents: number;
  monthlyTotalAmountCents: number;
  monthlyPurchasesAmountCents: number;
  salesPurchasesDifferenceAmountCents: number;
  deliveredSalesCount: number;
  pendingSalesCount: number;
  pendingSalesTotalAmountCents: number;
  productCount: number;
};

type ApiSeries = {
  period: ReportsPeriod;
  meta: { title: string; subtitle: string };
  points: Array<{
    label: string;
    fullLabel: string;
    from: string;
    to: string;
    v: number;
  }>;
};

type ApiTopProduct = {
  productId: string;
  itemType?: "Product" | "Combo";
  name: string;
  qty: number;
  totalAmountCents: number;
  components?: Array<{ productName?: string; name?: string; qty: number }>;
};

type ApiPaymentBreakdown = {
  paymentMethodId: string;
  label: string;
  totalAmountCents: number;
  salesCount: number;
  pct: number;
};

type ApiProductConsumption = ReportProductConsumptionItem;

const periodOptions: { id: ReportsPeriod; label: string }[] = [
  { id: "hour", label: "Hoy por hora" },
  { id: "month", label: "Últimos 30 días" },
  { id: "90d", label: "Últimos 90 días" },
  { id: "year", label: "Último año" },
];

const periodMeta: Record<ReportsPeriod, { title: string; subtitle: string }> = {
  hour: {
    title: "Ventas por hora",
    subtitle: "Hoy de 08:00 a 21:00",
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

const paymentColors = ["bg-primary", "bg-accent", "bg-success", "bg-warning"];
const VISIBLE_HOURLY_REPORT_START = 8;
const VISIBLE_HOURLY_REPORT_END = 21;

function toSale(sale: ApiSale): Sale {
  return {
    id: sale.id,
    number: sale.number,
    date: sale.date,
    items: sale.items.map((item) => ({
      productId: item.productId,
      name: item.name || item.productName,
      qty: item.qty,
      price: amountCentsToPesos(item.unitPriceAmountCents),
    })),
    total: amountCentsToPesos(sale.totalAmountCents),
    payment: sale.payment as Sale["payment"],
    delivery: sale.deliveryStatus,
    status: sale.status,
  };
}

function toStockAlert(alert: ApiStockAlert): Product {
  return {
    itemType: "Product",
    id: alert.productId,
    barcode: alert.barcode ?? "",
    name: alert.name || alert.productName,
    categoryId: alert.category.id,
    category: alert.category.name as Category,
    supplierId: alert.supplier?.id ?? "",
    cost: amountCentsToPesos(alert.costAmountCents),
    marginPct: alert.marginPct,
    price: amountCentsToPesos(alert.priceAmountCents),
    stock: alert.physicalStock,
    reservedStock: alert.reservedStock,
    availableStock: alert.availableStock,
    minStock: alert.minStock,
  };
}

export const reportsRepository = {
  async getDashboardSummary() {
    const summary =
      await apiClient.get<ApiDashboardSummary>("/reports/dashboard");

    return {
      todayTotal: amountCentsToPesos(summary.todayTotalAmountCents),
      monthlyTotal: amountCentsToPesos(summary.monthlyTotalAmountCents),
      confirmedSalesCount: summary.confirmedSalesCount,
      stockValue: amountCentsToPesos(summary.stockValueAmountCents),
      productCount: summary.productCount,
      recentSales: summary.recentSales.map(toSale),
      pendingDeliveries: summary.pendingDeliveries.map(toSale),
      pendingDeliveriesTotal: amountCentsToPesos(
        summary.pendingDeliveriesTotalAmountCents,
      ),
      stockAlerts: summary.stockAlerts.map(toStockAlert),
    };
  },

  async getCommercialSummary() {
    const summary = await apiClient.get<ApiCommercialSummary>(
      "/reports/commercial",
    );

    return {
      sales: summary.sales.map(toSale),
      dailyTotal: amountCentsToPesos(summary.dailyTotalAmountCents),
      monthlyTotal: amountCentsToPesos(summary.monthlyTotalAmountCents),
      monthlyPurchases: amountCentsToPesos(summary.monthlyPurchasesAmountCents),
      salesPurchasesDifference: amountCentsToPesos(
        summary.salesPurchasesDifferenceAmountCents,
      ),
      deliveredSalesCount: summary.deliveredSalesCount,
      pendingSalesCount: summary.pendingSalesCount,
      pendingSalesTotal: amountCentsToPesos(
        summary.pendingSalesTotalAmountCents,
      ),
      productCount: summary.productCount,
    };
  },

  getPeriodOptions() {
    return periodOptions.map((option) => ({ ...option }));
  },

  getPeriodMeta(period: ReportsPeriod) {
    return { ...periodMeta[period] };
  },

  async getSalesDataset(period: ReportsPeriod): Promise<ReportPoint[]> {
    const series = await apiClient.get<ApiSeries>("/reports/sales-series", {
      period,
    });

    return getVisibleReportPoints(period, series.points).map((point) => ({
      label: point.label,
      fullLabel: point.fullLabel,
      from: point.from,
      to: point.to,
      v: amountCentsToPesos(point.v),
    }));
  },

  async getSoldUnitsDataset(
    period: SoldUnitsPeriod,
  ): Promise<SoldUnitsDataset> {
    return apiClient.get<SoldUnitsDataset>("/reports/units-series", { period });
  },

  async getBestSellingProducts(
    query: TopProductsQuery | ReportRange = {
      range: "all",
      sort: "quantity",
    },
  ): Promise<ReportProductBreakdownItem[]> {
    const params =
      typeof query === "string"
        ? { range: query, sort: "quantity" as const }
        : { sort: "quantity" as const, ...query };
    const products = await apiClient.get<ApiTopProduct[]>(
      "/reports/top-products",
      params,
    );
    return products.map((product) => ({
      name: product.name,
      qty: product.qty,
      total: amountCentsToPesos(product.totalAmountCents),
      itemType: product.itemType,
      components: (product.components ?? []).map((component) => ({
        productName:
          component.productName ?? component.name ?? "Producto sin nombre",
        qty: component.qty,
      })),
    }));
  },

  async getProductConsumption(
    range: ReportRange = "all",
  ): Promise<ReportProductConsumptionItem[]> {
    return apiClient.get<ApiProductConsumption[]>(
      "/reports/product-consumption",
      { range },
    );
  },

  async getSalesExport(range: ReportRange = "all"): Promise<Sale[]> {
    const sales = await apiClient.get<ApiSale[]>("/reports/sales", { range });
    return sales.map(toSale);
  },

  async getPaymentBreakdown() {
    const breakdown = await apiClient.get<ApiPaymentBreakdown[]>(
      "/reports/payment-methods",
    );

    return breakdown.map((item, index) => ({
      label: item.label,
      pct: item.pct,
      color: paymentColors[index % paymentColors.length],
    }));
  },
};

function getVisibleReportPoints(
  period: ReportsPeriod,
  points: ApiSeries["points"],
): ApiSeries["points"] {
  if (period !== "hour") return points;

  return points.filter((point) => {
    const hour = Number(point.label.slice(0, 2));
    return (
      Number.isFinite(hour) &&
      hour >= VISIBLE_HOURLY_REPORT_START &&
      hour <= VISIBLE_HOURLY_REPORT_END
    );
  });
}
