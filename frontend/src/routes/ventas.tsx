import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

type DeliveryFilter = "Pendiente" | "Entregado" | "Anulada" | "all";

export const Route = createFileRoute("/ventas")({
  head: () => ({ meta: [{ title: "Ventas · Nuevo comercio" }] }),
  validateSearch: (
    s: Record<string, unknown>,
  ): { entrega?: DeliveryFilter } => {
    const e = s.entrega;
    return e === "Pendiente" ||
      e === "Entregado" ||
      e === "Anulada" ||
      e === "all"
      ? { entrega: e }
      : {};
  },
  component: lazyRouteComponent(() => import("./-pages/ventas"), "VentasPage"),
});
