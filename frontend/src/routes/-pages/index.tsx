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
import {
  ArrowUpRight,
  Clock,
  ScanBarcode,
  Truck,
  TrendingUp,
  Wallet,
  AlertTriangle,
  Boxes,
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
        <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">
          Cargando datos...
        </div>
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
        <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">
          No se pudo cargar el dashboard.
        </div>
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
        <div className="dashboard-kpis grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            icon={<Wallet className="h-4 w-4" />}
            label="Ventas de hoy"
            value={formatARS(summary.todayTotal)}
            hint={`${summary.confirmedSalesCount} operaciones`}
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Ventas del mes"
            value={formatARS(summary.monthlyTotal)}
            hint={formatMonthYearAR()}
          />
          <KpiCard
            icon={<Boxes className="h-4 w-4" />}
            label="Valor de stock"
            value={formatARS(summary.stockValue)}
            hint={`${summary.productCount} productos`}
          />
          <KpiCard
            icon={<Clock className="h-4 w-4" />}
            label="Entregas pendientes"
            value={String(summary.pendingDeliveries.length)}
            hint={
              summary.pendingDeliveries.length > 0
                ? `${formatARS(summary.pendingDeliveriesTotal)} a entregar`
                : "Todo entregado"
            }
            tone={summary.pendingDeliveries.length > 0 ? "warning" : undefined}
          />
        </div>

        <div className="dashboard-grid grid grid-cols-1 items-start lg:grid-cols-3 gap-4 mt-6">
          <div className="dashboard-chart min-w-0 lg:col-span-2">
            <DashboardUnitsChart />
          </div>

          <div className="dashboard-aside min-w-0 grid gap-4 lg:col-start-3 lg:row-span-2">
            <Card>
              <CardHeader
                title="Entregas pendientes"
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/ventas" search={{ entrega: "Pendiente" }}>
                      Ver pendientes
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

            <Card>
              <CardHeader
                title="Alertas de stock"
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/stock">Ver stock</Link>
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
          </div>

          <Card className="dashboard-sales min-w-0 lg:col-span-2">
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
                    <th className="px-5 py-2.5 font-medium">Comprobante</th>
                    <th className="px-5 py-2.5 font-medium">Hora</th>
                    <th className="px-5 py-2.5 font-medium">Pago</th>
                    <th className="px-5 py-2.5 font-medium">Entrega</th>
                    <th className="px-5 py-2.5 font-medium text-right">
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

        {summary.pendingDeliveries.length > 0 && (
          <div className="dashboard-delivery-notice mt-6 rounded-lg border border-warning/30 bg-warning/10 px-5 py-3 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-warning-foreground shrink-0" />
            <div className="text-sm text-foreground flex-1">
              Tenés <strong>{summary.pendingDeliveries.length}</strong>{" "}
              {summary.pendingDeliveries.length === 1
                ? "venta pendiente de entrega"
                : "ventas pendientes de entrega"}
              . El stock está reservado hasta despacharlas.
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/ventas" search={{ entrega: "Pendiente" }}>
                Ver pendientes
              </Link>
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <div className="dashboard-kpi bg-card border border-border rounded-lg px-[18px] py-4">
      <div className="flex items-center justify-between gap-2 text-foreground">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={
            tone === "warning"
              ? "text-warning-foreground"
              : "text-muted-foreground"
          }
        >
          {icon}
        </span>
      </div>
      <div className="dashboard-kpi-value mt-[18px] break-words text-2xl font-semibold text-foreground tracking-tight tabular-nums">
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`dashboard-card overflow-hidden bg-card border border-border rounded-lg ${className}`}
    >
      {children}
    </div>
  );
}
function CardHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="dashboard-card-header flex flex-wrap items-center justify-between gap-2 px-5 py-4">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {action}
    </div>
  );
}
