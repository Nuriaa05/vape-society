import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/clientes-cobranzas")({
  head: () => ({ meta: [{ title: "Cobranzas · Nuevo comercio" }] }),
  component: lazyRouteComponent(
    () => import("./-pages/clientes-cobranzas"),
    "ClientesCobranzasPage",
  ),
});
