import { describe, expect, it } from "vitest";
import type { HistoryMonth } from "./repositories/history-repository";
import {
  getHistoryMonthPreview,
  groupHistoryMonthsByYear,
} from "./history-months";

function month(month: string, eventCount = 1): HistoryMonth {
  return { month, label: month, eventCount };
}

describe("history month navigation", () => {
  it("groups years and months from newest to oldest without changing the input", () => {
    const months = [
      month("2025-06", 22),
      month("2026-01", 71),
      month("2025-09", 9),
      month("2026-10", 68),
    ];

    expect(groupHistoryMonthsByYear(months)).toEqual([
      { year: "2026", months: [months[3], months[1]] },
      { year: "2025", months: [months[2], months[0]] },
    ]);
    expect(months.map((item) => item.month)).toEqual([
      "2025-06",
      "2026-01",
      "2025-09",
      "2026-10",
    ]);
  });

  it("handles a history with no active months", () => {
    expect(groupHistoryMonthsByYear([])).toEqual([]);
    expect(getHistoryMonthPreview([], "")).toEqual([]);
  });

  it("shows the four most recent months initially", () => {
    const months = [10, 9, 8, 7, 6, 5].map((value) =>
      month(`2026-${String(value).padStart(2, "0")}`),
    );

    expect(getHistoryMonthPreview(months, "2026-10")).toEqual(
      months.slice(0, 4),
    );
  });

  it("keeps an older selected month visible when the list is collapsed", () => {
    const months = [10, 9, 8, 7, 6, 1].map((value) =>
      month(`2026-${String(value).padStart(2, "0")}`),
    );

    expect(getHistoryMonthPreview(months, "2026-01")).toEqual([
      months[0],
      months[1],
      months[2],
      months[5],
    ]);
    expect(months).toHaveLength(6);
    expect(months[3].month).toBe("2026-07");
  });

  it("keeps every month visible for a year with four or fewer months", () => {
    const months = [month("2026-10", 321), month("2026-07", 12)];

    expect(getHistoryMonthPreview(months, "2026-07")).toEqual(months);
  });

  it("does not add a selected month from another year to the preview", () => {
    const months = [10, 9, 8, 7, 6].map((value) =>
      month(`2026-${String(value).padStart(2, "0")}`),
    );

    expect(getHistoryMonthPreview(months, "2025-09")).toEqual(
      months.slice(0, 4),
    );
  });
});
