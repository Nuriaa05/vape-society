import { BadRequestException } from "@nestjs/common";

import {
  type CostedSale,
  type SalesProfitSummary,
  summarizeCostedSales,
} from "./sales-profit";

export type ProfitGrouping = "day" | "tenDays" | "month";
export type ProfitBucket = SalesProfitSummary & {
  from: string;
  to: string;
  label: string;
  partial: boolean;
};

const MAX_BUCKETS = 10_000;
const DAY_MS = 86_400_000;
const TIME_ZONE = "America/Argentina/Buenos_Aires";
const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  era: "short",
  hourCycle: "h23",
});
const monthFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

// Calendar dates use UTC fields for arithmetic only. Instants are converted
// through the Argentine zone before grouping or constructing a boundary.
function calendarDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function localCalendarTime(instant: Date): Date {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(instant).map(({ type, value }) => [type, value]),
  );
  const year = parts.era === "BC" ? 1 - Number(parts.year) : Number(parts.year);
  const date = calendarDate(year, Number(parts.month), Number(parts.day));
  date.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second));
  return date;
}

function localDay(instant: Date): Date {
  const date = localCalendarTime(instant);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function argentinaMidnight(calendar: Date): Date {
  // Start near the usual UTC-3 offset, then resolve the actual zone offset.
  // A skipped historical midnight resolves to the first instant of that day.
  const guess = new Date(calendar.getTime() + 3 * 3_600_000);
  const correction = calendar.getTime() - localCalendarTime(guess).getTime();
  const corrected = new Date(guess.getTime() + correction);
  return localDay(corrected).getTime() === calendar.getTime() ? corrected : guess;
}

function parseIso(value: string): Date {
  const match = typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  const parsed = new Date(value);
  if (!match || !Number.isFinite(parsed.getTime())) {
    throw new BadRequestException(
      "Las fechas deben ser ISO válidas con zona horaria.",
    );
  }
  const [, year, month, day] = match;
  const calendar = calendarDate(Number(year), Number(month), Number(day));
  if (
    Number(year) < 1 ||
    calendar.getUTCFullYear() !== Number(year) ||
    calendar.getUTCMonth() + 1 !== Number(month) ||
    calendar.getUTCDate() !== Number(day) ||
    !/^\d{4}-/.test(parsed.toISOString()) ||
    parsed.getUTCFullYear() < 1
  ) {
    throw new BadRequestException(
      "Las fechas deben estar entre los años 0001 y 9999 y existir en el calendario.",
    );
  }
  return parsed;
}

export function resolveProfitRange(from?: string, to?: string, now = new Date()) {
  if ((from === undefined) !== (to === undefined)) {
    throw new BadRequestException("Indique desde y hasta juntos.");
  }
  let start: Date;
  let end: Date;
  if (from === undefined && to === undefined) {
    const today = localDay(now);
    start = argentinaMidnight(
      calendarDate(today.getUTCFullYear(), today.getUTCMonth() + 1, 1),
    );
    end = argentinaMidnight(new Date(today.getTime() + DAY_MS));
  } else {
    start = parseIso(from!);
    end = parseIso(to!);
  }
  if (start >= end) {
    throw new BadRequestException(
      "La fecha desde debe ser anterior a hasta (fin excluido).",
    );
  }
  if (localDay(start).getUTCFullYear() < 1) {
    throw new BadRequestException(
      "El intervalo está fuera del calendario argentino admitido.",
    );
  }
  return { start, end };
}

export function resolveProfitGrouping(value: string = "day"): ProfitGrouping {
  if (value !== "day" && value !== "tenDays" && value !== "month") {
    throw new BadRequestException("La agrupación debe ser day, tenDays o month.");
  }
  return value;
}

export function resolveProfitPagination(
  page: string = "1",
  pageSize: string = "10",
) {
  const parse = (value: string, field: string, maximum: number) => {
    const number = Number(value);
    if (
      typeof value !== "string" ||
      !/^[1-9]\d*$/.test(value) ||
      !Number.isSafeInteger(number) ||
      number > maximum
    ) {
      throw new BadRequestException(
        `${field} debe ser un entero entre 1 y ${maximum}.`,
      );
    }
    return number;
  };
  const parsedPage = parse(page, "page", Number.MAX_SAFE_INTEGER);
  const parsedPageSize = parse(pageSize, "pageSize", 100);
  if (!Number.isSafeInteger((parsedPage - 1) * parsedPageSize)) {
    throw new BadRequestException("La página solicitada excede el rango admitido.");
  }
  return { page: parsedPage, pageSize: parsedPageSize };
}

function bucketStart(calendar: Date, grouping: ProfitGrouping): Date {
  const day = calendar.getUTCDate();
  const tenDayStart = day <= 10 ? 1 : day <= 20 ? 11 : 21;
  return calendarDate(
    calendar.getUTCFullYear(),
    calendar.getUTCMonth() + 1,
    grouping === "month" ? 1 : grouping === "tenDays" ? tenDayStart : day,
  );
}

function nextBucket(start: Date, grouping: ProfitGrouping): Date {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + 1;
  const day = start.getUTCDate();
  if (grouping === "month" || (grouping === "tenDays" && day === 21)) {
    return calendarDate(year, month + 1, 1);
  }
  return calendarDate(year, month, day + (grouping === "tenDays" ? 10 : 1));
}

function dateLabel(calendar: Date): string {
  return [
    String(calendar.getUTCDate()).padStart(2, "0"),
    String(calendar.getUTCMonth() + 1).padStart(2, "0"),
    String(calendar.getUTCFullYear()).padStart(4, "0"),
  ].join("/");
}

export function createProfitBuckets(
  start: Date,
  end: Date,
  grouping: ProfitGrouping,
): ProfitBucket[] {
  const buckets: ProfitBucket[] = [];
  let calendar = bucketStart(localDay(start), grouping);
  let boundary = argentinaMidnight(calendar);
  while (boundary < end) {
    if (buckets.length >= MAX_BUCKETS) {
      throw new BadRequestException(
        `El intervalo supera los ${MAX_BUCKETS} períodos. Reduzca las fechas o cambie la agrupación.`,
      );
    }
    const nextCalendar = nextBucket(calendar, grouping);
    const next = argentinaMidnight(nextCalendar);
    if (!Number.isFinite(next.getTime()) || next <= boundary) {
      throw new BadRequestException(
        "El intervalo está fuera del calendario admitido.",
      );
    }
    let label = dateLabel(calendar);
    if (grouping === "month") label = monthFormatter.format(calendar);
    else if (grouping === "tenDays") {
      label += ` – ${dateLabel(new Date(nextCalendar.getTime() - DAY_MS))}`;
    }
    buckets.push({
      from: new Date(Math.max(start.getTime(), boundary.getTime())).toISOString(),
      to: new Date(Math.min(end.getTime(), next.getTime())).toISOString(),
      label,
      partial: grouping !== "day" && (start > boundary || end < next),
      ...summarizeCostedSales([]),
    });
    calendar = nextCalendar;
    boundary = next;
  }
  return buckets;
}

export function fillProfitBuckets(
  buckets: ProfitBucket[],
  sales: readonly CostedSale[],
): ProfitBucket[] {
  const groups: CostedSale[][] = buckets.map(() => []);
  let index = buckets.length - 1;
  // The costing engine returns stable descending delivery order.
  for (const sale of sales) {
    while (index >= 0 && sale.deliveredAt < buckets[index].from) index -= 1;
    if (index >= 0 && sale.deliveredAt < buckets[index].to) {
      groups[index].push(sale);
    }
  }
  return buckets.map((bucket, bucketIndex) => ({
    ...bucket,
    ...summarizeCostedSales(groups[bucketIndex]),
  }));
}
