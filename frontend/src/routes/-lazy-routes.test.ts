import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const routeFiles = [
  "index.tsx",
  "productos.tsx",
  "combos.tsx",
  "nueva-venta.tsx",
  "ventas.tsx",
  "compras.tsx",
  "stock.tsx",
  "proveedores.tsx",
  "reportes.tsx",
  "configuracion.tsx",
];

describe("route code splitting", () => {
  it("keeps top-level route modules as lightweight lazy wrappers", () => {
    for (const routeFile of routeFiles) {
      const source = readFileSync(path.join(__dirname, routeFile), "utf8");

      expect(source).toContain("lazyRouteComponent");
      expect(source).not.toContain("@/components/app-shell");
      expect(source).not.toContain("@/components/ui/");
      expect(source).not.toContain("@/lib/repositories");
    }
  });
});
