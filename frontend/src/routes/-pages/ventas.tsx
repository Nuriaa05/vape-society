import { Card, CardHeader, CardToolbar } from "@/components/ui/card";
import { useSearch } from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { AppShell, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Sale } from "@/lib/contracts";
import { formatARS, formatDateTimeAR } from "@/lib/formatters";
import {
  salesRepository,
  settingsRepository,
  type DeliveryFilter,
} from "@/lib/repositories";
import { getPaymentFilterOptions } from "@/lib/payment-methods";
import { basisPointsToPercentInput } from "@/lib/payment-pricing";
import {
  RECEIPT_FINAL_RULE,
  buildReceiptHeaderLines,
  getReceiptFooter,
} from "@/lib/receipt-view";
import {
  printReceiptBySaleId,
  saveReceiptPdfBySaleId,
} from "@/lib/desktop-printer";
import {
  canShowLess,
  canShowMore,
  getNextVisibleCount,
  getVisibleItems,
  PAGE_LIST_INCREMENT,
} from "@/lib/visible-items";
import {
  CheckCircle2,
  FileDown,
  Eye,
  MoreHorizontal,
  Printer,
  Search,
  Truck,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SALES_FETCH_PAGE_SIZE = 200;

export function VentasPage() {
  const queryClient = useQueryClient();
  const search = useSearch({ from: "/ventas" });
  const salesQuery = useInfiniteQuery({
    queryKey: ["sales", "history"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      salesRepository.findAll({ take: SALES_FETCH_PAGE_SIZE, skip: pageParam }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === SALES_FETCH_PAGE_SIZE
        ? allPages.length * SALES_FETCH_PAGE_SIZE
        : undefined,
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsRepository.getSettings(),
  });
  const deliverMutation = useMutation({
    mutationFn: (id: string) => salesRepository.deliver(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales"] });
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      salesRepository.cancel(id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales"] });
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
  const sales = useMemo(
    () => salesQuery.data?.pages.flat() ?? [],
    [salesQuery.data],
  );
  const [q, setQ] = useState("");
  const [date, setDate] = useState("");
  const [payment, setPayment] = useState<"all" | string>("all");
  const [quick, setQuick] = useState<DeliveryFilter>(search.entrega ?? "all");
  const [viewing, setViewing] = useState<Sale | null>(null);
  const [delivering, setDelivering] = useState<Sale | null>(null);
  const [cancelling, setCancelling] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [printingSaleId, setPrintingSaleId] = useState<string | null>(null);
  const [savingPdfSaleId, setSavingPdfSaleId] = useState<string | null>(null);
  const [visibleSalesCount, setVisibleSalesCount] =
    useState(PAGE_LIST_INCREMENT);

  const filtered = useMemo(
    () =>
      salesRepository.filter(sales, {
        delivery: quick,
        payment,
        date,
        query: q,
      }),
    [sales, q, date, payment, quick],
  );

  useEffect(() => {
    setVisibleSalesCount(PAGE_LIST_INCREMENT);
  }, [q, date, payment, quick]);

  const visibleSales = useMemo(
    () => getVisibleItems(filtered, visibleSalesCount),
    [filtered, visibleSalesCount],
  );

  const counts = useMemo(() => salesRepository.getCounts(sales), [sales]);
  const paymentOptions = useMemo(
    () =>
      getPaymentFilterOptions(settingsQuery.data?.paymentMethods ?? [], sales),
    [settingsQuery.data?.paymentMethods, sales],
  );
  const receiptHeaderLines = settingsQuery.data
    ? buildReceiptHeaderLines(settingsQuery.data)
    : [];
  const receiptFooter = settingsQuery.data
    ? getReceiptFooter(settingsQuery.data.receipt)
    : "";

  const markDelivered = async (s: Sale) => {
    await deliverMutation.mutateAsync(s.id);
    setDelivering(null);
    toast.success("Venta marcada como entregada.");
  };

  const annul = async (s: Sale, reason: string) => {
    await cancelMutation.mutateAsync({ id: s.id, reason });
    setCancelling(null);
    setCancelReason("");
    toast.success(`Venta ${s.number} anulada. Stock devuelto al inventario.`);
  };

  const reprint = async (s: Sale) => {
    if (printingSaleId) return;

    setPrintingSaleId(s.id);
    try {
      await printReceiptBySaleId({
        saleId: s.id,
        source: "history",
        printerBridge: window.retailCore?.printer,
      });
      toast.success(`Comprobante ${s.number} enviado a impresión.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo imprimir el comprobante.",
      );
    } finally {
      setPrintingSaleId(null);
    }
  };

  const savePdf = async (s: Sale) => {
    if (savingPdfSaleId) return;

    setSavingPdfSaleId(s.id);
    try {
      const result = await saveReceiptPdfBySaleId({
        saleId: s.id,
        source: "history",
        printerBridge: window.retailCore?.printer,
      });

      if (result.ok) {
        toast.success(`Comprobante ${s.number} guardado en PDF.`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el comprobante en PDF.",
      );
    } finally {
      setSavingPdfSaleId(null);
    }
  };

  return (
    <AppShell title="Ventas" subtitle="Historial operativo de ventas">
      {(salesQuery.isLoading || settingsQuery.isLoading) && (
        <Card className="app-card-body text-sm text-muted-foreground">
          Cargando ventas...
        </Card>
      )}
      {(salesQuery.error || settingsQuery.error) && (
        <Card className="app-card-body text-sm text-destructive">
          No se pudieron cargar las ventas.
        </Card>
      )}
      {!salesQuery.isLoading &&
        !settingsQuery.isLoading &&
        !salesQuery.error &&
        !settingsQuery.error && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "all", label: "Todas" },
                  { id: "Pendiente", label: "Pendientes" },
                  { id: "Entregado", label: "Entregadas" },
                  { id: "Anulada", label: "Anuladas" },
                ] as { id: DeliveryFilter; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setQuick(t.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md border transition-colors",
                    quick === t.id
                      ? "bg-foreground text-background border-foreground"
                      : "bg-card text-muted-foreground border-border hover:text-foreground",
                  )}
                >
                  {t.label}{" "}
                  <span className="ml-1 opacity-70 tabular-nums">
                    {counts[t.id]}
                  </span>
                </button>
              ))}
            </div>

            <Card>
              <CardHeader title="Historial de ventas" />
              <CardToolbar className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-0">
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label="Buscar ventas por comprobante, producto, cliente o celular"
                    placeholder="Comprobante, producto, cliente o celular"
                    className="pl-9"
                  />
                </div>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <Select
                  value={payment}
                  onValueChange={(v) => setPayment(v as typeof payment)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Método de pago" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los pagos</SelectItem>
                    {paymentOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardToolbar>

              <div className="max-h-[640px] overflow-auto overscroll-contain">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 text-left text-sm text-foreground border-b border-border bg-card">
                    <tr>
                      <th className="app-table-heading font-medium">
                        Comprobante
                      </th>
                      <th className="app-table-heading font-medium">Fecha</th>
                      <th className="app-table-heading font-medium">
                        Productos
                      </th>
                      <th className="app-table-heading font-medium">Cliente</th>
                      <th className="app-table-heading font-medium">Pago</th>
                      <th className="app-table-heading font-medium text-right">
                        Total
                      </th>
                      <th className="app-table-heading font-medium">Entrega</th>
                      <th className="app-table-heading font-medium text-right w-12">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-5 py-10 text-center text-muted-foreground"
                        >
                          Sin ventas para los filtros aplicados.
                        </td>
                      </tr>
                    )}
                    {visibleSales.map((s) => {
                      const isCancelled = s.status === "Anulada";
                      const isPending =
                        !isCancelled && s.delivery === "Pendiente";
                      return (
                        <tr
                          key={s.id}
                          className={cn(
                            "border-b border-border/60 last:border-0 hover:bg-muted/30",
                            isCancelled && "opacity-70",
                          )}
                        >
                          <td className="px-5 py-3 font-mono text-xs">
                            {s.number}
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">
                            {formatDateTimeAR(s.date)}
                          </td>
                          <td
                            className="px-5 py-3 max-w-[260px] truncate text-muted-foreground"
                            title={s.items
                              .map((i) => `${i.qty}× ${i.name}`)
                              .join(", ")}
                          >
                            {s.items
                              .map((i) => `${i.qty}× ${i.name}`)
                              .join(", ")}
                          </td>
                          <td
                            className="px-5 py-3 max-w-[200px] truncate text-muted-foreground"
                            title={s.customerName}
                          >
                            {s.customerName || "Sin registrar"}
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge tone="muted">{s.payment}</StatusBadge>
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums font-medium">
                            {formatARS(s.total)}
                          </td>
                          <td className="px-5 py-3">
                            {isCancelled ? (
                              <StatusBadge tone="destructive">
                                Anulada
                              </StatusBadge>
                            ) : isPending ? (
                              <StatusBadge tone="warning">
                                Pendiente
                              </StatusBadge>
                            ) : (
                              <StatusBadge tone="success">
                                Entregado
                              </StatusBadge>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                >
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setViewing(s)}>
                                  <Eye /> Ver comprobante
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={printingSaleId !== null}
                                  onClick={() => void reprint(s)}
                                >
                                  <Printer />{" "}
                                  {printingSaleId === s.id
                                    ? "Imprimiendo..."
                                    : "Reimprimir"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={
                                    savingPdfSaleId !== null ||
                                    !window.retailCore?.printer
                                      ?.saveSaleReceiptPdf
                                  }
                                  title="Para guardar un PDF en el navegador, usá Reimprimir y elegí Guardar como PDF."
                                  onClick={() => void savePdf(s)}
                                >
                                  <FileDown />{" "}
                                  {savingPdfSaleId === s.id
                                    ? "Guardando..."
                                    : "Guardar PDF"}
                                </DropdownMenuItem>
                                {isPending && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setDelivering(s)}
                                    >
                                      <Truck /> Marcar como entregado
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {!isCancelled && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setCancelling(s)}
                                    >
                                      <XCircle /> Anular venta
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(canShowMore(visibleSalesCount, filtered.length) ||
                canShowLess(
                  visibleSalesCount,
                  PAGE_LIST_INCREMENT,
                  filtered.length,
                )) && (
                <div className="border-t border-border px-5 py-3 flex justify-center gap-2">
                  {canShowMore(visibleSalesCount, filtered.length) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVisibleSalesCount((current) =>
                          getNextVisibleCount(
                            current,
                            PAGE_LIST_INCREMENT,
                            filtered.length,
                          ),
                        )
                      }
                    >
                      Ver m&aacute;s
                    </Button>
                  )}
                  {canShowLess(
                    visibleSalesCount,
                    PAGE_LIST_INCREMENT,
                    filtered.length,
                  ) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVisibleSalesCount(PAGE_LIST_INCREMENT)}
                    >
                      Ver menos
                    </Button>
                  )}
                </div>
              )}
              {salesQuery.hasNextPage && (
                <div className="border-t border-border px-5 py-3 flex justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={salesQuery.isFetching}
                    onClick={() => void salesQuery.fetchNextPage()}
                  >
                    {salesQuery.isFetching
                      ? "Cargando..."
                      : `Cargar ventas anteriores (${sales.length} cargadas)`}
                  </Button>
                </div>
              )}
            </Card>

            {/* Ver comprobante */}
            <Dialog
              open={viewing !== null}
              onOpenChange={(o) => !o && setViewing(null)}
            >
              <DialogContent className="max-w-lg grid-cols-[minmax(0,1fr)]">
                <DialogHeader>
                  <DialogTitle>Comprobante {viewing?.number}</DialogTitle>
                  <DialogDescription className="sr-only">
                    Detalle persistido de la venta y acciones disponibles para
                    su comprobante interno.
                  </DialogDescription>
                </DialogHeader>
                {viewing && (viewing.customerName || viewing.customerPhone) && (
                  <div className="grid gap-3 rounded-md border border-border bg-muted/50 p-3 text-sm sm:grid-cols-2">
                    {viewing.customerName && (
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">
                          Cliente
                        </div>
                        <div className="break-words font-medium">
                          {viewing.customerName}
                        </div>
                      </div>
                    )}
                    {viewing.customerPhone && (
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">
                          Celular
                        </div>
                        <div className="break-words font-medium">
                          {viewing.customerPhone}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {viewing && (
                  <div className="receipt-preview min-w-0 bg-white border border-dashed border-border rounded-md p-4 font-mono text-[11px] text-foreground leading-5 [overflow-wrap:anywhere]">
                    <div className="text-center font-semibold text-sm">
                      {receiptHeaderLines[0]}
                    </div>
                    {receiptHeaderLines.slice(1).map((line) => (
                      <div
                        key={line}
                        className="text-center text-muted-foreground"
                      >
                        {line}
                      </div>
                    ))}
                    <div className="border-t border-dashed border-border my-2" />
                    <div className="flex justify-between">
                      <span>Comp.</span>
                      <span>{viewing.number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Fecha</span>
                      <span>{formatDateTimeAR(viewing.date)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Entrega</span>
                      <span>
                        {viewing.status === "Anulada" ? "—" : viewing.delivery}
                      </span>
                    </div>
                    <div className="border-t border-dashed border-border my-2" />
                    {viewing.items.map((i) => (
                      <div
                        key={i.productId}
                        className="flex justify-between gap-2"
                      >
                        <span className="truncate">
                          {i.qty}× {i.name}
                        </span>
                        <span className="tabular-nums">
                          {formatARS(i.qty * i.price)}
                        </span>
                      </div>
                    ))}
                    <div className="border-t border-dashed border-border my-2" />
                    {((viewing.discount ?? 0) > 0 ||
                      (viewing.surcharge ?? 0) > 0) && (
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span className="tabular-nums">
                          {formatARS(viewing.subtotal ?? viewing.total)}
                        </span>
                      </div>
                    )}
                    {(viewing.discount ?? 0) > 0 && (
                      <div className="flex justify-between gap-2">
                        <span className="truncate">
                          {viewing.couponCode
                            ? `Cupón ${viewing.couponCode}`
                            : "Descuento"}
                        </span>
                        <span className="tabular-nums">
                          {formatARS(-(viewing.discount ?? 0))}
                        </span>
                      </div>
                    )}
                    {(viewing.surcharge ?? 0) > 0 && (
                      <div className="flex justify-between gap-2">
                        <span className="truncate">
                          Recargo{" "}
                          {basisPointsToPercentInput(
                            viewing.surchargeBasisPoints ?? 0,
                          )}
                          %
                        </span>
                        <span className="tabular-nums">
                          {formatARS(viewing.surcharge ?? 0)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold">
                      <span>TOTAL</span>
                      <span className="tabular-nums">
                        {formatARS(viewing.total)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pago</span>
                      <span>{viewing.payment}</span>
                    </div>
                    {viewing.cashReceived !== undefined &&
                      viewing.change !== undefined && (
                        <>
                          <div className="flex justify-between">
                            <span>Recibido</span>
                            <span className="tabular-nums">
                              {formatARS(viewing.cashReceived)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Vuelto</span>
                            <span className="tabular-nums">
                              {formatARS(viewing.change)}
                            </span>
                          </div>
                        </>
                      )}
                    {viewing.status === "Anulada" && (
                      <div className="text-center mt-2 text-destructive font-semibold">
                        ** VENTA ANULADA **
                      </div>
                    )}
                    <div className="text-center mt-2 text-muted-foreground">
                      {receiptFooter}
                    </div>
                    <div
                      className="text-center mt-1 text-muted-foreground"
                      aria-hidden="true"
                    >
                      {RECEIPT_FINAL_RULE}
                    </div>
                  </div>
                )}
                <DialogFooter className="grid grid-cols-1 sm:grid-cols-2 sm:justify-normal">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => viewing && void reprint(viewing)}
                  >
                    <Printer /> Reimprimir
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={
                      savingPdfSaleId !== null ||
                      !window.retailCore?.printer?.saveSaleReceiptPdf
                    }
                    title="Para guardar un PDF en el navegador, usá Reimprimir y elegí Guardar como PDF."
                    onClick={() => viewing && void savePdf(viewing)}
                  >
                    <FileDown /> Guardar PDF
                  </Button>
                  <Button
                    className="w-full sm:col-span-2"
                    onClick={() => setViewing(null)}
                  >
                    Cerrar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Marcar como entregado */}
            <AlertDialog
              open={delivering !== null}
              onOpenChange={(o) => !o && setDelivering(null)}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Marcar como entregado</AlertDialogTitle>
                  <AlertDialogDescription>
                    ¿Confirmar que esta venta ya fue entregada? El stock ya está
                    descontado desde la reserva, no se descontará nuevamente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => delivering && markDelivered(delivering)}
                  >
                    <CheckCircle2 /> Confirmar entrega
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Anular venta */}
            <AlertDialog
              open={cancelling !== null}
              onOpenChange={(o) => {
                if (!o) {
                  setCancelling(null);
                  setCancelReason("");
                }
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Anular venta {cancelling?.number}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Se devolverá el stock al inventario y la venta quedará
                    marcada como anulada. El comprobante no se borra.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-1.5 py-1">
                  <Label className="text-xs text-muted-foreground">
                    Motivo de la anulación (opcional)
                  </Label>
                  <Textarea
                    rows={3}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    maxLength={200}
                    placeholder="Ej. Cliente se arrepintió, error de carga…"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      cancelling && annul(cancelling, cancelReason.trim())
                    }
                  >
                    <XCircle /> Anular venta
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
    </AppShell>
  );
}
