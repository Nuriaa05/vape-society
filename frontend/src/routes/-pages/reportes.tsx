import { useNavigate, useSearch } from "@tanstack/react-router";
import { ProfitReportPage } from "@/components/profit-report";
import { ReportBarChart } from "@/components/report-bar-chart";
import {
  dateRangeToReportSearch,
  getProfitReportDates,
  type ReportSearch,
  type ReportView,
} from "@/lib/profit-reports";
import { buildReportDateRange } from "@/lib/report-exports";
import { Card, CardToolbar, KpiCard, CardFooter } from "@/components/ui/card";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ReportDateRangePicker } from "@/components/report-date-range-picker";
import { downloadCSV, type CsvCell } from "@/lib/csv";
import { buildSalesExportRows } from "@/lib/data-export";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatARS } from "@/lib/formatters";
import {
  buildConsumptionExportRows,
  buildTopProductsExportRows,
  getReportRangeLabel,
  getTopProductsSortLabel,
} from "@/lib/report-exports";
import {
  reportsRepository,
  type ReportRange,
  type ReportDateRange,
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
import {
  Download,
  FileSpreadsheet,
  FileText,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const reportRangeOptions: Array<{ id: ReportRange; label: string }> = [
  { id: "all", label: "Todo el tiempo" },
  { id: "30d", label: "30 días" },
  { id: "90d", label: "90 días" },
  { id: "year", label: "12 meses" },
];

export function ReportesPage() {
  const search = useSearch({ from: "/reportes" });
  const navigate = useNavigate({ from: "/reportes" });
  const view = search.vista ?? "ventas";
  const profitGrouping = search.agrupacion ?? "day";
  const [rememberedDates, setRememberedDates] = useState<
    Partial<Record<ReportView, ReportDateRange>>
  >({});
  const selectedDates = useMemo(() => {
    if (search.desde && search.hasta)
      return buildReportDateRange(search.desde, search.hasta);
    return undefined;
  }, [search.desde, search.hasta]);
  const now = new Date();
  const todayRange = getProfitReportDates("day", undefined, now);
  const { desde: todayFrom, hasta: todayTo } =
    dateRangeToReportSearch(todayRange);
  const profitDates = getProfitReportDates(
    profitGrouping,
    view === "ganancias" ? selectedDates : rememberedDates.ganancias,
    now,
  );
  const activeDates = view === "ganancias" ? profitDates : selectedDates;
  const salesDates = view === "ventas" ? selectedDates : rememberedDates.ventas;

  useEffect(() => {
    if (
      view !== "ganancias" ||
      profitGrouping !== "day" ||
      (search.desde === todayFrom && search.hasta === todayTo)
    )
      return;
    void navigate({
      search: (previous: ReportSearch) =>
        previous.vista === "ganancias" &&
        (previous.agrupacion ?? "day") === "day"
          ? { ...previous, desde: todayFrom, hasta: todayTo }
          : previous,
      replace: true,
    });
  }, [
    view,
    profitGrouping,
    search.desde,
    search.hasta,
    todayFrom,
    todayTo,
    navigate,
  ]);

  const changeDates = (range: ReportDateRange | undefined) => {
    const group =
      profitGrouping === "day" &&
      range &&
      (range.from !== todayRange.from || range.to !== todayRange.to)
        ? "tenDays"
        : profitGrouping;
    const selected =
      view === "ganancias" ? getProfitReportDates(group, range) : range;
    void navigate({
      search: (previous: ReportSearch) => ({
        ...previous,
        ...(view === "ganancias" ? { agrupacion: group } : {}),
        ...dateRangeToReportSearch(selected),
      }),
      replace: true,
    });
  };
  const changeView = (value: ReportView) => {
    if (value === view) return;
    setRememberedDates((previous) => ({ ...previous, [view]: activeDates }));
    const incoming =
      value === "ganancias"
        ? getProfitReportDates(profitGrouping, rememberedDates.ganancias)
        : rememberedDates.ventas;
    void navigate({
      search: (previous: ReportSearch) => ({
        ...previous,
        vista: value,
        ...dateRangeToReportSearch(incoming),
      }),
    });
  };
  const navigation = (
    <div
      role="group"
      aria-label="Tipo de reporte"
      className="flex w-full gap-6 border-b border-border print:hidden"
    >
      {(["ventas", "ganancias"] as const).map((value) => (
        <button
          key={value}
          type="button"
          className={cn(
            "-mb-px min-h-10 border-b-2 px-1 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            view === value
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={view === value}
          onClick={() => changeView(value)}
        >
          {value === "ventas" ? "Ventas" : "Ganancias"}
        </button>
      ))}
    </div>
  );
  if (view === "ganancias") {
    return (
      <ProfitReportPage
        dates={profitDates}
        groupBy={profitGrouping}
        navigation={navigation}
        onGroupingChange={(group) =>
          void navigate({
            search: (previous: ReportSearch) => ({
              ...previous,
              agrupacion: group,
              ...dateRangeToReportSearch(
                getProfitReportDates(
                  group,
                  profitGrouping === "day" ? undefined : profitDates,
                ),
              ),
            }),
          })
        }
      />
    );
  }
  return (
    <ReportsContent
      dateRange={salesDates}
      onDateRangeChange={changeDates}
      navigation={navigation}
      period={search.periodo ?? "hour"}
      onPeriodChange={(periodo) =>
        void navigate({
          search: (previous: ReportSearch) => ({ ...previous, periodo }),
        })
      }
    />
  );
}

function ReportsContent({
  dateRange,
  onDateRangeChange,
  navigation,
  period,
  onPeriodChange,
}: {
  dateRange?: ReportDateRange;
  onDateRangeChange: (dates: ReportDateRange | undefined) => void;
  navigation: ReactNode;
  period: ReportsPeriod;
  onPeriodChange: (period: ReportsPeriod) => void;
}) {
  const [reportRange, setReportRange] = useState<ReportRange>("all");
  const reportFilter = dateRange ?? reportRange;
  const reportLabel = getReportRangeLabel(reportFilter);
  const exportDates = dateRangeToReportSearch(dateRange);
  const exportRange = dateRange
    ? `${exportDates.desde}-${exportDates.hasta}`
    : reportRange;
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const exportContext = `${JSON.stringify(reportFilter)}/${period}`;
  const exportGeneration = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    exportGeneration.current += 1;
  }, [exportContext]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
    queryKey: ["reports", "commercial", dateRange],
    queryFn: () => reportsRepository.getCommercialSummary(dateRange),
    placeholderData: keepPreviousData,
  });
  const salesDatasetQuery = useQuery({
    queryKey: ["reports", "sales-series", period, dateRange],
    queryFn: () => reportsRepository.getSalesReport(period, dateRange),
    placeholderData: keepPreviousData,
  });
  const bestSellingQuery = useQuery({
    queryKey: ["reports", "top-products", reportFilter, rankingSort],
    queryFn: () =>
      reportsRepository.getBestSellingProducts({
        ...(dateRange ?? { range: reportRange }),
        sort: rankingSort,
      }),
    placeholderData: keepPreviousData,
  });
  const productConsumptionQuery = useQuery({
    queryKey: ["reports", "product-consumption", reportFilter],
    queryFn: () => reportsRepository.getProductConsumption(reportFilter),
    placeholderData: keepPreviousData,
  });
  const paymentBreakdownQuery = useQuery({
    queryKey: ["reports", "payment-methods", dateRange],
    queryFn: () => reportsRepository.getPaymentBreakdown(dateRange),
    placeholderData: keepPreviousData,
  });

  const data = useMemo(
    () => salesDatasetQuery.data?.points ?? [],
    [salesDatasetQuery.data],
  );
  const meta =
    salesDatasetQuery.data?.meta ?? reportsRepository.getPeriodMeta(period);
  const total = useMemo(() => data.reduce((s, d) => s + d.v, 0), [data]);
  const avg = data.length > 0 ? Math.round(total / data.length) : 0;
  const max = data.length > 0 ? Math.max(...data.map((d) => d.v)) : 0;

  const selected = selectedIdx !== null ? (data[selectedIdx] ?? null) : null;
  const detailProductsQuery = useQuery({
    queryKey: [
      "reports",
      "top-products",
      "detail",
      detailScope,
      selected?.from,
      selected?.to,
      rankingSort,
      dateRange,
    ],
    queryFn: () => {
      if (detailScope === "all") {
        return reportsRepository.getBestSellingProducts({
          ...(dateRange ?? { range: "all" }),
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
  const isRefreshing =
    commercialSummaryQuery.isFetching ||
    salesDatasetQuery.isFetching ||
    bestSellingQuery.isFetching ||
    productConsumptionQuery.isFetching ||
    paymentBreakdownQuery.isFetching;
  const dateControls = (
    <>
      <ReportDateRangePicker
        value={dateRange}
        disabled={isLoading}
        onChange={(range) => {
          onDateRangeChange(range);
          setSelectedIdx(null);
          setDetailScope("bucket");
        }}
      />
      <span role="status" className="sr-only">
        {isRefreshing
          ? "Actualizando reportes..."
          : dateRange
            ? `Período: ${getReportRangeLabel(dateRange)}`
            : "Sin filtro de fechas."}
      </span>
    </>
  );

  useEffect(() => {
    setVisibleBestSellingCount(REPORT_PREVIEW_INCREMENT);
  }, [reportFilter, rankingSort]);

  useEffect(() => {
    setVisibleConsumptionCount(REPORT_PREVIEW_INCREMENT);
  }, [reportFilter]);

  const handleSelectPeriod = (id: ReportsPeriod) => {
    onPeriodChange(id);
    setSelectedIdx(null);
    setDetailScope("bucket");
  };

  const handleSelectBar = (i: number) => {
    if (salesDatasetQuery.isFetching || salesDatasetQuery.isPlaceholderData)
      return;
    if (selectedIdx === i) {
      setSelectedIdx(null);
      return;
    }

    setSelectedIdx(i);
    setDetailScope("bucket");
  };

  const exportPeriodCSV = () => {
    const rows: CsvCell[][] = [
      ["Periodo", meta.title],
      ["Fechas", dateRange ? getReportRangeLabel(dateRange) : meta.subtitle],
      ["Bucket", "Total ARS"],
    ];
    data.forEach((d) => rows.push([d.fullLabel, d.v]));
    rows.push(["", ""], ["Total", total], ["Promedio", avg]);
    downloadCSV(`reporte-${dateRange ? exportRange : period}.csv`, rows);
  };

  const exportTopProductsCSV = () => {
    const rows = [
      ["Rango", reportLabel],
      ["Criterio", getTopProductsSortLabel(rankingSort)],
      [],
      ...buildTopProductsExportRows(bestSelling),
    ];
    downloadCSV(`productos-vendidos-${exportRange}-${rankingSort}.csv`, rows);
  };

  const exportConsumptionCSV = () => {
    const rows = [
      ["Rango", reportLabel],
      [],
      ...buildConsumptionExportRows(productConsumption),
    ];
    downloadCSV(`consumo-productos-${exportRange}.csv`, rows);
  };

  const exportSalesCSV = async () => {
    if (isExportingSales) return;

    setIsExportingSales(true);
    const generation = exportGeneration.current;
    try {
      const sales = await reportsRepository.getSalesExport(reportFilter);
      if (!mounted.current || exportGeneration.current !== generation) return;
      const rows: CsvCell[][] = [
        ["Rango", reportLabel],
        [],
        ...buildSalesExportRows(sales),
      ];
      downloadCSV(`ventas-${exportRange}.csv`, rows);
    } catch {
      if (mounted.current && exportGeneration.current === generation)
        toast.error("No se pudo exportar el listado completo de ventas.");
    } finally {
      if (mounted.current) setIsExportingSales(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell
        title="Reportes"
        subtitle="Análisis comercial e indicadores"
        actions={dateControls}
      >
        {navigation}
        <Card className="app-card-body text-sm text-muted-foreground">
          <p className="mt-3">Cargando reportes...</p>
        </Card>
      </AppShell>
    );
  }

  if (hasError || !commercialSummary) {
    return (
      <AppShell
        title="Reportes"
        subtitle="Análisis comercial e indicadores"
        actions={dateControls}
      >
        {navigation}
        <Card className="app-card-body text-sm">
          <p className="mt-3 text-destructive">
            No se pudieron cargar los reportes.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="ml-3"
            onClick={() => {
              void commercialSummaryQuery.refetch();
              void salesDatasetQuery.refetch();
              void bestSellingQuery.refetch();
              void productConsumptionQuery.refetch();
              void paymentBreakdownQuery.refetch();
            }}
          >
            Reintentar
          </Button>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Reportes"
      subtitle="Análisis comercial e indicadores"
      actions={
        <>
          {dateControls}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={isRefreshing}>
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
                <FileSpreadsheet /> Productos vendidos ({reportLabel})
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={productConsumptionQuery.isFetching}
                onClick={exportConsumptionCSV}
              >
                <FileSpreadsheet /> Consumo por producto
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isExportingSales || isRefreshing}
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
        </>
      }
    >
      <p className="hidden print:block text-sm">
        Período:{" "}
        {dateRange
          ? getReportRangeLabel(dateRange)
          : "Vista sin filtro de fechas"}
      </p>
      {navigation}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <KpiCard
          icon={
            <ReceiptText className="size-4 text-accent" aria-hidden="true" />
          }
          label={dateRange ? "Cantidad de ventas" : "Ventas hoy"}
          hint={dateRange ? reportLabel : undefined}
          value={
            dateRange
              ? String(
                  commercialSummary.deliveredSalesCount +
                    commercialSummary.pendingSalesCount,
                )
              : formatARS(commercialSummary.dailyTotal)
          }
        />
        <KpiCard
          icon={
            <TrendingUp className="size-4 text-success" aria-hidden="true" />
          }
          label={dateRange ? "Ventas del período" : "Ventas del mes"}
          hint={dateRange ? reportLabel : undefined}
          value={formatARS(commercialSummary.monthlyTotal)}
        />
        <KpiCard
          icon={
            <ShoppingCart className="size-4 text-accent" aria-hidden="true" />
          }
          label={dateRange ? "Compras del período" : "Compras del mes"}
          hint={dateRange ? reportLabel : undefined}
          value={formatARS(commercialSummary.monthlyPurchases)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5">
        <Card
          className="bg-sidebar border-sidebar-border app-card-body"
          aria-busy={salesDatasetQuery.isFetching}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="space-y-2">
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
            </div>
            {!dateRange && (
              <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5 print:hidden">
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
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <Mini label="Total" value={formatARS(total)} />
            <Mini label="Promedio" value={formatARS(avg)} />
            <Mini label="Pico" value={formatARS(max)} />
          </div>

          <div className="h-64 overflow-x-auto">
            <ReportBarChart
              data={data}
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
                      ? dateRange
                        ? getReportRangeLabel(dateRange)
                        : "Todo el tiempo"
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
                <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
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
                      : dateRange
                        ? "Ver todo el rango"
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
            <div className="mt-3 text-[11px] text-muted-foreground print:hidden">
              Hacé clic en una barra para ver el detalle.
            </div>
          )}
        </Card>
        <Card className="app-card-body">
          <h2 className="font-semibold mb-1 app-card-title">
            Ventas por método de pago
          </h2>
          <div className="text-xs text-muted-foreground mb-4">
            {dateRange ? getReportRangeLabel(dateRange) : "Todo el tiempo"}
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
              {reportLabel} · {getTopProductsSortLabel(rankingSort)} ·{" "}
              {bestSellingQuery.isFetching ? (
                <span role="status">Actualizando datos...</span>
              ) : (
                `${soldItemQty} unidades`
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {!dateRange && (
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
            )}
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
              {reportLabel} ·{" "}
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
            className="print:hidden"
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
    <CardFooter className="flex justify-center gap-2 print:hidden">
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
