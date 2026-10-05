import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const readRoute = (filename: string): string =>
  readFileSync(path.join(__dirname, filename), "utf8");
const readPage = (filename: string): string =>
  readFileSync(path.join(__dirname, "-pages", filename), "utf8");

describe("reports and history UI contracts", () => {
  it("exports complete report datasets and exposes product consumption", () => {
    const source = readPage("reportes.tsx");

    expect(source).toContain("getProductConsumption(reportRange)");
    expect(source).toContain("getSalesExport(reportRange)");
    expect(source).toContain("buildTopProductsExportRows(bestSelling)");
    expect(source).not.toContain(
      "buildTopProductsExportRows(visibleBestSelling)",
    );
    expect(source).toContain("Todo el tiempo");
  });

  it("loads the exact selected bucket and supports quantity or revenue rankings", () => {
    const source = readPage("reportes.tsx");

    expect(source).toContain("detailProductsQuery");
    expect(source).toContain("from: selected.from");
    expect(source).toContain("to: selected.to");
    expect(source).toContain("Más vendidos");
    expect(source).toContain("Más ingresos");
    expect(source).toContain("Ver todo el tiempo");
    expect(source).not.toContain("requiere un reporte específico del backend");
  });

  it("keeps History as a lazy top-level route", () => {
    const source = readRoute("historial.tsx");
    const page = readPage("historial.tsx");

    expect(source).toContain("lazyRouteComponent");
    expect(source).not.toContain("@/components/app-shell");
    expect(page).toContain('event.type === "stock" ? "Variación" : "Cantidad"');
  });
});
