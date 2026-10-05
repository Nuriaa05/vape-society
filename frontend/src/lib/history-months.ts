import type { HistoryMonth } from "./repositories/history-repository";

export const HISTORY_MONTH_PREVIEW_LIMIT = 4;

export type HistoryYearGroup = {
  year: string;
  months: HistoryMonth[];
};

export function groupHistoryMonthsByYear(
  months: readonly HistoryMonth[],
): HistoryYearGroup[] {
  const groups = new Map<string, HistoryMonth[]>();

  for (const month of months) {
    const year = month.month.slice(0, 4);
    const group = groups.get(year) ?? [];
    group.push(month);
    groups.set(year, group);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, items]) => ({
      year,
      months: items.sort((a, b) => b.month.localeCompare(a.month)),
    }));
}

export function getHistoryMonthPreview(
  months: readonly HistoryMonth[],
  selectedMonth: string,
): HistoryMonth[] {
  const preview = months.slice(0, HISTORY_MONTH_PREVIEW_LIMIT);
  const selected = months.find((month) => month.month === selectedMonth);

  if (!selected || preview.includes(selected)) return preview;

  return [...preview.slice(0, -1), selected];
}
