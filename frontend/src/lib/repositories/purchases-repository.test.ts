import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api-client";
import type { Purchase } from "@/lib/contracts";
import { purchasesRepository } from "./purchases-repository";

function purchase(
  id: string,
  date: string,
  total: number,
  status: Purchase["status"] = "Registrada",
): Purchase {
  return { id, supplierId: "supplier-1", date, total, status, items: [] };
}

describe("purchase monthly summary", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    ["2026-10-01T03:00:00.000Z", "2026-10-01"],
    ["2026-10-01T02:30:00.000Z", "2026-09-30"],
    ["2026-10-02T02:30:00.000Z", "2026-10-01"],
  ])(
    "preserves the Argentine calendar day when reading %s",
    async (date, day) => {
      vi.spyOn(apiClient, "get").mockResolvedValue([
        {
          id: "purchase-1",
          supplierId: "supplier-1",
          supplier: { id: "supplier-1", name: "Proveedor" },
          date,
          status: "Registrada",
          items: [],
          totalAmountCents: 150000,
          cancelReason: null,
          cancelledAt: null,
        },
      ]);

      const purchases = await purchasesRepository.findAll();
      expect(purchases[0].date).toBe(day);
      expect(purchases[0].total).toBe(1500);
    },
  );

  it("filters the complete history by month and year, including both boundary days", () => {
    const history = [
      purchase("previous-month", "2026-09-30", 1000),
      purchase("first-day", "2026-10-01", 1250.25),
      purchase("last-day", "2026-10-31", 2000),
      purchase("next-month", "2026-11-01", 3000),
      purchase("previous-year", "2025-10-10", 4000),
    ];

    const monthlyPurchases = purchasesRepository.findByMonth(
      history,
      new Date("2026-10-10T12:00:00.000Z"),
    );

    expect(monthlyPurchases.map((entry) => entry.id)).toEqual([
      "first-day",
      "last-day",
    ]);
    expect(purchasesRepository.getActiveTotal(monthlyPurchases)).toBe(3250.25);
    expect(purchasesRepository.getActiveCount(monthlyPurchases)).toBe(2);
    expect(history).toHaveLength(5);
  });

  it("uses the same monthly purchases for amount and count, excluding cancelled purchases", () => {
    const history = [
      purchase("registered", "2026-10-01", 1500),
      purchase("pending", "2026-10-10", 1250.25, "Pendiente"),
      purchase("cancelled", "2026-10-10", 9000, "Anulada"),
      purchase("older", "2026-09-10", 1000),
    ];

    const monthlyPurchases = purchasesRepository.findByMonth(
      history,
      new Date("2026-10-10T12:00:00.000Z"),
    );

    expect(purchasesRepository.getActiveTotal(monthlyPurchases)).toBe(2750.25);
    expect(purchasesRepository.getActiveCount(monthlyPurchases)).toBe(2);
  });

  it.each([
    ["2026-11-01T02:59:59.999Z", "october"],
    ["2026-11-01T03:00:00.000Z", "november"],
    ["2027-01-01T02:59:59.999Z", "december"],
    ["2027-01-01T03:00:00.000Z", "january"],
  ])("uses the current month in Argentina at %s", (now, expectedId) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    const history = [
      purchase("october", "2026-10-31", 1000),
      purchase("november", "2026-11-01", 2000),
      purchase("december", "2026-12-31", 3000),
      purchase("january", "2027-01-01", 4000),
    ];

    expect(
      purchasesRepository.findByMonth(history).map((entry) => entry.id),
    ).toEqual([expectedId]);
  });

  it("returns a zero amount and count when the month has no active purchases", () => {
    const history = [
      purchase("older", "2026-09-10", 1000),
      purchase("cancelled", "2026-10-10", 9000, "Anulada"),
    ];

    const monthlyPurchases = purchasesRepository.findByMonth(
      history,
      new Date("2026-10-10T12:00:00.000Z"),
    );

    expect(purchasesRepository.getActiveTotal(monthlyPurchases)).toBe(0);
    expect(purchasesRepository.getActiveCount(monthlyPurchases)).toBe(0);
    expect(purchasesRepository.findByMonth([], new Date())).toEqual([]);
  });
});
