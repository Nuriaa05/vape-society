import { describe, expect, it } from "vitest";

import {
  buildConsumptionExportRows,
  buildTopProductsExportRows,
  getReportRangeLabel,
  getTopProductsSortLabel,
} from "./report-exports";

describe("report exports", () => {
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
    expect(rows.at(-1)).toEqual(["Producto 12", "12", "12000"]);
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
      ["Milanesas", "3", "2", "4", "1", "5"],
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
