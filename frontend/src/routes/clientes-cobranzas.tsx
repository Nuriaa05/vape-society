import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/clientes-cobranzas")({
  head: () => ({ meta: [{ title: "Clientes y cobranzas · Nuevo comercio" }] }),
  component: lazyRouteComponent(
    () => import("./-pages/clientes-cobranzas"),
    "ClientesCobranzasPage",
  ),
});
