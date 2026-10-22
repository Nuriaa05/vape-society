import type { CsvCell } from "./csv";
import { formatARS, formatDateAR, formatDateInputAR } from "./formatters";
import { buildReportDateRange, getReportRangeLabel } from "./report-exports";
import { getReportShortcut } from "./report-date-range";
import type {
  ReportDateRange,
  ReportsPeriod,
} from "./repositories/reports-repository";
import type {
  ProfitGrouping,
  ProfitReport,
  ProfitSale,
  ProfitSummary,
} from "./repositories/profit-reports-repository";

export type ReportView = "ventas" | "ganancias";
export type ReportSearch = {
  vista?: ReportView;
  desde?: string;
  hasta?: string;
  agrupacion?: ProfitGrouping;
  periodo?: ReportsPeriod;
};
export const profitGroupingLabels: Record<ProfitGrouping, string> = {
  day: "Diario",
  tenDays: "Cortes de 10 días",
  month: "Mensual",
};

export const formatProfitAmount = (value: number | null) =>
  value === null ? "No disponible" : formatARS(value);

export function getProfitReportDates(
  dates?: ReportDateRange,
  now = new Date(),
): ReportDateRange {
  return dates ?? getReportShortcut("thisMonth", now);
}

export function parseReportSearch(
  value: Record<string, unknown>,
): ReportSearch {
  const search: ReportSearch = {};
  if (value.vista === "ventas" || value.vista === "ganancias")
    search.vista = value.vista;
  if (
    value.periodo === "hour" ||
    value.periodo === "month" ||
    value.periodo === "90d" ||
    value.periodo === "year"
  )
    search.periodo = value.periodo;
  if (
    value.agrupacion === "day" ||
    value.agrupacion === "tenDays" ||
    value.agrupacion === "month"
  )
    search.agrupacion = value.agrupacion;
  if (typeof value.desde === "string" && typeof value.hasta === "string") {
    try {
      buildReportDateRange(value.desde, value.hasta);
      search.desde = value.desde;
      search.hasta = value.hasta;
    } catch {
      // An invalid URL falls back to the view's normal default period.
    }
  }
  return search;
}

export function dateRangeToReportSearch(
  dates?: ReportDateRange,
): Pick<ReportSearch, "desde" | "hasta"> {
  return {
    desde: dates ? formatDateInputAR(dates.from).padStart(10, "0") : undefined,
    hasta: dates
      ? formatDateInputAR(new Date(new Date(dates.to).getTime() - 1)).padStart(
          10,
          "0",
        )
      : undefined,
  };
}

export function getProfitDaySearch(day?: string): ReportSearch {
  const dates = day === undefined ? undefined : buildReportDateRange(day, day);
  return {
    vista: "ganancias",
    agrupacion: "day",
    ...dateRangeToReportSearch(dates),
  };
}

export function getTodayProfitReportSearch(now = new Date()): ReportSearch {
  return getProfitDaySearch(formatDateInputAR(now).padStart(10, "0"));
}

export const profitExportAmount = (value: number | null): CsvCell =>
  value === null ? "No disponible" : value;

export function buildProfitExportRows(report: ProfitReport): CsvCell[][] {
  return [
    ["Reporte", "Ganancias"],
    ["Período", getReportRangeLabel(report)],
    ["Agrupación", profitGroupingLabels[report.groupBy]],
    [
      "Cálculo",
      "Ventas entregadas menos costo histórico de los productos vendidos",
    ],
    [],
    [
      "Período",
      "Parcial",
      "Cantidad de ventas",
      "Ventas ARS",
      "Costo ARS",
      "Ganancia ARS",
      "Ventas sin historial de costo completo",
    ],
    ...report.buckets.map((bucket) => [
      bucket.label,
      bucket.partial ? "Sí" : "No",
      bucket.salesCount,
      bucket.revenue,
      profitExportAmount(bucket.cost),
      profitExportAmount(bucket.profit),
      bucket.missingCostSalesCount,
    ]),
    [],
    [
      "Total",
      "",
      report.summary.salesCount,
      report.summary.revenue,
      profitExportAmount(report.summary.cost),
      profitExportAmount(report.summary.profit),
      report.summary.missingCostSalesCount,
    ],
  ];
}

export function buildProfitSalesExportRows(
  sales: ProfitSale[],
  dates: ReportDateRange,
  summary: ProfitSummary,
): CsvCell[][] {
  return [
    ["Reporte", "Ventas y ganancias"],
    ["Período", getReportRangeLabel(dates)],
    ["Cantidad de ventas", summary.salesCount],
    ["Ventas sin historial de costo completo", summary.missingCostSalesCount],
    [],
    [
      "Comprobante",
      "Cliente",
      "Fecha de venta",
      "Fecha de entrega",
      "Venta ARS",
      "Costo ARS",
      "Ganancia ARS",
      "Historial de costo completo",
    ],
    ...sales.map((sale) => [
      sale.number,
      sale.customerName || "Consumidor final",
      formatDateAR(sale.saleDate),
      formatDateAR(sale.deliveredAt),
      sale.revenue,
      profitExportAmount(sale.cost),
      profitExportAmount(sale.profit),
      sale.missingCost ? "No" : "Sí",
    ]),
    [],
    [
      "Total",
      "",
      "",
      "",
      summary.revenue,
      profitExportAmount(summary.cost),
      profitExportAmount(summary.profit),
      "",
    ],
  ];
}
