import { describe, expect, it } from "vitest";

import {
  createSidebarNavigationLogEntry,
  formatSidebarNavigationError,
  getSidebarAriaCurrent,
} from "./sidebar-navigation";

describe("sidebar navigation helpers", () => {
  it("builds structured logs with route origin and destination", () => {
    const entry = createSidebarNavigationLogEntry({
      event: "navigate-start",
      from: "/productos",
      label: "Nueva venta",
      now: () => new Date("2026-06-28T15:00:00.000Z"),
      to: "/nueva-venta",
    });

    expect(entry).toEqual({
      event: "navigate-start",
      from: "/productos",
      label: "Nueva venta",
      scope: "sidebar-navigation",
      timestamp: "2026-06-28T15:00:00.000Z",
      to: "/nueva-venta",
    });
  });

  it("marks only the active sidebar item as the current page", () => {
    expect(getSidebarAriaCurrent(true)).toBe("page");
    expect(getSidebarAriaCurrent(false)).toBeUndefined();
  });

  it("formats unknown navigation errors safely for renderer logs", () => {
    expect(formatSidebarNavigationError(new Error("route failed"))).toBe(
      "route failed",
    );
    expect(formatSidebarNavigationError("plain failure")).toBe("plain failure");
  });
});
