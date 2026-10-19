import { describe, expect, it } from "vitest";
import {
  getCalendarDays,
  moveCalendarDay,
  shiftCalendarMonth,
  getReportShortcut,
} from "./report-date-range";

describe("report date range calendar", () => {
  it("shows complete weeks from Monday and includes leap February", () => {
    const days = getCalendarDays("2028-02");
    expect(days).toHaveLength(42);
    expect(days[0]).toBeNull();
    expect(days[1]).toBe("2028-02-01");
    expect(days.filter(Boolean)).toHaveLength(29);
    expect(days).toContain("2028-02-29");
    expect(getCalendarDays("2026-02").filter(Boolean)).toHaveLength(28);
  });

  it("moves between months and keeps keyboard navigation on valid days", () => {
    expect(shiftCalendarMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftCalendarMonth("2027-01", -1)).toBe("2026-12");
    expect(moveCalendarDay("2027-01-01", "ArrowLeft")).toBe("2026-12-31");
    expect(moveCalendarDay("2026-10-18", "Home")).toBe("2026-10-12");
    expect(moveCalendarDay("2026-10-12", "End")).toBe("2026-10-18");
    expect(moveCalendarDay("2028-01-31", "PageDown")).toBe("2028-02-29");
    expect(moveCalendarDay("2028-02-29", "PageDown", true)).toBe("2029-02-28");
    expect(moveCalendarDay("2026-10-18", "Escape")).toBeNull();
  });

  it("uses the Argentine date for shortcuts even after UTC midnight", () => {
    expect(
      getReportShortcut("today", new Date("2027-01-01T02:00:00Z")),
    ).toEqual({
      from: "2026-12-31T03:00:00.000Z",
      to: "2027-01-01T03:00:00.000Z",
    });
  });

  it("includes both days in shortcuts across years and leap months", () => {
    expect(
      getReportShortcut("last7", new Date("2027-01-03T12:00:00Z")),
    ).toEqual({
      from: "2026-12-28T03:00:00.000Z",
      to: "2027-01-04T03:00:00.000Z",
    });
    expect(
      getReportShortcut("lastMonth", new Date("2028-03-15T12:00:00Z")),
    ).toEqual({
      from: "2028-02-01T03:00:00.000Z",
      to: "2028-03-01T03:00:00.000Z",
    });
    expect(
      getReportShortcut("thisMonth", new Date("2026-10-18T12:00:00Z")),
    ).toEqual({
      from: "2026-10-01T03:00:00.000Z",
      to: "2026-10-19T03:00:00.000Z",
    });
  });
});
