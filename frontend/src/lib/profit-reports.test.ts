import { describe, expect, it } from "vitest";
import {
  buildProfitExportRows,
  buildProfitSalesExportRows,
  dateRangeToReportSearch,
  getTodayProfitReportSearch,
  getProfitReportDates,
  getProfitDaySearch,
  parseReportSearch,
  profitGroupingLabels,
} from "./profit-reports";
import { buildReportDateRange } from "./report-exports";
import type { ProfitBucket } from "./repositories/profit-reports-repository";

const dates = buildReportDateRange("2024-02-01", "2024-02-29");
const summary = {
  salesCount: 2,
  missingCostSalesCount: 0,
  revenue: 10.01,
  cost: 12.01,
  profit: -2,
};

describe("profit report navigation and exports", () => {
  it("offers daily, ten-day cuts and monthly reports", () => {
    expect(profitGroupingLabels).toEqual({
      day: "Diario",
      tenDays: "Cortes de 10 días",
      month: "Mensual",
    });
  });

  it("keeps the selected historical interval for daily profits", () => {
    const now = new Date("2026-01-01T02:59:59Z");
    expect(getProfitReportDates(dates, now)).toEqual(dates);
  });

  it.each([
    ["2026-10-22T15:00:00Z", "2026-10-01", "2026-10-22"],
    ["2026-01-01T02:59:59Z", "2025-12-01", "2025-12-31"],
    ["2026-01-01T03:00:00Z", "2026-01-01", "2026-01-01"],
  ])(
    "defaults the daily interval to the current Argentine month at %s",
    (instant, from, to) => {
      expect(getProfitReportDates(undefined, new Date(instant))).toEqual(
        buildReportDateRange(from, to),
      );
    },
  );

  it("labels the daily CSV and keeps the complete consulted interval", () => {
    const rows = buildProfitExportRows({
      ...dates,
      groupBy: "day",
      summary,
      buckets: [],
    });
    expect(rows).toContainEqual(["Agrupación", "Diario"]);
    expect(rows).toContainEqual(["Período", "01/02/2024 al 29/02/2024"]);
  });

  it("keeps the dashboard link scoped to today's single day in the daily view", () => {
    const now = new Date("2026-01-01T02:59:59Z");
    const search = getTodayProfitReportSearch(now);
    expect(
      getProfitReportDates(
        buildReportDateRange(search.desde!, search.hasta!),
        now,
      ),
    ).toEqual(buildReportDateRange("2025-12-31", "2025-12-31"));
    expect(search.agrupacion).toBe("day");
  });

  it("selects a historical day and switches profits to the daily view", () => {
    const search = getProfitDaySearch("2024-02-29");
    expect(search).toEqual({
      vista: "ganancias",
      agrupacion: "day",
      desde: "2024-02-29",
      hasta: "2024-02-29",
    });
    expect(buildReportDateRange(search.desde!, search.hasta!)).toEqual({
      from: "2024-02-29T03:00:00.000Z",
      to: "2024-03-01T03:00:00.000Z",
    });
  });

  it("clears both selected dates so profits return to the current month", () => {
    const search = {
      ...getProfitDaySearch("2024-02-29"),
      ...getProfitDaySearch(),
    };
    expect(search).toEqual({
      vista: "ganancias",
      agrupacion: "day",
      desde: undefined,
      hasta: undefined,
    });
    expect(parseReportSearch(search)).toEqual({
      vista: "ganancias",
      agrupacion: "day",
    });
  });

  it.each(["", "2025-02-29", "2026-13-01", "15/09/2026"])(
    "rejects invalid selected profit day %s",
    (day) => expect(() => getProfitDaySearch(day)).toThrow(/fechas/i),
  );

  it.each(["hour", "month", "90d", "year"])(
    "preserves the sales period %s independently of profit grouping",
    (periodo) => {
      expect(
        parseReportSearch({
          vista: "ganancias",
          agrupacion: "tenDays",
          periodo,
        }),
      ).toEqual({ vista: "ganancias", agrupacion: "tenDays", periodo });
      expect(parseReportSearch({ periodo: "invalid" })).toEqual({});
    },
  );

  it("validates paired calendar dates and ignores invalid URL parameters", () => {
    expect(
      parseReportSearch({
        vista: "ganancias",
        desde: "2024-02-01",
        hasta: "2024-02-29",
        agrupacion: "tenDays",
      }),
    ).toEqual({
      vista: "ganancias",
      desde: "2024-02-01",
      hasta: "2024-02-29",
      agrupacion: "tenDays",
    });
    for (const invalid of [
      { desde: "2025-02-29", hasta: "2025-03-01" },
      { desde: "2024-02-02", hasta: "2024-02-01" },
      { desde: "2024-02-01" },
    ]) {
      expect(parseReportSearch({ vista: "ganancias", ...invalid })).toEqual({
        vista: "ganancias",
      });
    }
    expect(parseReportSearch({ vista: "other", agrupacion: "year" })).toEqual(
      {},
    );
  });

  it("roundtrips inclusive calendar dates and recognizes today in Argentina", () => {
    expect(dateRangeToReportSearch(dates)).toEqual({
      desde: "2024-02-01",
      hasta: "2024-02-29",
    });
    expect(
      getTodayProfitReportSearch(new Date("2026-01-01T02:59:59Z")),
    ).toEqual({
      vista: "ganancias",
      desde: "2025-12-31",
      hasta: "2025-12-31",
      agrupacion: "day",
    });
  });

  it.each([
    ["2008-10-18", "2008-10-19"],
    ["2008-10-19", "2008-10-19"],
    ["2009-03-14", "2009-03-15"],
    ["0001-01-01", "0001-01-01"],
    ["0099-12-31", "0100-01-01"],
    ["9999-12-29", "9999-12-30"],
  ])("keeps URL dates stable for %s through %s", (desde, hasta) => {
    const range = buildReportDateRange(desde, hasta);
    const search = parseReportSearch(dateRangeToReportSearch(range));
    expect(search).toEqual({ desde, hasta });
    expect(buildReportDateRange(search.desde!, search.hasta!)).toEqual(range);
  });

  it.each([
    {
      salesCount: 12,
      missingCostSalesCount: 1,
      revenue: 30.01,
      cost: null,
      profit: null,
    },
    {
      salesCount: 12,
      missingCostSalesCount: 0,
      revenue: 30.01,
      cost: 32.02,
      profit: -2.01,
    },
  ])(
    "exports all selected interval sales with the full summary $profit",
    (fullSummary) => {
      const rows = buildProfitSalesExportRows(
        Array.from({ length: 12 }, (_, index) => ({
          id: String(index),
          number: `Venta ${index + 1}`,
          customerName: null,
          saleDate: "2024-02-28T15:00:00Z",
          deliveredAt: "2024-02-29T03:00:00Z",
          revenue: 5.01,
          cost: index === 11 ? null : 5.02,
          profit: index === 11 ? null : -0.01,
          missingCost: index === 11,
        })),
        dates,
        fullSummary,
      );
      expect(rows[1]).toEqual(["Período", "01/02/2024 al 29/02/2024"]);
      expect(rows.find((row) => row[0] === "Venta 12")).toEqual([
        "Venta 12",
        "Consumidor final",
        "28/02/2024",
        "29/02/2024",
        5.01,
        "No disponible",
        "No disponible",
        "No",
      ]);
      expect(rows.at(-1)).toEqual([
        "Total",
        "",
        "",
        "",
        fullSummary.revenue,
        fullSummary.cost ?? "No disponible",
        fullSummary.profit ?? "No disponible",
        "",
      ]);
      expect(
        rows.filter((row) => String(row[0]).startsWith("Venta ")),
      ).toHaveLength(12);
    },
  );

  it("exports every group with exact cents, negative profit and incomplete history", () => {
    const buckets: ProfitBucket[] = Array.from({ length: 13 }, (_, index) => ({
      ...summary,
      ...dates,
      label: `Grupo ${index + 1}`,
      partial: index === 12,
    }));
    buckets[12] = {
      ...buckets[12],
      cost: null,
      profit: null,
      missingCostSalesCount: 1,
    };
    const rows = buildProfitExportRows({
      ...dates,
      groupBy: "tenDays",
      summary,
      buckets,
    });
    expect(rows).toContainEqual([
      "Ventas entregadas del período ARS",
      summary.revenue,
    ]);
    expect(rows).toContainEqual([
      "Costo de productos vendidos ARS",
      summary.cost,
    ]);
    expect(rows).toContainEqual(["Ganancia del período ARS", summary.profit]);
    expect(
      rows.some((row) => row[0] === "Total" || row[0] === "Total del período"),
    ).toBe(false);
    expect(rows.at(-1)?.[0]).toBe("Grupo 13");
    expect(rows.some((row) => row[0] === "Grupo 13")).toBe(true);
    expect(rows.find((row) => row[0] === "Grupo 1")).toContain(-2);
    expect(rows.find((row) => row[0] === "Grupo 1")).toContain(10.01);
    expect(rows.find((row) => row[0] === "Grupo 13")).toContain(
      "No disponible",
    );
    expect(rows.find((row) => row[0] === "Grupo 13")).toContain("Sí");
    expect(
      rows.some((row) =>
        row.some((cell) => String(cell).includes("29/02/2024")),
      ),
    ).toBe(true);
  });

  it("exports original sale and delivery dates, consumer names and zero profit", () => {
    const rows = buildProfitSalesExportRows(
      [
        {
          id: "a",
          number: "000001",
          customerName: null,
          saleDate: "2024-02-28T15:00:00Z",
          deliveredAt: "2024-02-29T03:00:00Z",
          revenue: 5,
          cost: 5,
          profit: 0,
          missingCost: false,
        },
      ],
      dates,
      {
        salesCount: 1,
        missingCostSalesCount: 0,
        revenue: 5,
        cost: 5,
        profit: 0,
      },
    );
    const row = rows.find((value) => value[0] === "000001");
    expect(row).toContain("28/02/2024");
    expect(row).toContain("29/02/2024");
    expect(row).toContain("Consumidor final");
    expect(row).toContain(0);
  });

  it("keeps unverifiable historical costs unavailable in the summary export", () => {
    const rows = buildProfitExportRows({
      ...dates,
      groupBy: "day",
      buckets: [],
      summary: {
        ...summary,
        cost: null,
        profit: null,
        missingCostSalesCount: 1,
      },
    });
    expect(rows).toContainEqual([
      "Costo de productos vendidos ARS",
      "No disponible",
    ]);
    expect(rows).toContainEqual(["Ganancia del período ARS", "No disponible"]);
    expect(rows.some((row) => row[0] === "Total")).toBe(false);
  });
});
