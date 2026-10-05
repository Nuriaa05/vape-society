import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/stock")({
  head: () => ({ meta: [{ title: "Stock · Nuevo comercio" }] }),
  component: lazyRouteComponent(() => import("./-pages/stock"), "StockPage"),
});
