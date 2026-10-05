import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/reportes")({
  head: () => ({ meta: [{ title: "Reportes · Nuevo comercio" }] }),
  component: lazyRouteComponent(
    () => import("./-pages/reportes"),
    "ReportesPage",
  ),
});
