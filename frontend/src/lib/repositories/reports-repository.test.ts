import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reportsRepository } from "./reports-repository";

const originalFetch = globalThis.fetch;

function mockJsonResponse(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("reports repository", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it.each(["week", "month"] as const)(
    "loads the %s sold units without converting them to currency",
    async (period) => {
      const series = {
        period,
        meta: { title: "Unidades vendidas", subtitle: "Período de prueba" },
        points: [
          {
            label: "Jue",
            fullLabel: "01/10/2026",
            from: "2026-10-01T03:00:00.000Z",
            to: "2026-10-02T03:00:00.000Z",
            units: 141,
          },
        ],
      };
      vi.mocked(globalThis.fetch).mockImplementationOnce(() =>
        mockJsonResponse(series),
      );

      await expect(
        reportsRepository.getSoldUnitsDataset(period),
      ).resolves.toEqual(series);

      expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0])).toContain(
        `/reports/units-series?period=${period}`,
      );
    },
  );

  it("keeps hourly report display between 08:00 and 21:00 without requiring backend truncation", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementationOnce(() =>
      mockJsonResponse({
        period: "hour",
        meta: { title: "Ventas por hora", subtitle: "Hoy por hora" },
        points: Array.from({ length: 24 }, (_, hour) => ({
          label: `${hour.toString().padStart(2, "0")}:00`,
          fullLabel: `29/06/2026 ${hour.toString().padStart(2, "0")}:00`,
          from: new Date(Date.UTC(2026, 5, 29, hour + 3)).toISOString(),
          to: new Date(Date.UTC(2026, 5, 29, hour + 4)).toISOString(),
          v: hour * 10000,
        })),
      }),
    );

    const points = await reportsRepository.getSalesDataset("hour");

    expect(points).toHaveLength(14);
    expect(points[0].label).toBe("08:00");
    expect(points.at(-1)?.label).toBe("21:00");
    expect(points[0]).toMatchObject({
      from: "2026-06-29T11:00:00.000Z",
      to: "2026-06-29T12:00:00.000Z",
    });
    expect(points.map((point) => point.label)).not.toContain("22:00");
  });

  it("maps combo component names from top products without rendering undefined", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementationOnce(() =>
      mockJsonResponse([
        {
          productId: null,
          comboId: "combo-1",
          itemType: "Combo",
          name: "Combo Asdas",
          qty: 4,
          totalAmountCents: 1200000,
          components: [
            { productId: "p1", name: "Burga", qty: 44 },
            { productId: "p2", name: "Papas", qty: 4 },
          ],
        },
      ]),
    );

    await expect(reportsRepository.getBestSellingProducts()).resolves.toEqual([
      {
        itemType: "Combo",
        name: "Combo Asdas",
        qty: 4,
        total: 12000,
        components: [
          { productName: "Burga", qty: 44 },
          { productName: "Papas", qty: 4 },
        ],
      },
    ]);
  });

  it("sends the selected range and quantity sort when requesting sold items", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementationOnce(() => mockJsonResponse([]));

    await reportsRepository.getBestSellingProducts({
      range: "90d",
      sort: "quantity",
    });

    const requestUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestUrl).toContain("/reports/top-products?");
    expect(requestUrl).toContain("range=90d");
    expect(requestUrl).toContain("sort=quantity");
  });

  it("requests an exact report bucket without mixing a preset range", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementationOnce(() => mockJsonResponse([]));

    await reportsRepository.getBestSellingProducts({
      from: "2026-07-06T03:00:00.000Z",
      to: "2026-07-13T03:00:00.000Z",
      sort: "revenue",
    });

    const requestUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestUrl).toContain("from=2026-07-06T03%3A00%3A00.000Z");
    expect(requestUrl).toContain("to=2026-07-13T03%3A00%3A00.000Z");
    expect(requestUrl).toContain("sort=revenue");
    expect(requestUrl).not.toContain("range=");
  });

  it("maps product consumption and all-time sales export data", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockImplementationOnce(() =>
        mockJsonResponse([
          {
            productId: "p1",
            name: "Milanesas",
            directQty: 3,
            comboQty: 2,
            deliveredQty: 4,
            reservedQty: 1,
            totalQty: 5,
          },
        ]),
      )
      .mockImplementationOnce(() =>
        mockJsonResponse([
          {
            id: "sale-1",
            number: "000001",
            date: "2026-06-30T15:00:00.000Z",
            deliveryStatus: "Entregado",
            status: "Confirmada",
            payment: "Efectivo",
            items: [
              {
                productId: "p1",
                name: "Milanesas",
                productName: "Milanesas",
                qty: 1,
                unitPriceAmountCents: 450000,
              },
            ],
            totalAmountCents: 450000,
          },
        ]),
      );
    const repository = reportsRepository as typeof reportsRepository & {
      getProductConsumption: (
        range: "all",
      ) => Promise<Array<{ productId: string; totalQty: number }>>;
      getSalesExport: (
        range: "all",
      ) => Promise<Array<{ number: string; total: number }>>;
    };

    await expect(repository.getProductConsumption("all")).resolves.toEqual([
      expect.objectContaining({ productId: "p1", totalQty: 5 }),
    ]);
    await expect(repository.getSalesExport("all")).resolves.toEqual([
      expect.objectContaining({ number: "000001", total: 4500 }),
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/reports/product-consumption?range=all",
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "/reports/sales?range=all",
    );
  });
});
