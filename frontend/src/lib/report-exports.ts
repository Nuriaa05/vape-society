import type {
  ReportProductBreakdownItem,
  ReportProductConsumptionItem,
  ReportRange,
  TopProductsSort,
} from "@/lib/repositories";

const rangeLabels: Record<ReportRange, string> = {
  all: "Todo el tiempo",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  year: "Últimos 12 meses",
};

export function getReportRangeLabel(range: ReportRange): string {
  return rangeLabels[range];
}

export function getTopProductsSortLabel(sort: TopProductsSort): string {
  return sort === "quantity" ? "Más vendidos" : "Más ingresos";
}

export function buildTopProductsExportRows(
  products: ReportProductBreakdownItem[],
): string[][] {
  return [
    ["Producto o combo", "Unidades", "Total ARS"],
    ...products.map((product) => [
      product.name,
      String(product.qty),
      String(product.total),
    ]),
  ];
}

export function buildConsumptionExportRows(
  products: ReportProductConsumptionItem[],
): string[][] {
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
      String(product.directQty),
      String(product.comboQty),
      String(product.deliveredQty),
      String(product.reservedQty),
      String(product.totalQty),
    ]),
  ];
}
