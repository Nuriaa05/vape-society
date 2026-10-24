import { useEffect, useRef, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ChartNoAxesCombined,
  Coins,
  Download,
  FileSpreadsheet,
  FileText,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, KpiCard } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfitReportTable } from "@/components/profit-report-table";
import { ProfitSalesDialog } from "@/components/profit-sales-dialog";
import { ReportDateRangePicker } from "@/components/report-date-range-picker";
import { downloadCSV } from "@/lib/csv";
import { formatARS } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  buildProfitExportRows,
  buildProfitSalesExportRows,
  dateRangeToReportSearch,
  formatProfitAmount,
  profitGroupingLabels,
} from "@/lib/profit-reports";
import { getReportRangeLabel } from "@/lib/report-exports";
import {
  profitReportsRepository,
  type ProfitBucket,
  type ProfitGrouping,
  type ProfitReport,
} from "@/lib/repositories/profit-reports-repository";
import type { ReportDateRange } from "@/lib/repositories/reports-repository";

function ProfitExports({
  report,
  disabled,
}: {
  report?: ProfitReport;
  disabled: boolean;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const active = useRef(true);
  const currentReport = useRef({ report, disabled });
  useEffect(() => {
    currentReport.current = { report, disabled };
  }, [report, disabled]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const exportsDisabled = !report || disabled || isExporting;
  const range = report ? dateRangeToReportSearch(report) : {};
  const filename = `${range.desde}-${range.hasta}`;
  async function exportSales() {
    if (!report || exportsDisabled) return;
    setIsExporting(true);
    try {
      const data = await profitReportsRepository.getAllSales(report);
      if (
        active.current &&
        !currentReport.current.disabled &&
        currentReport.current.report === report
      )
        downloadCSV(
          `ventas-ganancias-${filename}.csv`,
          buildProfitSalesExportRows(data.items, report, data.summary),
        );
    } catch (error) {
      if (active.current)
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo exportar el listado completo.",
        );
    } finally {
      if (active.current) setIsExporting(false);
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="print:hidden"
          disabled={exportsDisabled}
        >
          <Download />
          {isExporting ? "Preparando..." : "Exportar"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="print:hidden">
        <DropdownMenuLabel>Ganancias del período</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={exportsDisabled}
          onClick={() => {
            if (!report || exportsDisabled) return;
            downloadCSV(
              `ganancias-${filename}-${report.groupBy}.csv`,
              buildProfitExportRows(report),
            );
          }}
        >
          <FileSpreadsheet /> Resumen y agrupaciones CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={exportsDisabled}
          onClick={() => void exportSales()}
        >
          <FileSpreadsheet /> Todas las ventas CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={exportsDisabled}
          onClick={() => {
            if (exportsDisabled) return;
            window.print();
          }}
        >
          <FileText /> Imprimir / PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProfitReportPage({
  dates,
  groupBy,
  navigation,
  onDayChange,
  onGroupingChange,
}: {
  dates: ReportDateRange;
  groupBy: ProfitGrouping;
  navigation: ReactNode;
  onDayChange: (day?: string) => void;
  onGroupingChange: (group: ProfitGrouping) => void;
}) {
  const requestKey = `${dates.from}/${dates.to}/${groupBy}`;
  const [selected, setSelected] = useState<{
    key: string;
    bucket: ProfitBucket;
  } | null>(null);
  const query = useQuery({
    queryKey: ["reports", "profit", dates, groupBy],
    queryFn: () => profitReportsRepository.getReport(dates, groupBy),
    placeholderData: keepPreviousData,
  });
  const report = query.data;
  const busy = query.isFetching || query.isPlaceholderData;
  const selection = selected?.key === requestKey ? selected.bucket : null;
  return (
    <AppShell
      title="Reportes"
      subtitle="Ventas entregadas y ganancia de los productos vendidos"
      actions={
        <>
          <ReportDateRangePicker
            mode="day"
            value={dates}
            disabled={query.isLoading}
            onChange={(range) =>
              onDayChange(dateRangeToReportSearch(range).desde)
            }
          />
          <ProfitExports
            key={requestKey}
            report={report}
            disabled={busy || query.isError}
          />
        </>
      }
    >
      {navigation}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="app-card-title font-semibold">Ganancias</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {getReportRangeLabel(dates)}
          </p>
        </div>
        <div
          role="group"
          aria-label="Período de ganancias"
          className="inline-flex max-w-full flex-wrap rounded-md border border-border bg-muted/40 p-0.5 print:hidden"
        >
          {(["day", "tenDays", "month"] as const).map((group) => (
            <button
              key={group}
              type="button"
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded transition-colors",
                groupBy === group
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={groupBy === group}
              onClick={() => onGroupingChange(group)}
            >
              {profitGroupingLabels[group]}
            </button>
          ))}
        </div>
        <p className="hidden print:block text-sm">
          Agrupación: {profitGroupingLabels[groupBy]}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Importes correspondientes a todas las ventas entregadas del período.
      </p>
      <p
        role="status"
        className={busy ? "text-xs text-muted-foreground" : "sr-only"}
      >
        {busy ? "Actualizando ganancias..." : "Ganancias actualizadas."}
      </p>
      {query.isError ? (
        <Card className="app-card-body text-sm" role="alert">
          No se pudieron cargar las ganancias.
          <p className="mt-1 text-muted-foreground">
            {query.error instanceof Error
              ? query.error.message
              : "Volvé a intentarlo."}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-fit"
            onClick={() => void query.refetch()}
          >
            Reintentar
          </Button>
        </Card>
      ) : !report ? (
        <Card className="app-card-body text-sm text-muted-foreground">
          Cargando ganancias...
        </Card>
      ) : (
        <>
          <div
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy={busy}
          >
            <KpiCard
              label="Ventas entregadas del período"
              value={formatARS(report.summary.revenue)}
              icon={
                <Wallet className="size-4 text-accent" aria-hidden="true" />
              }
            />
            <KpiCard
              label="Costo de productos vendidos"
              value={formatProfitAmount(report.summary.cost)}
              icon={
                <Coins
                  className="size-4 text-warning-foreground"
                  aria-hidden="true"
                />
              }
            />
            <KpiCard
              className={
                report.summary.profit !== null && report.summary.profit < 0
                  ? "[&_.app-metric-value]:text-destructive"
                  : undefined
              }
              label="Ganancia del período"
              value={formatProfitAmount(report.summary.profit)}
              icon={
                <ChartNoAxesCombined
                  className="size-4 text-success"
                  aria-hidden="true"
                />
              }
            />
          </div>
          {report.summary.missingCostSalesCount > 0 && (
            <p className="text-sm text-muted-foreground">
              No se pudo verificar el historial de costo de{" "}
              {report.summary.missingCostSalesCount}{" "}
              {report.summary.missingCostSalesCount === 1 ? "venta" : "ventas"}.
              Los períodos afectados muestran “No disponible”.
            </p>
          )}
          <ProfitReportTable
            key={requestKey}
            report={report}
            disabled={busy}
            onSelect={(bucket) => setSelected({ key: requestKey, bucket })}
          />
        </>
      )}
      {selection && (
        <ProfitSalesDialog
          key={`${selection.from}/${selection.to}`}
          dates={selection}
          onClose={() => setSelected(null)}
        />
      )}
    </AppShell>
  );
}
