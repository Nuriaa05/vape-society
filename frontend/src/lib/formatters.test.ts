import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatDateInputAR,
  formatDateTimeAR,
  formatReceiptDateTimeAR,
  formatTimeAR,
} from "./formatters";

describe("frontend date formatters", () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    ["2026-11-01T02:59:59.999Z", "2026-10-31"],
    ["2026-11-01T03:00:00.000Z", "2026-11-01"],
    ["2027-01-01T02:59:59.999Z", "2026-12-31"],
    ["2027-01-01T03:00:00.000Z", "2027-01-01"],
  ])("uses the Argentine day for date inputs at %s", (now, day) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    expect(formatDateInputAR()).toBe(day);
    expect(formatDateInputAR(now)).toBe(day);
  });

  it("formats visible dates and hours in Argentina timezone", () => {
    const date = "2026-01-01T03:00:00.000Z";

    expect(formatTimeAR(date)).toBe("00:00");
    expect(formatDateTimeAR(date)).toContain("00:00");
  });

  it("formats receipt dates without exposing technical timezone names", () => {
    const date = "2026-01-01T03:00:00.000Z";

    expect(formatReceiptDateTimeAR(date)).toBe("01/01/2026, 00:00");
    expect(formatReceiptDateTimeAR(date)).not.toContain("America/Argentina");
  });
});
