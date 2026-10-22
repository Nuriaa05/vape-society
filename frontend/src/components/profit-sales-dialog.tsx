import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatARS, formatDateAR } from "@/lib/formatters";
import { downloadCSV } from "@/lib/csv";
import {
  buildProfitSalesExportRows,
  dateRangeToReportSearch,
  formatProfitAmount,
} from "@/lib/profit-reports";
import { getReportRangeLabel } from "@/lib/report-exports";
import { profitReportsRepository } from "@/lib/repositories/profit-reports-repository";
import type { ReportDateRange } from "@/lib/repositories/reports-repository";

export function ProfitSalesDialog({
  dates,
  onClose,
}: {
  dates: ReportDateRange;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const active = useRef(true);
  const query = useQuery({
    queryKey: ["reports", "profit-sales", dates, page],
    queryFn: () => profitReportsRepository.getSales(dates, page),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const unavailable =
    !data || query.isFetching || query.isPlaceholderData || query.isError;
  const currentRequest = useRef({ dates, data, unavailable });
  useEffect(() => {
    currentRequest.current = { dates, data, unavailable };
  }, [dates, data, unavailable]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function exportSales() {
    if (unavailable || isExporting) return;
    const selectedData = data;
    const stillCurrent = () =>
      active.current &&
      !currentRequest.current.unavailable &&
      currentRequest.current.data === selectedData &&
      currentRequest.current.dates.from === dates.from &&
      currentRequest.current.dates.to === dates.to;
    setIsExporting(true);
    try {
      const result = await profitReportsRepository.getAllSales(dates);
      if (!stillCurrent()) return;
      const range = dateRangeToReportSearch(dates);
      downloadCSV(
        `ventas-ganancias-detalle-${range.desde}-${range.hasta}.csv`,
        buildProfitSalesExportRows(result.items, dates, result.summary),
      );
    } catch (error) {
      if (stillCurrent())
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          active.current = false;
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Ventas y ganancias</DialogTitle>
          <DialogDescription>
            {getReportRangeLabel(dates)} · Ventas entregadas, con sus importes y
            costos originales.
          </DialogDescription>
        </DialogHeader>
        <Button
          variant="outline"
          className="w-fit print:hidden"
          aria-label="Exportar todas las ventas del intervalo CSV"
          title="Exportar todas las ventas del intervalo CSV"
          disabled={unavailable || isExporting}
          onClick={() => void exportSales()}
        >
          <Download />
          {isExporting ? "Preparando..." : "Exportar ventas CSV"}
        </Button>
        {query.isError ? (
          <div role="alert" className="text-sm">
            No se pudieron cargar las ventas.
            <Button
              variant="outline"
              size="sm"
              className="ml-2"
              onClick={() => void query.refetch()}
            >
              Reintentar
            </Button>
          </div>
        ) : !data ? (
          <p role="status" className="text-sm text-muted-foreground">
            Cargando ventas...
          </p>
        ) : (
          <>
            <p className="text-sm">
              {data.total} ventas · Ventas:{" "}
              <strong>{formatARS(data.summary.revenue)}</strong> · Costo:{" "}
              <strong>{formatProfitAmount(data.summary.cost)}</strong> ·
              Ganancia:{" "}
              <strong>{formatProfitAmount(data.summary.profit)}</strong>
            </p>
            <p role="status" className="text-xs text-muted-foreground">
              {query.isFetching
                ? "Actualizando ventas..."
                : "Totales de todas las ventas del intervalo."}
            </p>
            <div
              className="max-h-[55vh] overflow-auto"
              aria-busy={query.isFetching}
            >
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b border-border text-left">
                  <tr>
                    {[
                      "Comprobante",
                      "Cliente",
                      "Entrega",
                      "Venta",
                      "Costo",
                      "Ganancia",
                    ].map((label) => (
                      <th key={label} className="app-table-heading font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((sale) => (
                    <tr key={sale.id} className="border-b border-border/60">
                      <td className="px-3 py-3 font-mono text-xs">
                        {sale.number}
                      </td>
                      <td className="px-3 py-3">
                        {sale.customerName || "Consumidor final"}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {formatDateAR(sale.deliveredAt)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {formatARS(sale.revenue)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {formatProfitAmount(sale.cost)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {formatProfitAmount(sale.profit)}
                      </td>
                    </tr>
                  ))}
                  {data.items.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-6 text-muted-foreground"
                      >
                        No hay ventas en esta página.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Página {page} de {Math.max(1, data.totalPages)} · {data.total}{" "}
                registros
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || query.isFetching}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages || query.isFetching}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
