import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/proveedores")({
  head: () => ({ meta: [{ title: "Proveedores · Nuevo comercio" }] }),
  component: lazyRouteComponent(
    () => import("./-pages/proveedores"),
    "ProveedoresPage",
  ),
});
