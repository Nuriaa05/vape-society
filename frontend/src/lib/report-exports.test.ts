import { describe, expect, it } from "vitest";

import {
  buildConsumptionExportRows,
  buildTopProductsExportRows,
  buildReportDateRange,
  getReportRangeLabel,
  getTopProductsSortLabel,
} from "./report-exports";

describe("report exports", () => {
  it.each([
    ["2026-10-18", "2026-10-18", "2026-10-19T03:00:00.000Z"],
    ["2026-12-31", "2027-01-01", "2027-01-02T03:00:00.000Z"],
    ["2028-02-28", "2028-02-29", "2028-03-01T03:00:00.000Z"],
  ])(
    "includes the entire last Argentine day of %s through %s",
    (from, to, end) => {
      const range = buildReportDateRange(from, to);
      expect(range).toEqual({ from: `${from}T03:00:00.000Z`, to: end });
      expect(getReportRangeLabel(range)).toBe(
        `${from.split("-").reverse().join("/")} al ${to.split("-").reverse().join("/")}`,
      );
    },
  );

  it.each([
    [
      "2008-10-18",
      "2008-10-19",
      "2008-10-18T03:00:00.000Z",
      "2008-10-20T02:00:00.000Z",
    ],
    [
      "2008-10-19",
      "2008-10-19",
      "2008-10-19T03:00:00.000Z",
      "2008-10-20T02:00:00.000Z",
    ],
    [
      "2009-03-14",
      "2009-03-15",
      "2009-03-14T02:00:00.000Z",
      "2009-03-16T03:00:00.000Z",
    ],
    [
      "0001-01-01",
      "0001-01-01",
      "0001-01-01T03:53:48.000Z",
      "0001-01-02T03:53:48.000Z",
    ],
    [
      "0099-12-31",
      "0100-01-01",
      "0099-12-31T03:53:48.000Z",
      "0100-01-02T03:53:48.000Z",
    ],
    [
      "9999-12-29",
      "9999-12-30",
      "9999-12-29T03:00:00.000Z",
      "9999-12-31T03:00:00.000Z",
    ],
  ])(
    "resolves Argentine calendar boundaries for %s through %s",
    (from, to, start, end) => {
      expect(buildReportDateRange(from, to)).toEqual({ from: start, to: end });
    },
  );

  it.each([
    ["", "2026-10-18"],
    ["2026-10-18", ""],
    ["2026-10-19", "2026-10-18"],
    ["2026-02-30", "2026-03-01"],
    ["0000-01-01", "0001-01-01"],
    ["10000-01-01", "10000-01-02"],
    ["2025-02-29", "2025-03-01"],
    ["2026-13-01", "2027-01-01"],
    ["9999-12-31", "9999-12-31"],
  ])("rejects invalid report dates %s and %s", (from, to) => {
    expect(() => buildReportDateRange(from, to)).toThrow();
  });
  it("exports every sold item instead of the visible preview", () => {
    const products = Array.from({ length: 12 }, (_, index) => ({
      name: `Producto ${index + 1}`,
      qty: index + 1,
      total: (index + 1) * 1000,
      itemType: "Product" as const,
      components: [],
    }));

    const rows = buildTopProductsExportRows(products);

    expect(rows).toHaveLength(13);
    expect(rows.at(-1)).toEqual(["Producto 12", 12, 12000]);
  });

  it("exports complete direct, combo, delivered and reserved consumption", () => {
    const rows = buildConsumptionExportRows([
      {
        productId: "p1",
        name: "Milanesas",
        directQty: 3,
        comboQty: 2,
        deliveredQty: 4,
        reservedQty: 1,
        totalQty: 5,
      },
    ]);

    expect(rows).toEqual([
      [
        "Producto",
        "Venta directa",
        "En combos",
        "Entregado",
        "Reservado",
        "Total comprometido",
      ],
      ["Milanesas", 3, 2, 4, 1, 5],
    ]);
  });

  it("uses an explicit all-time label", () => {
    expect(getReportRangeLabel("all")).toBe("Todo el tiempo");
    expect(getReportRangeLabel("30d")).toBe("Últimos 30 días");
  });

  it("labels the active top-products ranking criterion", () => {
    expect(getTopProductsSortLabel("quantity")).toBe("Más vendidos");
    expect(getTopProductsSortLabel("revenue")).toBe("Más ingresos");
  });
});
