import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/nueva-venta")({
  head: () => ({ meta: [{ title: "Nueva venta · Nuevo comercio" }] }),
  component: lazyRouteComponent(
    () => import("./-pages/nueva-venta"),
    "NuevaVenta",
  ),
});
