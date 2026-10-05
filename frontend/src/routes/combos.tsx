import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/combos")({
  head: () => ({
    meta: [{ title: "Combos · Nuevo comercio" }],
  }),
  component: lazyRouteComponent(() => import("./-pages/combos"), "CombosPage"),
});
