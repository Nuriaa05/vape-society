import { describe, expect, it } from "vitest";
import {
  buildProfitExportRows,
  buildProfitSalesExportRows,
  dateRangeToReportSearch,
  getTodayProfitReportSearch,
  getProfitReportDates,
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
  it("offers today's profit, ten-day cuts and monthly reports", () => {
    expect(profitGroupingLabels).toEqual({
      day: "Ganancia de hoy",
      tenDays: "Cortes de 10 días",
      month: "Mensual",
    });
  });

  it("limits today's profit to the current Argentina day even with old or monthly URL dates", () => {
    const now = new Date("2026-01-01T02:59:59Z");
    const today = buildReportDateRange("2025-12-31", "2025-12-31");
    expect(getProfitReportDates("day", dates, now)).toEqual(today);
    expect(getProfitReportDates("day", undefined, now)).toEqual(today);
    expect(
      getProfitReportDates("day", dates, new Date("2026-01-01T03:00:00Z")),
    ).toEqual(buildReportDateRange("2026-01-01", "2026-01-01"));
  });

  it.each(["tenDays", "month"] as const)(
    "keeps the selected range for %s and defaults to this month",
    (group) => {
      const now = new Date("2026-10-21T15:00:00Z");
      expect(getProfitReportDates(group, dates, now)).toEqual(dates);
      expect(getProfitReportDates(group, undefined, now)).toEqual(
        buildReportDateRange("2026-10-01", "2026-10-21"),
      );
    },
  );

  it("labels today's CSV using the selected today period", () => {
    const rows = buildProfitExportRows({
      ...buildReportDateRange("2026-10-21", "2026-10-21"),
      groupBy: "day",
      summary,
      buckets: [],
    });
    expect(rows).toContainEqual(["Agrupación", "Ganancia de hoy"]);
  });

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
});
