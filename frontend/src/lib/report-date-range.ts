import { formatDateInputAR } from "@/lib/formatters";
import { buildReportDateRange } from "@/lib/report-exports";

export type ReportShortcut =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth";

const firstReportDay = "0001-01-01";
const lastReportDay = "9999-12-30";

function calendarDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

function boundedCalendarDay(date: Date): string {
  if (date < calendarDate(firstReportDay)) return firstReportDay;
  if (date > calendarDate(lastReportDay)) return lastReportDay;
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(month: string): number {
  const date = calendarDate(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.getUTCDate();
}

function shiftCalendarDay(day: string, count: number): string {
  const date = calendarDate(day);
  date.setUTCDate(date.getUTCDate() + count);
  return boundedCalendarDay(date);
}

export function shiftCalendarMonth(month: string, count: number): string {
  const date = calendarDate(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + count);
  if (date.getUTCFullYear() < 1) return "0001-01";
  if (date.getUTCFullYear() > 9999) return "9999-12";
  return date.toISOString().slice(0, 7);
}

export function getCalendarMonths(month: string): [string, string] {
  const first =
    month < "0001-01" ? "0001-01" : month > "9999-11" ? "9999-11" : month;
  return [first, shiftCalendarMonth(first, 1)];
}

export function getCalendarDays(month: string): Array<string | null> {
  const first = calendarDate(`${month}-01`);
  const offset = (first.getUTCDay() + 6) % 7;
  const lastDay = lastDayOfMonth(month);
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    const date = `${month}-${String(day).padStart(2, "0")}`;
    return day > 0 &&
      day <= lastDay &&
      date >= firstReportDay &&
      date <= lastReportDay
      ? date
      : null;
  });
}

export function moveCalendarDay(
  day: string,
  key: string,
  shift = false,
): string | null {
  const weekday = (calendarDate(day).getUTCDay() + 6) % 7;
  const offsets: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
    Home: -weekday,
    End: 6 - weekday,
  };
  if (key in offsets) return shiftCalendarDay(day, offsets[key]);
  if (key !== "PageUp" && key !== "PageDown") return null;
  const month = shiftCalendarMonth(
    day.slice(0, 7),
    (key === "PageUp" ? -1 : 1) * (shift ? 12 : 1),
  );
  return boundedCalendarDay(
    calendarDate(
      `${month}-${String(Math.min(Number(day.slice(8)), lastDayOfMonth(month))).padStart(2, "0")}`,
    ),
  );
}

export function getReportShortcut(shortcut: ReportShortcut, now = new Date()) {
  const today = boundedCalendarDay(
    calendarDate(formatDateInputAR(now).padStart(10, "0")),
  );
  if (shortcut === "yesterday") {
    const day = shiftCalendarDay(today, -1);
    return buildReportDateRange(day, day);
  }
  if (shortcut === "lastMonth") {
    const first = `${today.slice(0, 7)}-01`;
    return buildReportDateRange(
      `${shiftCalendarMonth(today.slice(0, 7), -1)}-01`,
      shiftCalendarDay(first, -1),
    );
  }
  const start =
    shortcut === "last7"
      ? shiftCalendarDay(today, -6)
      : shortcut === "last30"
        ? shiftCalendarDay(today, -29)
        : shortcut === "thisMonth"
          ? `${today.slice(0, 7)}-01`
          : today;
  return buildReportDateRange(start, today);
}
