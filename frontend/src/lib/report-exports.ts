import type {
  ReportProductBreakdownItem,
  ReportProductConsumptionItem,
  ReportRange,
  ReportDateRange,
  ReportFilter,
  TopProductsSort,
} from "@/lib/repositories";
import { formatDateAR, TZ } from "@/lib/formatters";
import type { CsvCell } from "./csv";

const rangeLabels: Record<ReportRange, string> = {
  all: "Todo el tiempo",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  year: "Últimos 12 meses",
};

const argentinaCalendarFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  era: "short",
  hourCycle: "h23",
});

function argentinaCalendarTime(instant: Date): Date {
  const parts = Object.fromEntries(
    argentinaCalendarFormatter
      .formatToParts(instant)
      .map(({ type, value }) => [type, value]),
  );
  const date = new Date(0);
  date.setUTCFullYear(
    parts.era === "BC" ? 1 - Number(parts.year) : Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
  );
  date.setUTCHours(
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return date;
}

function argentinaDayStart(calendar: Date): Date {
  const guess = new Date(calendar.getTime() + 3 * 60 * 60 * 1000);
  const correction =
    calendar.getTime() - argentinaCalendarTime(guess).getTime();
  const corrected = new Date(guess.getTime() + correction);
  const correctedDay = argentinaCalendarTime(corrected);
  correctedDay.setUTCHours(0, 0, 0, 0);
  // Historical clock advances can skip midnight; use the first actual instant.
  return correctedDay.getTime() === calendar.getTime() ? corrected : guess;
}

export function buildReportDateRange(
  from: string,
  to: string,
): ReportDateRange {
  // UTC fields represent calendar days here, not Argentine instants.
  const start = new Date(`${from}T00:00:00Z`);
  const lastDay = new Date(`${to}T00:00:00Z`);
  const nextDay = new Date(lastDay);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(lastDay.getTime()) ||
    start.getUTCFullYear() < 1 ||
    nextDay.getUTCFullYear() > 9999 ||
    start.toISOString().slice(0, 10) !== from ||
    lastDay.toISOString().slice(0, 10) !== to ||
    start > lastDay
  ) {
    throw new Error(
      "Elegí fechas válidas. Desde debe ser anterior o igual a Hasta.",
    );
  }
  return {
    from: argentinaDayStart(start).toISOString(),
    to: argentinaDayStart(nextDay).toISOString(),
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
