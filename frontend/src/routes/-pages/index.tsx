import { Card, CardHeader, KpiCard } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, StatusBadge } from "@/components/app-shell";
import { DashboardUnitsChart } from "@/components/dashboard-units-chart";
import { Button } from "@/components/ui/button";
import {
  formatARS,
  formatDateTimeAR,
  formatMonthYearAR,
  formatTimeAR,
} from "@/lib/formatters";
import { reportsRepository, stockRepository } from "@/lib/repositories";
import { DASHBOARD_PREVIEW_LIMIT, getVisibleItems } from "@/lib/visible-items";
import { getTodayProfitReportSearch } from "@/lib/profit-reports";
import {
  ArrowUpRight,
  ScanBarcode,
  Truck,
  TrendingUp,
  Wallet,
  ChartNoAxesCombined,
} from "lucide-react";

export function Dashboard() {
  const {
    data: summary,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => reportsRepository.getDashboardSummary(),
  });

  if (isLoading) {
    return (
      <AppShell
        className="dashboard-shell"
        title="Dashboard"
        subtitle="Resumen general del día y estado del inventario"
      >
        <Card className="app-card-body text-sm text-muted-foreground">
          Cargando datos...
        </Card>
      </AppShell>
    );
  }

  if (error || !summary) {
    return (
      <AppShell
        className="dashboard-shell"
        title="Dashboard"
        subtitle="Resumen general del día y estado del inventario"
      >
        <Card className="app-card-body text-sm text-destructive">
          No se pudo cargar el dashboard.
        </Card>
      </AppShell>
    );
  }

  const recentSalesPreview = getVisibleItems(
    summary.recentSales,
    DASHBOARD_PREVIEW_LIMIT,
  );
  const pendingDeliveriesPreview = getVisibleItems(
    summary.pendingDeliveries,
    DASHBOARD_PREVIEW_LIMIT,
  );
  const stockAlertsPreview = getVisibleItems(
    summary.stockAlerts,
    DASHBOARD_PREVIEW_LIMIT,
  );

  return (
    <AppShell
      className="dashboard-shell"
      title="Dashboard"
      subtitle="Resumen general del día y estado del inventario"
      actions={
        <>
          <Button asChild variant="outline">
            <Link to="/compras">
              <Truck /> Registrar compra
            </Link>
          </Button>
          <Button asChild>
            <Link to="/nueva-venta">
              <ScanBarcode /> Nueva venta
            </Link>
          </Button>
        </>
      }
    >
      <div className="dashboard-layout">
        <div className="dashboard-kpis grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <KpiCard
            icon={<Wallet className="size-4 text-accent" aria-hidden="true" />}
            label="Ventas de hoy"
            value={formatARS(summary.todayTotal)}
            hint={`${summary.confirmedSalesCount} operaciones`}
          />
          <KpiCard
            icon={
              <ChartNoAxesCombined
                className="size-4 text-success"
                aria-hidden="true"
              />
            }
            label="Ganancia de hoy"
            value={
              summary.todayProfit?.profit != null
                ? formatARS(summary.todayProfit.profit)
                : "No disponible"
            }
            hint={
              <div className="space-y-1">
                <p>
                  {summary.todayProfit?.missingCostSalesCount
                    ? `${summary.todayProfit.missingCostSalesCount} ${summary.todayProfit.missingCostSalesCount === 1 ? "venta sin costo histórico completo" : "ventas sin costo histórico completo"}`
                    : "Ventas entregadas menos costo"}
                </p>
                <Link
                  to="/reportes"
                  search={getTodayProfitReportSearch()}
                  className="inline-flex items-center gap-1 text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Ver reportes{" "}
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                </Link>
              </div>
            }
          />
          <KpiCard
            icon={
              <TrendingUp className="size-4 text-success" aria-hidden="true" />
            }
            label="Ventas del mes"
            value={formatARS(summary.monthlyTotal)}
            hint={formatMonthYearAR()}
          />
        </div>

        <div className="dashboard-grid grid grid-cols-1 items-start lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 mt-6">
          <div className="dashboard-chart min-w-0">
            <DashboardUnitsChart />
          </div>

          <Card className="dashboard-card dashboard-pending overflow-hidden lg:col-start-2 lg:row-start-1">
            <CardHeader
              title="Entregas pendientes"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/ventas" search={{ entrega: "Pendiente" }}>
                    Ver pendientes <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </Button>
              }
            />
            {summary.pendingDeliveries.length === 0 ? (
              <div className="dashboard-empty px-5 py-8 text-center text-sm text-muted-foreground">
                No hay entregas pendientes.
              </div>
            ) : (
              <ul className="dashboard-list divide-y divide-border">
                {pendingDeliveriesPreview.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between px-5 py-3 gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium font-mono truncate">
                        {s.number}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTimeAR(s.date)} · {formatARS(s.total)}
                      </div>
                    </div>
                    <StatusBadge tone="warning">Pendiente</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="dashboard-card dashboard-alerts overflow-hidden lg:col-start-2 lg:row-start-2">
            <CardHeader
              title="Alertas de stock"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/stock">
                    Ver stock <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </Button>
              }
            />
            <ul className="dashboard-list divide-y divide-border">
              {stockAlertsPreview.map((p) => {
                const st = stockRepository.getStatus(p);
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {p.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Stock: {p.stock} · mínimo {p.minStock}
                      </div>
                    </div>
                    <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                  </li>
                );
              })}
              {summary.stockAlerts.length === 0 && (
                <li className="px-5 py-6 text-sm text-muted-foreground text-center">
                  Sin alertas.
                </li>
              )}
            </ul>
          </Card>
          <Card className="dashboard-card dashboard-sales overflow-hidden lg:col-start-1 lg:row-start-2">
            <CardHeader
              title="Ventas recientes"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/ventas">
                    Ver ventas <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </Button>
              }
            />
            <div className="dashboard-sales-body overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-sm text-foreground border-b border-border">
                  <tr>
                    <th className="app-table-heading font-medium">
                      Comprobante
                    </th>
                    <th className="app-table-heading font-medium">Hora</th>
                    <th className="app-table-heading font-medium">Pago</th>
                    <th className="app-table-heading font-medium">Entrega</th>
                    <th className="app-table-heading font-medium text-right">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentSalesPreview.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-5 py-3 font-mono text-xs text-foreground">
                        {s.number}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {formatTimeAR(s.date)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge tone="muted">{s.payment}</StatusBadge>
                      </td>
                      <td className="px-5 py-3">
                        {s.status === "Anulada" ? (
                          <StatusBadge tone="destructive">Anulada</StatusBadge>
                        ) : s.delivery === "Pendiente" ? (
                          <StatusBadge tone="warning">Pendiente</StatusBadge>
                        ) : (
                          <StatusBadge tone="success">Entregado</StatusBadge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-medium">
                        {formatARS(s.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
