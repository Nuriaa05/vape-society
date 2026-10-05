import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Nuevo comercio" },
      {
        name: "description",
        content:
          "Panel de gestión interna para tienda de productos congelados.",
      },
    ],
  }),
  component: lazyRouteComponent(() => import("./-pages/index"), "Dashboard"),
});
