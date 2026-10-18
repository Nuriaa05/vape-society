import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/compras")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { proveedor?: string } => ({
    proveedor:
      typeof search.proveedor === "string" ? search.proveedor : undefined,
  }),
  head: () => ({ meta: [{ title: "Compras · Nuevo comercio" }] }),
  component: lazyRouteComponent(
    () => import("./-pages/compras"),
    "ComprasPage",
  ),
});
