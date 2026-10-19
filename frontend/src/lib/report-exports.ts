import type {
  ReportProductBreakdownItem,
  ReportProductConsumptionItem,
  ReportRange,
  ReportDateRange,
  ReportFilter,
  TopProductsSort,
} from "@/lib/repositories";
import { formatDateAR, formatDateInputAR } from "@/lib/formatters";
import type { CsvCell } from "./csv";

const rangeLabels: Record<ReportRange, string> = {
  all: "Todo el tiempo",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  year: "Últimos 12 meses",
};

export function buildReportDateRange(
  from: string,
  to: string,
): ReportDateRange {
  const start = new Date(`${from}T00:00:00-03:00`);
  const lastDay = new Date(`${to}T00:00:00-03:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(lastDay.getTime()) ||
    formatDateInputAR(start) !== from ||
    formatDateInputAR(lastDay) !== to ||
    start > lastDay
  ) {
    throw new Error(
      "Elegí fechas válidas. Desde debe ser anterior o igual a Hasta.",
    );
  }
  return {
    from: start.toISOString(),
    to: new Date(lastDay.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function getReportRangeLabel(range: ReportFilter): string {
  if (typeof range !== "string") {
    return `${formatDateAR(range.from)} al ${formatDateAR(new Date(new Date(range.to).getTime() - 1))}`;
  }
  return rangeLabels[range];
}

export function getTopProductsSortLabel(sort: TopProductsSort): string {
  return sort === "quantity" ? "Más vendidos" : "Más ingresos";
}

export function buildTopProductsExportRows(
  products: ReportProductBreakdownItem[],
): CsvCell[][] {
  return [
    ["Producto o combo", "Unidades", "Total ARS"],
    ...products.map((product) => [product.name, product.qty, product.total]),
  ];
}

export function buildConsumptionExportRows(
  products: ReportProductConsumptionItem[],
): CsvCell[][] {
  return [
    [
      "Producto",
      "Venta directa",
      "En combos",
      "Entregado",
      "Reservado",
      "Total comprometido",
    ],
    ...products.map((product) => [
      product.name,
      product.directQty,
      product.comboQty,
      product.deliveredQty,
      product.reservedQty,
      product.totalQty,
    ]),
  ];
}
