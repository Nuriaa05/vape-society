import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/compras")({
  head: () => ({ meta: [{ title: "Compras · Nuevo comercio" }] }),
  component: lazyRouteComponent(
    () => import("./-pages/compras"),
    "ComprasPage",
  ),
});
