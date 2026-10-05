import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/historial")({
  head: () => ({ meta: [{ title: "Historial · Nuevo comercio" }] }),
  component: lazyRouteComponent(
    () => import("./-pages/historial"),
    "HistorialPage",
  ),
});
