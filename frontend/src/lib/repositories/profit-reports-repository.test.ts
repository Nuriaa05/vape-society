import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { profitReportsRepository } from "./profit-reports-repository";

const originalFetch = globalThis.fetch;
const dates = {
  from: "2026-10-01T03:00:00.000Z",
  to: "2026-10-22T03:00:00.000Z",
};
const summary = {
  salesCount: 102,
  missingCostSalesCount: 0,
  revenueAmountCents: 1001,
  costAmountCents: 1201,
  profitAmountCents: -200,
};
function sale(index: number) {
  return {
    id: `sale-${index}`,
    number: String(index),
    customerName: null,
    saleDate: dates.from,
    deliveredAt: dates.from,
    revenueAmountCents: 100,
    costAmountCents: 100,
    profitAmountCents: 0,
    missingCost: false,
  };
}
const response = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
function page(pageNumber: number, total = 102) {
  return {
    ...dates,
    page: pageNumber,
    pageSize: 100,
    total,
    totalPages: 2,
    summary,
    items:
      pageNumber === 1
        ? Array.from({ length: 100 }, (_, index) => sale(index))
        : [sale(100), sale(101)],
  };
}

describe("profit reports repository", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends exact dates and grouping and preserves null amounts", async () => {
    vi.mocked(globalThis.fetch).mockImplementationOnce(() =>
      response({
        ...dates,
        groupBy: "month",
        summary,
        buckets: [
          {
            ...dates,
            label: "octubre de 2026",
            partial: true,
            ...summary,
            costAmountCents: null,
            profitAmountCents: null,
            missingCostSalesCount: 1,
          },
        ],
      }),
    );
    const result = await profitReportsRepository.getReport(dates, "month");
    const url = new URL(String(vi.mocked(globalThis.fetch).mock.calls[0][0]));
    expect(url.pathname).toBe("/api/reports/profit");
    expect(url.searchParams.get("from")).toBe(dates.from);
    expect(url.searchParams.get("to")).toBe(dates.to);
    expect(url.searchParams.get("groupBy")).toBe("month");
    expect(result.summary).toMatchObject({
      revenue: 10.01,
      cost: 12.01,
      profit: -2,
    });
    expect(result.buckets[0]).toMatchObject({
      cost: null,
      profit: null,
      partial: true,
      missingCostSalesCount: 1,
    });
  });

  it("loads a page while keeping the full summary", async () => {
    vi.mocked(globalThis.fetch).mockImplementationOnce(() => response(page(2)));
    const result = await profitReportsRepository.getSales(dates, 2, 100);
    expect(result.total).toBe(102);
    expect(result.items).toHaveLength(2);
    expect(result.summary.profit).toBe(-2);
    expect(result.items[0].profit).toBe(0);
  });

  it("only sends report query parameters when dates contain report data", async () => {
    const report = {
      ...dates,
      groupBy: "day",
      summary,
      buckets: [{ ...dates, label: "octubre", partial: true, ...summary }],
    };
    vi.mocked(globalThis.fetch).mockImplementationOnce(() => response(report));

    await profitReportsRepository.getReport(report, "month");

    const url = new URL(String(vi.mocked(globalThis.fetch).mock.calls[0][0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ...dates,
      groupBy: "month",
    });
  });

  it("only sends dates and pagination when exporting a large report", async () => {
    const report = {
      ...dates,
      groupBy: "day",
      summary,
      buckets: Array.from({ length: 1096 }, () => ({
        ...dates,
        label: "día",
        partial: false,
        ...summary,
      })),
    };
    vi.mocked(globalThis.fetch)
      .mockImplementationOnce(() => response(page(1)))
      .mockImplementationOnce(() => response(page(2)));

    await profitReportsRepository.getAllSales(report);

    for (const [index, [request]] of vi
      .mocked(globalThis.fetch)
      .mock.calls.entries()) {
      const url = new URL(String(request));
      expect(Object.fromEntries(url.searchParams)).toEqual({
        ...dates,
        page: String(index + 1),
        pageSize: "100",
      });
    }
  });

  it("exports every page instead of only visible rows", async () => {
    vi.mocked(globalThis.fetch)
      .mockImplementationOnce(() => response(page(1)))
      .mockImplementationOnce(() => response(page(2)));
    const result = await profitReportsRepository.getAllSales(dates);
    expect(result.items).toHaveLength(102);
    expect(result.items[101].id).toBe("sale-101");
    expect(result.summary.profit).toBe(-2);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects changed or repeated export pages instead of saving a partial report", async () => {
    vi.mocked(globalThis.fetch)
      .mockImplementationOnce(() => response(page(1)))
      .mockImplementationOnce(() => response(page(2, 103)));
    await expect(profitReportsRepository.getAllSales(dates)).rejects.toThrow();
    vi.mocked(globalThis.fetch)
      .mockImplementationOnce(() => response(page(1)))
      .mockImplementationOnce(() =>
        response({ ...page(2), items: [sale(0), sale(101)] }),
      );
    await expect(profitReportsRepository.getAllSales(dates)).rejects.toThrow();
  });
});
