import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: RootComponent,
    notFoundComponent: () => (
      <div className="p-6">
        <h1>Página no encontrada</h1>
        <Link to="/">Volver al inicio</Link>
      </div>
    ),
    errorComponent: ({ reset }) => (
      <div className="p-6">
        <p>No se pudo cargar esta página.</p>
        <button type="button" onClick={reset}>
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
      <Outlet />
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}
