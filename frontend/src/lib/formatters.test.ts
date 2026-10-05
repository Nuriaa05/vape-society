import { describe, expect, it } from "vitest";

import {
  formatDateTimeAR,
  formatReceiptDateTimeAR,
  formatTimeAR,
} from "./formatters";

describe("frontend date formatters", () => {
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
