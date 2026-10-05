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
});
