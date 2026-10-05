import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/configuracion")({
  head: () => ({ meta: [{ title: "Configuración · Nuevo comercio" }] }),
  component: lazyRouteComponent(
    () => import("./-pages/configuracion"),
    "ConfigPage",
  ),
});
