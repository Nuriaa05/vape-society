import { Card, CardToolbar, KpiCard, CardFooter } from "@/components/ui/card";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatARS, formatDateTimeAR } from "@/lib/formatters";
import {
  buildConsumptionExportRows,
  buildTopProductsExportRows,
  getReportRangeLabel,
  getTopProductsSortLabel,
} from "@/lib/report-exports";
import {
  reportsRepository,
  type ReportPoint,
  type ReportRange,
  type ReportsPeriod,
  type TopProductsSort,
} from "@/lib/repositories";
import {
  canShowLess,
  canShowMore,
  getNextVisibleCount,
  getVisibleItems,
  REPORT_PREVIEW_INCREMENT,
} from "@/lib/visible-items";
import { Download, FileSpreadsheet, FileText, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const reportRangeOptions: Array<{ id: ReportRange; label: string }> = [
  { id: "all", label: "Todo el tiempo" },
  { id: "30d", label: "30 días" },
  { id: "90d", label: "90 días" },
  { id: "year", label: "12 meses" },
];

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ReportesPage() {
  const [period, setPeriod] = useState<ReportsPeriod>("hour");
  const [reportRange, setReportRange] = useState<ReportRange>("all");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [rankingSort, setRankingSort] = useState<TopProductsSort>("quantity");
  const [detailScope, setDetailScope] = useState<"bucket" | "all">("bucket");
  const [isExportingSales, setIsExportingSales] = useState(false);
  const [visibleBestSellingCount, setVisibleBestSellingCount] = useState(
    REPORT_PREVIEW_INCREMENT,
  );
  const [visibleConsumptionCount, setVisibleConsumptionCount] = useState(
    REPORT_PREVIEW_INCREMENT,
  );
  const periodOptions = useMemo(() => reportsRepository.getPeriodOptions(), []);
  const commercialSummaryQuery = useQuery({
    queryKey: ["reports", "commercial"],
    queryFn: () => reportsRepository.getCommercialSummary(),
  });
  const salesDatasetQuery = useQuery({
    queryKey: ["reports", "sales-series", period],
    queryFn: () => reportsRepository.getSalesDataset(period),
    placeholderData: keepPreviousData,
  });
  const bestSellingQuery = useQuery({
    queryKey: ["reports", "top-products", reportRange, rankingSort],
    queryFn: () =>
      reportsRepository.getBestSellingProducts({
        range: reportRange,
        sort: rankingSort,
      }),
    placeholderData: keepPreviousData,
  });
  const productConsumptionQuery = useQuery({
    queryKey: ["reports", "product-consumption", reportRange],
    queryFn: () => reportsRepository.getProductConsumption(reportRange),
    placeholderData: keepPreviousData,
  });
  const paymentBreakdownQuery = useQuery({
    queryKey: ["reports", "payment-methods"],
    queryFn: () => reportsRepository.getPaymentBreakdown(),
  });

  const data = useMemo(
    () => salesDatasetQuery.data ?? [],
    [salesDatasetQuery.data],
  );
  const meta = reportsRepository.getPeriodMeta(period);
  const total = useMemo(() => data.reduce((s, d) => s + d.v, 0), [data]);
  const avg = data.length > 0 ? Math.round(total / data.length) : 0;
  const max = data.length > 0 ? Math.max(...data.map((d) => d.v)) : 0;

  const selected = selectedIdx !== null ? data[selectedIdx] : null;
  const detailProductsQuery = useQuery({
    queryKey: [
      "reports",
      "top-products",
      "detail",
      detailScope,
      selected?.from,
      selected?.to,
      rankingSort,
    ],
    queryFn: () => {
      if (detailScope === "all") {
        return reportsRepository.getBestSellingProducts({
          range: "all",
          sort: rankingSort,
        });
      }
      if (!selected) return Promise.resolve([]);

      return reportsRepository.getBestSellingProducts({
        from: selected.from,
        to: selected.to,
        sort: rankingSort,
      });
    },
    enabled: selected !== null,
  });
  const detailProducts = detailProductsQuery.data ?? [];
  const detailUnits = detailProducts.reduce((sum, item) => sum + item.qty, 0);
  const detailRevenue = detailProducts.reduce(
    (sum, item) => sum + item.total,
    0,
  );
  const bestSelling = useMemo(
    () => bestSellingQuery.data ?? [],
    [bestSellingQuery.data],
  );
  const visibleBestSelling = useMemo(
    () => getVisibleItems(bestSelling, visibleBestSellingCount),
    [bestSelling, visibleBestSellingCount],
  );
  const productConsumption = useMemo(
    () => productConsumptionQuery.data ?? [],
    [productConsumptionQuery.data],
  );
  const visibleConsumption = useMemo(
    () => getVisibleItems(productConsumption, visibleConsumptionCount),
    [productConsumption, visibleConsumptionCount],
  );
  const soldItemQty = bestSelling.reduce((sum, item) => sum + item.qty, 0);
  const consumedProductQty = productConsumption.reduce(
    (sum, item) => sum + item.totalQty,
    0,
  );
  const byPayment = paymentBreakdownQuery.data ?? [];
  const commercialSummary = commercialSummaryQuery.data;
  const isLoading =
    commercialSummaryQuery.isLoading ||
    salesDatasetQuery.isLoading ||
    bestSellingQuery.isLoading ||
    productConsumptionQuery.isLoading ||
    paymentBreakdownQuery.isLoading;
  const hasError =
    commercialSummaryQuery.error ||
    salesDatasetQuery.error ||
    bestSellingQuery.error ||
    productConsumptionQuery.error ||
    paymentBreakdownQuery.error;

  useEffect(() => {
    setVisibleBestSellingCount(REPORT_PREVIEW_INCREMENT);
  }, [reportRange, rankingSort]);

  useEffect(() => {
    setVisibleConsumptionCount(REPORT_PREVIEW_INCREMENT);
  }, [reportRange]);

  const handleSelectPeriod = (id: ReportsPeriod) => {
    setPeriod(id);
    setSelectedIdx(null);
    setDetailScope("bucket");
  };

  const handleSelectBar = (i: number) => {
    if (selectedIdx === i) {
      setSelectedIdx(null);
      return;
    }

    setSelectedIdx(i);
    setDetailScope("bucket");
  };

  const exportPeriodCSV = () => {
    const rows: string[][] = [
      ["Periodo", meta.title],
      ["Bucket", "Total ARS"],
    ];
    data.forEach((d) => rows.push([d.fullLabel, String(d.v)]));
    rows.push(["", ""], ["Total", String(total)], ["Promedio", String(avg)]);
    downloadCSV(`reporte-${period}.csv`, rows);
  };

  const exportTopProductsCSV = () => {
    const rows = [
      ["Rango", getReportRangeLabel(reportRange)],
      ["Criterio", getTopProductsSortLabel(rankingSort)],
      [],
      ...buildTopProductsExportRows(bestSelling),
    ];
    downloadCSV(`productos-vendidos-${reportRange}-${rankingSort}.csv`, rows);
  };

  const exportConsumptionCSV = () => {
    const rows = [
      ["Rango", getReportRangeLabel(reportRange)],
      [],
      ...buildConsumptionExportRows(productConsumption),
    ];
    downloadCSV(`consumo-productos-${reportRange}.csv`, rows);
  };

  const exportSalesCSV = async () => {
    if (isExportingSales) return;

    setIsExportingSales(true);
    try {
      const sales = await reportsRepository.getSalesExport(reportRange);
      const rows: string[][] = [
        ["Rango", getReportRangeLabel(reportRange)],
        [],
        ["Comprobante", "Fecha", "Ítems", "Total ARS", "Pago", "Entrega"],
      ];
      sales.forEach((sale) =>
        rows.push([
          sale.number,
          formatDateTimeAR(sale.date),
          sale.items.map((item) => `${item.qty}x ${item.name}`).join(" | "),
          String(sale.total),
          sale.payment,
          sale.delivery,
        ]),
      );
      downloadCSV(`ventas-${reportRange}.csv`, rows);
    } catch {
      toast.error("No se pudo exportar el listado completo de ventas.");
    } finally {
      setIsExportingSales(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell title="Reportes" subtitle="Análisis comercial e indicadores">
        <Card className="app-card-body text-sm text-muted-foreground">
          Cargando reportes...
        </Card>
      </AppShell>
    );
  }

  if (hasError || !commercialSummary) {
    return (
      <AppShell title="Reportes" subtitle="Análisis comercial e indicadores">
        <Card className="app-card-body text-sm text-destructive">
          No se pudieron cargar los reportes.
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Reportes"
      subtitle="Análisis comercial e indicadores"
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Download /> Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Exportar a CSV</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={salesDatasetQuery.isFetching}
              onClick={exportPeriodCSV}
            >
              <FileSpreadsheet /> Período actual ({meta.title})
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={bestSellingQuery.isFetching}
              onClick={exportTopProductsCSV}
            >
              <FileSpreadsheet /> Productos vendidos (
              {getReportRangeLabel(reportRange)})
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={productConsumptionQuery.isFetching}
              onClick={exportConsumptionCSV}
            >
              <FileSpreadsheet /> Consumo por producto
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isExportingSales}
              onClick={() => void exportSalesCSV()}
            >
              <FileSpreadsheet />
              {isExportingSales
                ? "Preparando ventas..."
                : "Listado completo de ventas"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.print()}>
              <FileText /> Imprimir / PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard
          label="Ventas hoy"
          value={formatARS(commercialSummary.dailyTotal)}
        />
        <KpiCard
          label="Ventas del mes"
          value={formatARS(commercialSummary.monthlyTotal)}
        />
        <KpiCard
          label="Compras del mes"
          value={formatARS(commercialSummary.monthlyPurchases)}
        />
        <KpiCard
          label="Ventas menos compras"
          value={formatARS(commercialSummary.salesPurchasesDifference)}
          accent
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <KpiCard
          label="Ventas entregadas"
          value={String(commercialSummary.deliveredSalesCount)}
        />
        <KpiCard
          label="Ventas pendientes"
          value={String(commercialSummary.pendingSalesCount)}
        />
        <KpiCard
          label="Total pendiente"
          value={formatARS(commercialSummary.pendingSalesTotal)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5">
        <Card
          className="bg-sidebar border-sidebar-border app-card-body"
          aria-busy={salesDatasetQuery.isFetching}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold app-card-title">{meta.title}</h2>
              <div className="text-xs text-muted-foreground">
                {salesDatasetQuery.isFetching ? (
                  <span role="status">Actualizando datos...</span>
                ) : (
                  meta.subtitle
                )}
              </div>
            </div>
            <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
              {periodOptions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={period === o.id}
                  onClick={() => handleSelectPeriod(o.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded transition-colors",
                    period === o.id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <Mini label="Total" value={formatARS(total)} />
            <Mini label="Promedio" value={formatARS(avg)} />
            <Mini label="Pico" value={formatARS(max)} />
          </div>

          <div className="h-64 overflow-x-auto">
            <BarChart
              data={data}
              max={max}
              selectedIdx={selectedIdx}
              onSelect={handleSelectBar}
            />
          </div>

          {selected && (
            <div className="mt-5 border border-border rounded-lg bg-muted/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Detalle
                  </div>
                  <div className="text-sm font-semibold">
                    {detailScope === "all"
                      ? "Todo el tiempo"
                      : selected.fullLabel}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {detailUnits} unidades · Total vendido:{" "}
                    <span className="text-foreground font-medium tabular-nums">
                      {formatARS(
                        detailScope === "all" ? detailRevenue : selected.v,
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <RankingSortControl
                    value={rankingSort}
                    onChange={setRankingSort}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDetailScope((current) =>
                        current === "all" ? "bucket" : "all",
                      )
                    }
                  >
                    {detailScope === "all"
                      ? "Ver período seleccionado"
                      : "Ver todo el tiempo"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setSelectedIdx(null)}
                    className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"
                    aria-label="Cerrar detalle"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {detailProductsQuery.isLoading && (
                <div className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
                  Cargando detalle...
                </div>
              )}
              {detailProductsQuery.isError && (
                <div className="rounded-md border border-border bg-card p-3 text-sm text-destructive">
                  No se pudo cargar el detalle de este período.
                </div>
              )}
              {!detailProductsQuery.isLoading &&
                !detailProductsQuery.isError &&
                detailProducts.length === 0 && (
                  <div className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
                    No hay productos vendidos en este período.
                  </div>
                )}
              {detailProducts.length > 0 && (
                <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-card">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="sticky top-0 bg-card text-left text-sm text-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">
                          Producto o combo
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Unidades
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailProducts.map((item) => (
                        <tr
                          key={`${item.itemType ?? "Product"}:${item.name}`}
                          className="border-t border-border/60"
                        >
                          <td className="px-3 py-2.5">
                            <div className="font-medium">{item.name}</div>
                            {item.itemType === "Combo" &&
                              !!item.components?.length && (
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  {item.components
                                    .map(
                                      (component) =>
                                        `${component.qty}x ${component.productName}`,
                                    )
                                    .join(" + ")}
                                </div>
                              )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {item.qty}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                            {formatARS(item.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!selected && (
            <div className="mt-3 text-[11px] text-muted-foreground">
              Hacé clic en una barra para ver el detalle.
            </div>
          )}
        </Card>

        <Card className="app-card-body">
          <h2 className="font-semibold mb-1 app-card-title">
            Ventas por método de pago
          </h2>
          <div className="text-xs text-muted-foreground mb-4">
            Todo el tiempo
          </div>
          <div className="flex h-3 rounded-full overflow-hidden">
            {byPayment.map((p) => (
              <div
                key={p.label}
                className={p.color}
                style={{ width: `${p.pct}%` }}
              />
            ))}
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {byPayment.map((p) => (
              <li key={p.label} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-sm ${p.color}`} />
                  {p.label}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {p.pct}%
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card aria-busy={bestSellingQuery.isFetching}>
        <CardToolbar className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold app-card-title">
              Productos y combos vendidos
            </h2>
            <div className="text-xs text-muted-foreground mt-0.5">
              {getReportRangeLabel(reportRange)} ·{" "}
              {getTopProductsSortLabel(rankingSort)} ·{" "}
              {bestSellingQuery.isFetching ? (
                <span role="status">Actualizando datos...</span>
              ) : (
                `${soldItemQty} unidades`
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
              {reportRangeOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={reportRange === option.id}
                  onClick={() => setReportRange(option.id)}
                  className={cn(
                    "rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
                    reportRange === option.id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <RankingSortControl value={rankingSort} onChange={setRankingSort} />
            <Button
              variant="outline"
              size="sm"
              disabled={bestSellingQuery.isFetching}
              onClick={exportTopProductsCSV}
            >
              <Download /> Exportar
            </Button>
          </div>
        </CardToolbar>
        <div className="max-h-[640px] overflow-auto overscroll-x-contain print:max-h-none print:overflow-visible">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="sticky top-0 z-10 text-left text-sm text-foreground border-b border-border bg-card print:static">
              <tr>
                <th className="app-table-heading font-medium">
                  Producto o combo
                </th>
                <th className="app-table-heading font-medium text-right">
                  Unidades
                </th>
                <th className="app-table-heading font-medium text-right">
                  Total facturado
                </th>
                <th className="app-table-heading font-medium w-40">
                  Participación
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleBestSelling.map((item) => {
                const maxRankingValue =
                  rankingSort === "quantity"
                    ? (bestSelling[0]?.qty ?? 0)
                    : (bestSelling[0]?.total ?? 0);
                const itemRankingValue =
                  rankingSort === "quantity" ? item.qty : item.total;
                return (
                  <tr
                    key={`${item.itemType ?? "Product"}:${item.name}`}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 font-medium">
                        <span>{item.name}</span>
                        {item.itemType === "Combo" && (
                          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                            Combo
                          </span>
                        )}
                      </div>
                      {item.itemType === "Combo" &&
                        !!item.components?.length && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.components
                              .map(
                                (component) =>
                                  `${component.qty}x ${component.productName}`,
                              )
                              .join(" + ")}
                          </div>
                        )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {item.qty}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium">
                      {formatARS(item.total)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-brand"
                          style={{
                            width: `${maxRankingValue > 0 ? (itemRankingValue / maxRankingValue) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleBestSelling.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-8 text-center text-muted-foreground"
                  >
                    No hay ventas confirmadas en este rango.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ReportProgressiveControls
          visibleCount={visibleBestSellingCount}
          total={bestSelling.length}
          onMore={() =>
            setVisibleBestSellingCount((current) =>
              getNextVisibleCount(
                current,
                REPORT_PREVIEW_INCREMENT,
                bestSelling.length,
              ),
            )
          }
          onLess={() => setVisibleBestSellingCount(REPORT_PREVIEW_INCREMENT)}
        />
      </Card>

      <Card aria-busy={productConsumptionQuery.isFetching}>
        <CardToolbar className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold app-card-title">
              Consumo por producto
            </h2>
            <div className="text-xs text-muted-foreground mt-0.5">
              {getReportRangeLabel(reportRange)} ·{" "}
              {productConsumptionQuery.isFetching ? (
                <span role="status">Actualizando datos...</span>
              ) : (
                `${consumedProductQty} unidades comprometidas`
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={productConsumptionQuery.isFetching}
            onClick={exportConsumptionCSV}
          >
            <Download /> Exportar
          </Button>
        </CardToolbar>
        <div className="max-h-[640px] overflow-auto overscroll-x-contain print:max-h-none print:overflow-visible">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10 text-left text-sm text-foreground border-b border-border bg-card print:static">
              <tr>
                <th className="app-table-heading font-medium">Producto</th>
                <th className="app-table-heading font-medium text-right">
                  Directa
                </th>
                <th className="app-table-heading font-medium text-right">
                  En combos
                </th>
                <th className="app-table-heading font-medium text-right">
                  Entregado
                </th>
                <th className="app-table-heading font-medium text-right">
                  Reservado
                </th>
                <th className="app-table-heading font-medium text-right">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleConsumption.map((item) => (
                <tr
                  key={item.productId}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-5 py-3 font-medium">{item.name}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {item.directQty}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {item.comboQty}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {item.deliveredQty}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {item.reservedQty}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold">
                    {item.totalQty}
                  </td>
                </tr>
              ))}
              {visibleConsumption.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-center text-muted-foreground"
                  >
                    No hay consumo registrado en este rango.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ReportProgressiveControls
          visibleCount={visibleConsumptionCount}
          total={productConsumption.length}
          onMore={() =>
            setVisibleConsumptionCount((current) =>
              getNextVisibleCount(
                current,
                REPORT_PREVIEW_INCREMENT,
                productConsumption.length,
              ),
            )
          }
          onLess={() => setVisibleConsumptionCount(REPORT_PREVIEW_INCREMENT)}
        />
      </Card>

      <div className="text-xs text-muted-foreground">
        Catálogo activo: {commercialSummary.productCount} productos ·
        Comprobantes internos · No incluye facturación fiscal.
      </div>
    </AppShell>
  );
}

function RankingSortControl({
  value,
  onChange,
}: {
  value: TopProductsSort;
  onChange: (value: TopProductsSort) => void;
}) {
  const options: Array<{ value: TopProductsSort; label: string }> = [
    { value: "quantity", label: "Más vendidos" },
    { value: "revenue", label: "Más ingresos" },
  ];

  return (
    <div
      className="inline-flex rounded-md border border-border bg-muted/40 p-0.5"
      aria-label="Criterio del ranking"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
            value === option.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ReportProgressiveControls({
  visibleCount,
  total,
  onMore,
  onLess,
}: {
  visibleCount: number;
  total: number;
  onMore: () => void;
  onLess: () => void;
}) {
  const showMore = canShowMore(visibleCount, total);
  const showLess = canShowLess(visibleCount, REPORT_PREVIEW_INCREMENT, total);

  if (!showMore && !showLess) return null;

  return (
    <CardFooter className="flex justify-center gap-2">
      {showMore && (
        <Button type="button" variant="outline" size="sm" onClick={onMore}>
          Ver más
        </Button>
      )}
      {showLess && (
        <Button type="button" variant="outline" size="sm" onClick={onLess}>
          Ver menos
        </Button>
      )}
    </CardFooter>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/40 border border-border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="break-words text-sm font-semibold tabular-nums mt-0.5">
        {value}
      </div>
    </div>
  );
}

const compactARS = (n: number) => {
  if (n >= 1_000_000)
    return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
};

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function YAxis({ max }: { max: number }) {
  const ticks = [max, max * 0.75, max * 0.5, max * 0.25, 0];
  return (
    <div className="w-12 shrink-0 flex flex-col justify-between text-right pr-2 text-[10px] text-muted-foreground tabular-nums">
      {ticks.map((t, i) => (
        <span key={i}>{compactARS(t)}</span>
      ))}
    </div>
  );
}

function BarChart({
  data,
  max,
  selectedIdx,
  onSelect,
}: {
  data: ReportPoint[];
  max: number;
  selectedIdx: number | null;
  onSelect: (i: number) => void;
}) {
  const niceM = niceMax(max);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const activeIdx = hoverIdx ?? selectedIdx;
  const active = activeIdx !== null ? data[activeIdx] : null;
  const gap = data.length > 14 ? "gap-1" : "gap-1.5";

  return (
    <div className="h-full min-w-[560px] flex sm:min-w-0">
      <YAxis max={niceM} />
      <div className="relative min-w-0 flex-1 flex flex-col">
        {active && (
          <div className="absolute top-1 right-1 z-10 bg-foreground text-background rounded-md px-2.5 py-1.5 text-xs shadow-md pointer-events-none">
            <div className="text-[10px] opacity-70">{active.fullLabel}</div>
            <div className="font-semibold tabular-nums">
              {formatARS(active.v)}
            </div>
          </div>
        )}
        <div className="relative flex-1">
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <div
              key={p}
              className="absolute left-0 right-0 border-t border-border/60"
              style={{ top: `${p * 100}%` }}
            />
          ))}
          <div className={cn("absolute inset-0 flex items-end", gap)}>
            {data.map((d, i) => {
              const isSelected = selectedIdx === i;
              const isHover = hoverIdx === i;
              return (
                <button
                  key={i}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  onClick={() => onSelect(i)}
                  className="flex-1 h-full flex items-end group rounded-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${d.fullLabel}: ${formatARS(d.v)}`}
                >
                  <div
                    className={cn(
                      "w-full rounded-t transition-colors",
                      isSelected
                        ? "bg-brand"
                        : isHover
                          ? "bg-brand/80"
                          : "bg-chart-bar group-hover:bg-brand/80",
                    )}
                    style={{ height: `${(d.v / niceM) * 100}%` }}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <div className={cn("flex mt-2", gap)}>
          {data.map((d, i) => (
            <span
              key={i}
              className="min-w-0 flex-1 text-[12px] text-muted-foreground text-center truncate"
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
