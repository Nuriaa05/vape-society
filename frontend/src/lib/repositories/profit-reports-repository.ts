import { apiClient } from "@/lib/api-client";
import { amountCentsToPesos } from "@/lib/money";
import type { ReportDateRange } from "./reports-repository";

export type ProfitGrouping = "day" | "tenDays" | "month";
export type ProfitSummary = {
  salesCount: number;
  missingCostSalesCount: number;
  revenue: number;
  cost: number | null;
  profit: number | null;
};
type ApiProfitSummary = {
  salesCount: number;
  missingCostSalesCount: number;
  revenueAmountCents: number;
  costAmountCents: number | null;
  profitAmountCents: number | null;
};
type BucketPeriod = ReportDateRange & { label: string; partial: boolean };
export type ProfitBucket = ProfitSummary & BucketPeriod;
export type ProfitReport = ReportDateRange & {
  groupBy: ProfitGrouping;
  summary: ProfitSummary;
  buckets: ProfitBucket[];
};
type SaleIdentity = {
  id: string;
  number: string;
  customerName: string | null;
  saleDate: string;
  deliveredAt: string;
  missingCost: boolean;
};
export type ProfitSale = SaleIdentity &
  Pick<ProfitSummary, "revenue" | "cost" | "profit">;
type ApiProfitSale = SaleIdentity &
  Pick<
    ApiProfitSummary,
    "revenueAmountCents" | "costAmountCents" | "profitAmountCents"
  >;
type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type ProfitSalesPage = ReportDateRange &
  Pagination & { summary: ProfitSummary; items: ProfitSale[] };

function amounts(
  value: Pick<
    ApiProfitSummary,
    "revenueAmountCents" | "costAmountCents" | "profitAmountCents"
  >,
) {
  return {
    revenue: amountCentsToPesos(value.revenueAmountCents),
    cost:
      value.costAmountCents === null
        ? null
        : amountCentsToPesos(value.costAmountCents),
    profit:
      value.profitAmountCents === null
        ? null
        : amountCentsToPesos(value.profitAmountCents),
  };
}
function summary(value: ApiProfitSummary): ProfitSummary {
  return {
    salesCount: value.salesCount,
    missingCostSalesCount: value.missingCostSalesCount,
    ...amounts(value),
  };
}

async function getSales(
  dates: ReportDateRange,
  page = 1,
  pageSize = 10,
): Promise<ProfitSalesPage> {
  const response = await apiClient.get<
    ReportDateRange &
      Pagination & { summary: ApiProfitSummary; items: ApiProfitSale[] }
  >("/reports/profit/sales", {
    from: dates.from,
    to: dates.to,
    page,
    pageSize,
  });
  return {
    from: response.from,
    to: response.to,
    page: response.page,
    pageSize: response.pageSize,
    total: response.total,
    totalPages: response.totalPages,
    summary: summary(response.summary),
    items: response.items.map((sale) => ({
      id: sale.id,
      number: sale.number,
      customerName: sale.customerName,
      saleDate: sale.saleDate,
      deliveredAt: sale.deliveredAt,
      missingCost: sale.missingCost,
      ...amounts(sale),
    })),
  };
}

export const profitReportsRepository = {
  async getReport(
    dates: ReportDateRange,
    groupBy: ProfitGrouping,
  ): Promise<ProfitReport> {
    const response = await apiClient.get<
      ReportDateRange & {
        groupBy: ProfitGrouping;
        summary: ApiProfitSummary;
        buckets: Array<ApiProfitSummary & BucketPeriod>;
      }
    >("/reports/profit", { from: dates.from, to: dates.to, groupBy });
    return {
      from: response.from,
      to: response.to,
      groupBy: response.groupBy,
      summary: summary(response.summary),
      buckets: response.buckets.map((bucket) => ({
        from: bucket.from,
        to: bucket.to,
        label: bucket.label,
        partial: bucket.partial,
        ...summary(bucket),
      })),
    };
  },
  getSales,
  async getAllSales(dates: ReportDateRange) {
    const first = await getSales(dates, 1, 100);
    const items = [...first.items];
    for (let page = 2; page <= first.totalPages; page += 1) {
      const next = await getSales(dates, page, 100);
      if (
        next.total !== first.total ||
        JSON.stringify(next.summary) !== JSON.stringify(first.summary)
      ) {
        throw new Error(
          "Las ventas cambiaron durante la exportación. Volvé a intentarlo.",
        );
      }
      items.push(...next.items);
    }
    if (
      items.length !== first.total ||
      new Set(items.map((item) => item.id)).size !== first.total
    ) {
      throw new Error(
        "No se pudo obtener el listado completo. Volvé a exportarlo.",
      );
    }
    return { summary: first.summary, items };
  },
};
