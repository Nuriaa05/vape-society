import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { historyRepository } from "./history-repository";

const originalFetch = globalThis.fetch;

function mockJsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("history repository", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("loads activity months and maps monetary values", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockImplementationOnce(() =>
        mockJsonResponse([
          { month: "2026-08", label: "agosto de 2026", eventCount: 12 },
        ]),
      )
      .mockImplementationOnce(() =>
        mockJsonResponse({
          items: [
            {
              id: "sale:1:created",
              occurredAt: "2026-08-15T15:00:00.000Z",
              type: "sales",
              title: "Venta 000001",
              description: "1x Milanesas",
              entityId: "1",
              amountCents: 450000,
              quantity: 1,
              status: "Confirmada",
            },
          ],
          total: 1,
          hasMore: false,
        }),
      );

    await expect(historyRepository.getMonths()).resolves.toEqual([
      { month: "2026-08", label: "agosto de 2026", eventCount: 12 },
    ]);
    await expect(
      historyRepository.findAll({
        month: "2026-08",
        day: "2026-08-15",
        type: "sales",
        query: "milanesas",
        take: 20,
        skip: 0,
      }),
    ).resolves.toEqual({
      items: [expect.objectContaining({ id: "sale:1:created", amount: 4500 })],
      total: 1,
      hasMore: false,
    });
    const url = String(fetchMock.mock.calls[1][0]);
    expect(url).toContain("month=2026-08");
    expect(url).toContain("day=2026-08-15");
    expect(url).toContain("type=sales");
    expect(url).toContain("query=milanesas");
    expect(url).toContain("take=20");
    expect(url).toContain("skip=0");
  });

  it("loads every matching movement beyond the API page limit", async () => {
    const items = Array.from({ length: 205 }, (_, index) => ({
      id: `sale:${index}:created`,
      occurredAt: "2026-10-04T15:00:00.000Z",
      type: "sales",
      title: `Venta ${index}`,
      description: "1x Perfume",
      entityId: String(index),
      amountCents: 1350000,
      quantity: 1,
      status: "Confirmada",
    }));
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), "http://localhost");
      const take = Number(url.searchParams.get("take"));
      const skip = Number(url.searchParams.get("skip"));
      return mockJsonResponse({
        items: items.slice(skip, skip + take),
        total: items.length,
        hasMore: skip + take < items.length,
      });
    });

    const result = await historyRepository.findAllMatching({
      month: "2026-10",
      day: "2026-10-04",
      type: "sales",
      query: "Perfume",
    });

    expect(result.items.map((event) => event.id)).toEqual(
      items.map((event) => event.id),
    );
    expect(result.items.every((event) => event.amount === 13500)).toBe(true);
    expect(result.total).toBe(205);
    expect(result.hasMore).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [index, [input]] of fetchMock.mock.calls.entries()) {
      const params = new URL(String(input), "http://localhost").searchParams;
      expect(params.get("month")).toBe("2026-10");
      expect(params.get("day")).toBe("2026-10-04");
      expect(params.get("type")).toBe("sales");
      expect(params.get("query")).toBe("Perfume");
      expect(Number(params.get("take"))).toBeLessThanOrEqual(100);
      expect(params.get("skip")).toBe(String(index * 100));
    }
  });

  it("returns an empty history without requesting more pages", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation(() =>
      mockJsonResponse({ items: [], total: 0, hasMore: false }),
    );

    await expect(
      historyRepository.findAllMatching({ month: "2026-10", query: "missing" }),
    ).resolves.toEqual({ items: [], total: 0, hasMore: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not return an incomplete history when a later page fails", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockImplementationOnce(() =>
        mockJsonResponse({
          items: [
            {
              id: "product:1:created",
              occurredAt: "2026-10-04T15:00:00.000Z",
              type: "products",
              title: "Producto creado",
              description: "Perfume",
              entityId: "1",
            },
          ],
          total: 2,
          hasMore: true,
        }),
      )
      .mockRejectedValueOnce(new Error("Connection lost"));

    await expect(
      historyRepository.findAllMatching({ month: "2026-10" }),
    ).rejects.toThrow("Connection lost");
  });
});
