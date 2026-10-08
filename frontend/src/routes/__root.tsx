import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { SaleDraftProvider } from "@/components/sale-draft-provider";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: RootComponent,
    notFoundComponent: () => (
      <div className="p-6">
        <h1>Página no encontrada</h1>
        <Link to="/">Volver al inicio</Link>
      </div>
    ),
    errorComponent: ({ error, reset }) => (
      <div className="p-6">
        <p>No se pudo cargar esta página.</p>
        <button
          type="button"
          onClick={() => {
            if (
              /^(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed)/.test(
                error.message,
              )
            ) {
              window.location.reload();
            } else {
              reset();
            }
          }}
        >
          Reintentar
        </button>
      </div>
    ),
  },
);

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <SaleDraftProvider>
        <Outlet />
      </SaleDraftProvider>
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}
