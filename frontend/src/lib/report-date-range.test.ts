import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportDateRangePicker } from "@/components/report-date-range-picker";
import { buildReportDateRange } from "./report-exports";
import {
  getCalendarDays,
  moveCalendarDay,
  shiftCalendarMonth,
  getReportShortcut,
  getCalendarMonths,
} from "./report-date-range";

describe("report date range calendar", () => {
  it.each([
    ["0001-01-01", "0001-01-01"],
    ["9999-12-30", "9999-12-30"],
  ])(
    "renders the closed picker for supported limits %s through %s",
    (from, to) => {
      const markup = renderToStaticMarkup(
        createElement(ReportDateRangePicker, {
          value: buildReportDateRange(from, to),
          onChange: () => {},
        }),
      );
      expect(markup).toContain("Período");
      expect(markup).toContain("Rango de fechas:");
    },
  );

  it("keeps calendar month navigation and both visible months within four-digit years", () => {
    expect(shiftCalendarMonth("0001-01", -1)).toBe("0001-01");
    expect(shiftCalendarMonth("9999-12", 1)).toBe("9999-12");
    expect(getCalendarMonths("0001-01")).toEqual(["0001-01", "0001-02"]);
    expect(getCalendarMonths("9999-12")).toEqual(["9999-11", "9999-12"]);
    expect(getCalendarMonths("2026-12")).toEqual(["2026-12", "2027-01"]);
  });

  it("builds the limiting calendar grids without an out-of-range selectable day", () => {
    expect(getCalendarDays("0001-01").filter(Boolean)).toHaveLength(31);
    expect(getCalendarDays("0001-01")).toContain("0001-01-01");
    expect(getCalendarDays("9999-12").filter(Boolean)).toHaveLength(30);
    expect(getCalendarDays("9999-12")).toContain("9999-12-30");
    expect(getCalendarDays("9999-12")).not.toContain("9999-12-31");
  });

  it.each(["ArrowLeft", "ArrowUp", "Home", "PageUp"])(
    "clamps minimum-day keyboard %s",
    (key) => {
      expect(moveCalendarDay("0001-01-01", key)).toBe("0001-01-01");
      expect(moveCalendarDay("0001-01-01", key, true)).toBe("0001-01-01");
    },
  );

  it.each(["ArrowRight", "ArrowDown", "End", "PageDown"])(
    "clamps maximum-day keyboard %s",
    (key) => {
      expect(moveCalendarDay("9999-12-30", key)).toBe("9999-12-30");
      expect(moveCalendarDay("9999-12-30", key, true)).toBe("9999-12-30");
    },
  );

  it("retains normal keyboard movement next to both limits", () => {
    expect(moveCalendarDay("0001-01-01", "ArrowRight")).toBe("0001-01-02");
    expect(moveCalendarDay("9999-12-30", "ArrowLeft")).toBe("9999-12-29");
    expect(moveCalendarDay("9999-11-30", "PageDown")).toBe("9999-12-30");
    expect(moveCalendarDay("0001-12-31", "PageUp", true)).toBe("0001-01-31");
    expect(moveCalendarDay("9998-12-31", "PageDown", true)).toBe("9999-12-30");
  });

  it.each([
    "today",
    "yesterday",
    "last7",
    "last30",
    "thisMonth",
    "lastMonth",
  ] as const)(
    "keeps shortcut %s inside the minimum supported date",
    (shortcut) => {
      expect(
        getReportShortcut(shortcut, new Date("0001-01-01T12:00:00Z")),
      ).toEqual(buildReportDateRange("0001-01-01", "0001-01-01"));
    },
  );

  it("clamps a current date beyond the final selectable day", () => {
    expect(
      getReportShortcut("today", new Date("9999-12-31T12:00:00Z")),
    ).toEqual(buildReportDateRange("9999-12-30", "9999-12-30"));
  });

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

  it("resolves shortcuts at historical Argentine clock changes", () => {
    expect(
      getReportShortcut("today", new Date("2008-10-19T12:00:00Z")),
    ).toEqual({
      from: "2008-10-19T03:00:00.000Z",
      to: "2008-10-20T02:00:00.000Z",
    });
    expect(
      getReportShortcut("yesterday", new Date("2009-03-15T12:00:00Z")),
    ).toEqual({
      from: "2009-03-14T02:00:00.000Z",
      to: "2009-03-15T03:00:00.000Z",
    });
  });
});
