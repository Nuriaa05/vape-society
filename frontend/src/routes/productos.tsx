import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/productos")({
  head: () => ({ meta: [{ title: "Productos · Nuevo comercio" }] }),
  component: lazyRouteComponent(
    () => import("./-pages/productos"),
    "ProductosPage",
  ),
});
