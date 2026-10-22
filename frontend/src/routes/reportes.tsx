import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { parseReportSearch } from "@/lib/profit-reports";

export const Route = createFileRoute("/reportes")({
  head: () => ({ meta: [{ title: "Reportes · Nuevo comercio" }] }),
  validateSearch: parseReportSearch,
  component: lazyRouteComponent(
    () => import("./-pages/reportes"),
    "ReportesPage",
  ),
});
