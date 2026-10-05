import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  type Combo,
  type Product,
  type Sale,
  type SaleCatalogItem,
} from "@/lib/contracts";
import { formatARS, formatReceiptDateTimeAR } from "@/lib/formatters";
import {
  RECEIPT_FINAL_RULE,
  buildReceiptHeaderLines,
  getReceiptFooter,
} from "@/lib/receipt-view";
import {
  addOrIncrementLine,
  adjustLineQuantity,
  applyCouponCode,
  canConfirmQuotedSale,
  clearAppliedCoupon,
  filterSaleCatalogItems,
  getCartItemKey,
  getNegativeStockWarnings,
  getSaleCreationErrorMessage,
  setLineQuantity,
  type Line,
} from "@/lib/sale-cart";
import { buildSaleQuoteKey, parseOptionalCashInput } from "@/lib/sale-checkout";
import { basisPointsToPercentInput } from "@/lib/payment-pricing";
import {
  getAvailablePaymentMethods,
  resolveSelectedPaymentMethodId,
} from "@/lib/payment-methods";
import { getSaleableProducts } from "@/lib/product-visibility";
import {
  productsRepository,
  catalogRepository,
  combosRepository,
  salesRepository,
  settingsRepository,
  stockRepository,
} from "@/lib/repositories";
import { isScannerSubmitKey } from "@/lib/scanner-input";
import {
  printReceiptBySaleId,
  saveReceiptPdfBySaleId,
} from "@/lib/desktop-printer";
import {
  buildCartWhatsAppMessage,
  buildSaleWhatsAppMessage,
  copyOrderText,
  shareOrderOnWhatsApp,
} from "@/lib/whatsapp-share";
import {
  Banknote,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  FileDown,
  FilePlus2,
  LoaderCircle,
  MessageCircle,
  Printer,
  ScanLine,
  Trash2,
  Undo2,
  Wallet,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function NuevaVenta() {
  const queryClient = useQueryClient();
  const productsQuery = useQuery({
    queryKey: ["products", "active"],
    queryFn: () => productsRepository.findActive(),
  });
  const combosQuery = useQuery({
    queryKey: ["combos", "active"],
    queryFn: () => combosRepository.findActive(),
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsRepository.getSettings(),
  });
  const stockQuery = useQuery({
    queryKey: ["stock", "products"],
    queryFn: () => stockRepository.getPhysicalStock(),
  });
  const createSaleMutation = useMutation({
    mutationFn: salesRepository.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales"] });
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
  const cancelSaleMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      salesRepository.cancel(id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales"] });
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    },
  });
  const saleProducts = useMemo(() => {
    const stockByProductId = new Map(
      (stockQuery.data ?? []).map((product) => [product.id, product]),
    );

    return getSaleableProducts(
      (productsQuery.data ?? []).map((product) => {
        const stockProduct = stockByProductId.get(product.id);

        return {
          ...product,
          stock: stockProduct?.stock ?? product.stock,
          reservedStock: stockProduct?.reservedStock ?? product.reservedStock,
          availableStock:
            stockProduct?.availableStock ?? product.availableStock,
        };
      }),
    );
  }, [productsQuery.data, stockQuery.data]);
  const saleCombos = useMemo(() => {
    const stockByProductId = new Map(
      (stockQuery.data ?? []).map((product) => [product.id, product]),
    );

    return (combosQuery.data ?? []).map((combo) =>
      enrichComboStock(combo, stockByProductId),
    );
  }, [combosQuery.data, stockQuery.data]);
  const saleCatalogItems = useMemo<SaleCatalogItem[]>(
    () => [...saleProducts, ...saleCombos],
    [saleProducts, saleCombos],
  );
  const [scan, setScan] = useState("");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [activeLineProductId, setActiveLineProductId] = useState<string | null>(
    null,
  );
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [delivery, setDelivery] = useState<"Entregado" | "Pendiente">(
    "Entregado",
  );
  const [couponInput, setCouponInput] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [cashReceivedInput, setCashReceivedInput] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedSale, setConfirmedSale] = useState<Sale | null>(null);
  const [cancelled, setCancelled] = useState<{ reason: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmNegativeStock, setConfirmNegativeStock] = useState(false);
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [isSavingReceiptPdf, setIsSavingReceiptPdf] = useState(false);
  const [isSharingWhatsApp, setIsSharingWhatsApp] = useState(false);
  const [isCopyingOrder, setIsCopyingOrder] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [saleError, setSaleError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const receiptNumber = confirmedSale?.number ?? "000000";

  const locked = confirmed;
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const grossSubtotal = lines.reduce(
    (s, l) =>
      s +
      (l.product.itemType === "Combo"
        ? l.product.productsTotal
        : l.product.price) *
        l.qty,
    0,
  );
  const comboDiscountTotal = Math.max(0, grossSubtotal - subtotal);
  const availablePaymentMethods = useMemo(
    () => getAvailablePaymentMethods(settingsQuery.data?.paymentMethods ?? []),
    [settingsQuery.data?.paymentMethods],
  );
  const selectedPaymentMethod = availablePaymentMethods.find(
    (method) => method.id === paymentMethodId,
  );
  const paymentLabel = selectedPaymentMethod?.name ?? "";
  const negativeStockWarnings = useMemo(
    () => getNegativeStockWarnings(lines),
    [lines],
  );
  const quoteLines = useMemo(
    () =>
      lines.map((line) => ({
        itemType:
          line.product.itemType === "Combo"
            ? ("Combo" as const)
            : ("Product" as const),
        itemId: line.product.id,
        qty: line.qty,
      })),
    [lines],
  );
  const quoteAllowsNegativeStock = negativeStockWarnings.length > 0;
  const quoteQuery = useQuery({
    queryKey: buildSaleQuoteKey({
      lines: quoteLines,
      paymentMethodId,
      couponCode: appliedCouponCode,
      cashReceivedInput,
      deliveryStatus: delivery,
      allowNegativeStock: quoteAllowsNegativeStock,
    }),
    queryFn: () =>
      salesRepository.quote({
        items: quoteLines,
        paymentMethodId,
        deliveryStatus: delivery,
        allowNegativeStock: quoteAllowsNegativeStock,
        couponCode: appliedCouponCode || undefined,
        cashReceivedAmountCents: selectedPaymentMethod?.cashHandling
          ? parseOptionalCashInput(cashReceivedInput)
          : undefined,
      }),
    enabled: !locked && quoteLines.length > 0 && Boolean(paymentMethodId),
    retry: false,
  });
  const confirmedPricing = confirmedSale
    ? {
        subtotal: confirmedSale.subtotal ?? subtotal,
        discount: confirmedSale.discount ?? 0,
        net:
          confirmedSale.net ??
          (confirmedSale.subtotal ?? subtotal) - (confirmedSale.discount ?? 0),
        surchargeBasisPoints: confirmedSale.surchargeBasisPoints ?? 0,
        surcharge: confirmedSale.surcharge ?? 0,
        total: confirmedSale.total,
        couponCode: confirmedSale.couponCode,
        cashReceived: confirmedSale.cashReceived ?? null,
        change: confirmedSale.change ?? null,
        cashShortfall: 0,
      }
    : null;
  const pricing = confirmedPricing ?? quoteQuery.data;
  const cashInputMissing =
    selectedPaymentMethod?.cashHandling === true &&
    cashReceivedInput.trim().length === 0;
  const canSubmitQuotedSale = canConfirmQuotedSale({
    hasLines: lines.length > 0,
    hasPaymentMethod: Boolean(paymentMethodId),
    quotePending: quoteQuery.isFetching,
    quoteError: Boolean(quoteQuery.error),
    quoteAvailable: Boolean(quoteQuery.data) && !cashInputMissing,
    cashShortfall: quoteQuery.data?.cashShortfall ?? 0,
  });
  const quoteErrorMessage = quoteQuery.error
    ? getSaleCreationErrorMessage(quoteQuery.error)
    : null;
  const quoteBlockingMessage = quoteErrorMessage
    ? quoteErrorMessage
    : cashInputMissing
      ? "Ingresá el dinero recibido para calcular el vuelto."
      : (quoteQuery.data?.cashShortfall ?? 0) > 0
        ? `Faltan ${formatARS(quoteQuery.data?.cashShortfall ?? 0)} para completar la venta.`
        : quoteQuery.isFetching
          ? "Calculando el total final..."
          : !quoteQuery.data && lines.length > 0
            ? "No se pudo obtener el total final de la venta."
            : null;

  useEffect(() => {
    setPaymentMethodId((current) =>
      resolveSelectedPaymentMethodId(
        current,
        settingsQuery.data?.paymentMethods ?? [],
      ),
    );
  }, [settingsQuery.data?.paymentMethods]);

  const resetSale = () => {
    setLines([]);
    setActiveLineProductId(null);
    setConfirmed(false);
    setConfirmedSale(null);
    setCancelled(null);
    setSaleError(null);
    setIsPrintingReceipt(false);
    setIsSavingReceiptPdf(false);
    setIsSharingWhatsApp(false);
    setIsCopyingOrder(false);
    setConfirmNegativeStock(false);
    setCouponInput("");
    setAppliedCouponCode("");
    setCashReceivedInput("");
    setCustomerName("");
    setCustomerPhone("");
    setPaymentMethodId(
      resolveSelectedPaymentMethodId(
        "",
        settingsQuery.data?.paymentMethods ?? [],
      ),
    );
    setSearch("");
    setScan("");
    inputRef.current?.focus();
  };

  const clearCart = () => {
    setLines([]);
    setActiveLineProductId(null);
    setSaleError(null);
    setConfirmClear(false);
    setConfirmNegativeStock(false);
  };

  const applyCoupon = () => {
    const code = applyCouponCode(couponInput);
    if (!code) {
      toast.error("Ingresá un código de cupón.");
      return;
    }

    setCouponInput(code);
    setAppliedCouponCode(code);
    setSaleError(null);
  };

  const removeCoupon = () => {
    setCouponInput("");
    setAppliedCouponCode(clearAppliedCoupon());
    setSaleError(null);
  };

  const annulSale = async () => {
    const r = cancelReason.trim();
    if (!confirmedSale) return;
    await cancelSaleMutation.mutateAsync({ id: confirmedSale.id, reason: r });
    setCancelled({ reason: r || "Sin motivo informado" });
    setConfirmCancel(false);
    setCancelReason("");
  };

  const filtered = useMemo(
    () => filterSaleCatalogItems(saleCatalogItems, search),
    [saleCatalogItems, search],
  );

  useEffect(() => {
    const handleQuantityShortcut = (event: KeyboardEvent) => {
      if (locked || !event.altKey || event.ctrlKey || event.metaKey) return;

      const key = event.key.toLowerCase();
      const code = event.code.toLowerCase();
      const isIncrease =
        key === "+" || key === "=" || code === "equal" || code === "numpadadd";
      const isDecrease =
        key === "-" ||
        key === "_" ||
        code === "minus" ||
        code === "numpadsubtract";

      if (!isIncrease && !isDecrease) return;

      const itemKey =
        activeLineProductId ??
        (lines.at(-1) ? getCartItemKey(lines.at(-1)!.product) : null);
      if (!itemKey) return;

      event.preventDefault();
      setActiveLineProductId(itemKey);
      setLines((current) =>
        adjustLineQuantity(current, itemKey, isIncrease ? 1 : -1),
      );
      inputRef.current?.focus();
    };

    window.addEventListener("keydown", handleQuantityShortcut);
    return () => window.removeEventListener("keydown", handleQuantityShortcut);
  }, [activeLineProductId, lines, locked]);

  if (
    productsQuery.isLoading ||
    combosQuery.isLoading ||
    settingsQuery.isLoading ||
    stockQuery.isLoading
  ) {
    return (
      <AppShell
        title="Nueva venta"
        subtitle="Escaneá un código o buscá el producto"
      >
        <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">
          Cargando productos...
        </div>
      </AppShell>
    );
  }

  if (
    productsQuery.error ||
    combosQuery.error ||
    settingsQuery.error ||
    stockQuery.error
  ) {
    return (
      <AppShell
        title="Nueva venta"
        subtitle="Escaneá un código o buscá el producto"
      >
        <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">
          No se pudo cargar la venta.
        </div>
      </AppShell>
    );
  }

  if (!settingsQuery.data) {
    return (
      <AppShell
        title="Nueva venta"
        subtitle="Escaneá un código o buscá el producto"
      >
        <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">
          No se pudo cargar la configuración de venta.
        </div>
      </AppShell>
    );
  }

  const receiptHeaderLines = buildReceiptHeaderLines(settingsQuery.data);
  const receiptFooter = getReceiptFooter(settingsQuery.data.receipt);

  const addProduct = (p: SaleCatalogItem) => {
    if (locked) return;
    setLines((curr) => {
      const next = addOrIncrementLine(curr, p);
      const activeLine = next.find(
        (line) =>
          getCartItemKey(line.product) === getCartItemKey(p) ||
          (!!line.product.barcode && line.product.barcode === p.barcode),
      );
      setActiveLineProductId(
        activeLine ? getCartItemKey(activeLine.product) : getCartItemKey(p),
      );
      return next;
    });
    setSaleError(null);
    inputRef.current?.focus();
  };

  const removeProduct = (itemKey: string) => {
    setLines((current) => {
      const next = current.filter(
        (line) => getCartItemKey(line.product) !== itemKey,
      );
      setActiveLineProductId((activeId) =>
        activeId === itemKey
          ? next.at(-1)
            ? getCartItemKey(next.at(-1)!.product)
            : null
          : activeId,
      );
      return next;
    });
  };

  const submitScan = async () => {
    const code = scan.trim();
    if (!code) return;
    const found =
      (await catalogRepository.findByBarcode(code)) ??
      findCatalogItemByBarcode(saleCatalogItems, code);
    if (found) {
      addProduct(
        found.itemType === "Combo"
          ? enrichComboStock(
              found.item,
              new Map(
                (stockQuery.data ?? []).map((product) => [product.id, product]),
              ),
            )
          : (saleProducts.find((product) => product.id === found.item.id) ??
              found.item),
      );
    } else {
      toast.error("Producto o combo no encontrado.");
    }
    setScan("");
    inputRef.current?.focus();
  };

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    void submitScan();
  };

  const submitSale = async (allowNegativeStock: boolean) => {
    if (lines.length === 0) return;
    if (!paymentMethodId) {
      toast.error("No hay métodos de pago activos para completar la venta.");
      return;
    }
    if (!canSubmitQuotedSale) {
      toast.error(
        quoteBlockingMessage ??
          "Esperá a que se calcule el total final de la venta.",
      );
      return;
    }

    setSaleError(null);

    try {
      const sale = await createSaleMutation.mutateAsync({
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        paymentMethodId,
        deliveryStatus: delivery,
        items: lines.map((line) => ({
          itemType: line.product.itemType === "Combo" ? "Combo" : "Product",
          itemId: line.product.id,
          qty: line.qty,
        })),
        allowNegativeStock,
        couponCode: appliedCouponCode || undefined,
        cashReceivedAmountCents: selectedPaymentMethod?.cashHandling
          ? parseOptionalCashInput(cashReceivedInput)
          : undefined,
      });
      setConfirmedSale(sale);
      setCustomerName(sale.customerName ?? "");
      setCustomerPhone(sale.customerPhone ?? "");
      setConfirmed(true);
      setConfirmNegativeStock(false);
      setCouponInput("");
      setAppliedCouponCode("");
      setCashReceivedInput("");
      toast.success(`Venta ${sale.number} confirmada.`);
    } catch (error) {
      const message = getSaleCreationErrorMessage(error);
      setSaleError(message);
      toast.error(message);
      inputRef.current?.focus();
    }
  };

  const confirmSale = async () => {
    if (!canSubmitQuotedSale) {
      toast.error(
        quoteBlockingMessage ??
          "Esperá a que se calcule el total final de la venta.",
      );
      return;
    }

    if (negativeStockWarnings.length > 0) {
      setConfirmNegativeStock(true);
      return;
    }

    await submitSale(false);
  };

  const printReceipt = async () => {
    if (isPrintingReceipt) return;

    if (!confirmedSale) {
      toast.error("Primero confirmá la venta para imprimir el comprobante.");
      return;
    }

    setIsPrintingReceipt(true);
    try {
      await printReceiptBySaleId({
        saleId: confirmedSale.id,
        source: "new-sale",
        printerBridge: window.retailCore?.printer,
      });
      toast.success("Comprobante enviado a impresión.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo imprimir el comprobante.",
      );
    } finally {
      setIsPrintingReceipt(false);
    }
  };

  const saveReceiptPdf = async () => {
    if (isSavingReceiptPdf) return;

    if (!confirmedSale) {
      toast.error("Primero confirmá la venta para guardar el comprobante.");
      return;
    }

    setIsSavingReceiptPdf(true);
    try {
      const result = await saveReceiptPdfBySaleId({
        saleId: confirmedSale.id,
        source: "new-sale",
        printerBridge: window.retailCore?.printer,
      });

      if (result.ok) {
        toast.success(`Comprobante ${confirmedSale.number} guardado en PDF.`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el comprobante en PDF.",
      );
    } finally {
      setIsSavingReceiptPdf(false);
    }
  };

  const getOrderShareMessage = () =>
    confirmedSale
      ? buildSaleWhatsAppMessage(confirmedSale)
      : buildCartWhatsAppMessage(lines);

  const shareWhatsApp = async () => {
    if (isSharingWhatsApp) return;

    setIsSharingWhatsApp(true);
    try {
      await shareOrderOnWhatsApp(getOrderShareMessage(), {
        sharingBridge: window.retailCore?.sharing,
      });
      toast.success("Pedido abierto en WhatsApp.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo abrir WhatsApp.",
      );
    } finally {
      setIsSharingWhatsApp(false);
    }
  };

  const copyOrder = async () => {
    if (isCopyingOrder) return;

    setIsCopyingOrder(true);
    try {
      await copyOrderText(getOrderShareMessage());
      toast.success("Detalle del pedido copiado.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo copiar el pedido.",
      );
    } finally {
      setIsCopyingOrder(false);
    }
  };

  return (
    <AppShell
      title="Nueva venta"
      subtitle="Escaneá un código o buscá el producto"
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <form
            onSubmit={handleScan}
            className="bg-card border border-border rounded-lg p-4"
          >
            <div className="relative">
              <ScanLine className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-accent" />
              <Input
                ref={inputRef}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => {
                  if (isScannerSubmitKey(e.key)) {
                    e.preventDefault();
                    void submitScan();
                  }
                }}
                placeholder="Escanear código de barras o buscar producto/combo"
                className="h-14 pl-12 text-base"
                autoFocus
              />
            </div>
            <div className="mt-3 relative">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto o combo por nombre..."
              />
              {filtered.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-card border border-border rounded-md shadow-sm">
                  {filtered.map((p) => (
                    <button
                      key={getCartItemKey(p)}
                      type="button"
                      onClick={() => {
                        addProduct(p);
                        setSearch("");
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <span>{p.name}</span>
                        {p.itemType === "Combo" && (
                          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                            Combo
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatARS(p.price)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </form>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">
                Carrito ({lines.length})
              </div>
              {!locked && lines.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 /> Vaciar carrito
                </Button>
              )}
              {locked && !cancelled && (
                <span className="text-xs text-success">✓ Confirmada</span>
              )}
              {cancelled && (
                <span className="text-xs text-destructive">✕ Anulada</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-sm text-foreground border-b border-border bg-card">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Producto</th>
                    <th className="px-5 py-2.5 font-medium text-center w-32">
                      Cantidad
                    </th>
                    <th className="px-5 py-2.5 font-medium text-right w-32">
                      Precio
                    </th>
                    <th className="px-5 py-2.5 font-medium text-right w-32">
                      Subtotal
                    </th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-10 text-center text-muted-foreground text-sm"
                      >
                        Sin productos ni combos. Escaneá uno para comenzar.
                      </td>
                    </tr>
                  )}
                  {lines.map((l) => {
                    const product = l.product;
                    const itemKey = getCartItemKey(product);
                    const isCombo = product.itemType === "Combo";

                    return (
                      <tr
                        key={itemKey}
                        onMouseDown={() => setActiveLineProductId(itemKey)}
                        className={cn(
                          "border-b border-border/60 last:border-0",
                          activeLineProductId === itemKey &&
                            !locked &&
                            "bg-muted/25",
                          locked && "text-muted-foreground",
                        )}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2 font-medium">
                            <span>{l.product.name}</span>
                            {isCombo && (
                              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                                Combo
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {l.product.barcode || (isCombo ? "Sin código" : "")}
                          </div>
                          {isCombo && product.items.length > 0 && (
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {product.items
                                .map(
                                  (item) => `${item.qty}x ${item.productName}`,
                                )
                                .join(" + ")}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {locked ? (
                            <div className="text-center tabular-nums">
                              {l.qty}
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                aria-label={`Disminuir cantidad de ${l.product.name}`}
                                onFocus={() => setActiveLineProductId(itemKey)}
                                onClick={() =>
                                  setLines((ls) =>
                                    setLineQuantity(ls, itemKey, l.qty - 1),
                                  )
                                }
                                className="h-7 w-7 rounded border border-border hover:bg-muted"
                              >
                                -
                              </button>
                              <Input
                                type="number"
                                min={1}
                                value={l.qty}
                                aria-label={`Cantidad de ${l.product.name}`}
                                onFocus={() => setActiveLineProductId(itemKey)}
                                onChange={(e) =>
                                  setLines((ls) =>
                                    setLineQuantity(
                                      ls,
                                      itemKey,
                                      e.target.value,
                                    ),
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    inputRef.current?.focus();
                                  }
                                }}
                                onBlur={() =>
                                  setLines((ls) =>
                                    setLineQuantity(ls, itemKey, l.qty),
                                  )
                                }
                                className="h-8 w-16 text-center tabular-nums"
                              />
                              <button
                                type="button"
                                aria-label={`Aumentar cantidad de ${l.product.name}`}
                                onFocus={() => setActiveLineProductId(itemKey)}
                                onClick={() =>
                                  setLines((ls) =>
                                    setLineQuantity(ls, itemKey, l.qty + 1),
                                  )
                                }
                                className="h-7 w-7 rounded border border-border hover:bg-muted"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                          {formatARS(l.product.price)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums font-medium">
                          {formatARS(l.product.price * l.qty)}
                        </td>
                        <td className="px-2 py-3">
                          {!locked && (
                            <button
                              type="button"
                              onClick={() => removeProduct(itemKey)}
                              className="h-7 w-7 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center justify-center"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="text-sm font-semibold mb-3">Resumen de venta</div>
            <div className="space-y-2 text-sm">
              <Row
                label="Subtotal"
                value={formatARS(
                  pricing
                    ? pricing.subtotal + comboDiscountTotal
                    : grossSubtotal,
                )}
              />
              {comboDiscountTotal > 0 && (
                <Row
                  label="Descuento combos"
                  value={`-${formatARS(comboDiscountTotal)}`}
                  muted
                />
              )}
              {(pricing?.discount ?? 0) > 0 && pricing?.couponCode && (
                <Row
                  label={`Cupón ${pricing.couponCode}`}
                  value={`-${formatARS(pricing.discount)}`}
                  muted
                />
              )}
              {(pricing?.surcharge ?? 0) > 0 && (
                <Row
                  label={`Recargo ${paymentLabel} ${basisPointsToPercentInput(pricing?.surchargeBasisPoints ?? 0)}%`}
                  value={formatARS(pricing?.surcharge ?? 0)}
                  muted
                />
              )}
              <div className="border-t border-border my-3" />
              <div className="flex justify-between text-base">
                <span className="font-semibold">Total</span>
                <span className="font-semibold tabular-nums">
                  {pricing
                    ? formatARS(pricing.total)
                    : quoteQuery.isFetching
                      ? "Calculando..."
                      : "Sin calcular"}
                </span>
              </div>
              {pricing?.cashReceived != null && (
                <Row
                  label="Dinero recibido"
                  value={formatARS(pricing.cashReceived)}
                />
              )}
              {pricing?.change != null && (
                <Row label="Vuelto" value={formatARS(pricing.change)} />
              )}
            </div>

            <fieldset
              className="mt-5 space-y-3 border-t border-border pt-4"
              disabled={locked || createSaleMutation.isPending}
            >
              <legend className="text-sm font-medium">
                Datos del cliente (opcional)
              </legend>
              <div className="space-y-1.5">
                <Label htmlFor="sale-customer-name">Nombre del cliente</Label>
                <Input
                  id="sale-customer-name"
                  name="customerName"
                  autoComplete="name"
                  maxLength={100}
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Nombre y apellido"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sale-customer-phone">Celular del cliente</Label>
                <Input
                  id="sale-customer-phone"
                  name="customerPhone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={40}
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="Ej. +54 9 362 4123456"
                />
              </div>
            </fieldset>

            <div className="mt-5">
              <div className="text-xs text-muted-foreground mb-2">
                Método de pago
              </div>
              {availablePaymentMethods.length === 0 ? (
                <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
                  Activá al menos un método de pago en Configuración.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {availablePaymentMethods.map((method) => (
                    <PagoBtn
                      key={method.id}
                      icon={getPaymentMethodIcon(method.name)}
                      label={method.name}
                      active={paymentMethodId === method.id}
                      onClick={() => !locked && setPaymentMethodId(method.id)}
                      disabled={locked}
                    />
                  ))}
                </div>
              )}
            </div>

            {!locked && (
              <div className="mt-4 space-y-2 border-t border-border pt-4">
                <Label
                  htmlFor="sale-coupon"
                  className="text-xs text-muted-foreground"
                >
                  Cupón de descuento
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="sale-coupon"
                    value={couponInput}
                    onChange={(event) => setCouponInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        applyCoupon();
                      }
                    }}
                    placeholder="Ingresar código"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!couponInput.trim()}
                    onClick={applyCoupon}
                  >
                    Aplicar
                  </Button>
                </div>
                {appliedCouponCode && (
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {quoteQuery.isFetching
                        ? `Validando ${appliedCouponCode}...`
                        : quoteQuery.data?.couponCode === appliedCouponCode
                          ? `Cupón aplicado: ${appliedCouponCode}`
                          : `Código ingresado: ${appliedCouponCode}`}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={removeCoupon}
                    >
                      Quitar
                    </Button>
                  </div>
                )}

                {selectedPaymentMethod?.cashHandling && (
                  <div className="space-y-1.5 pt-2">
                    <Label
                      htmlFor="cash-received"
                      className="text-xs text-muted-foreground"
                    >
                      Dinero recibido
                    </Label>
                    <Input
                      id="cash-received"
                      inputMode="decimal"
                      value={cashReceivedInput}
                      onChange={(event) => {
                        setCashReceivedInput(event.target.value);
                        setSaleError(null);
                      }}
                      placeholder="Ej. $10.000"
                    />
                    {cashInputMissing && lines.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Ingresá el importe para habilitar la confirmación.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="mt-5">
              <div className="text-xs text-muted-foreground mb-2">Entrega</div>
              <div className="grid grid-cols-2 gap-2">
                <PagoBtn
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  label="Entregar ahora"
                  active={delivery === "Entregado"}
                  onClick={() => !locked && setDelivery("Entregado")}
                  disabled={locked}
                />
                <PagoBtn
                  icon={<Clock className="h-4 w-4" />}
                  label="Pendiente"
                  active={delivery === "Pendiente"}
                  onClick={() => !locked && setDelivery("Pendiente")}
                  disabled={locked}
                />
              </div>
              {!locked && delivery === "Pendiente" && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  El stock quedará reservado hasta marcar la venta como
                  entregada.
                </p>
              )}
            </div>

            {!locked && negativeStockWarnings.length > 0 && (
              <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
                Hay productos que dejarán stock negativo si confirmás la venta.
              </div>
            )}

            {!locked && quoteQuery.isFetching && lines.length > 0 && (
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                Calculando descuento, recargo y total...
              </div>
            )}

            {!locked && quoteErrorMessage && (
              <div
                role="alert"
                className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {quoteErrorMessage}
              </div>
            )}

            {!locked && (quoteQuery.data?.cashShortfall ?? 0) > 0 && (
              <div
                role="alert"
                className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground"
              >
                Faltan {formatARS(quoteQuery.data?.cashShortfall ?? 0)} para
                completar la venta.
              </div>
            )}

            {saleError && (
              <div
                role="alert"
                className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {saleError}
              </div>
            )}

            <div className="mt-5 space-y-2">
              {!locked && (
                <Button
                  className="w-full"
                  onClick={() => void confirmSale()}
                  disabled={
                    !canSubmitQuotedSale || createSaleMutation.isPending
                  }
                >
                  {quoteQuery.isFetching ? "Calculando..." : "Confirmar venta"}
                </Button>
              )}
              {!locked && lines.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  <Button
                    variant="outline"
                    className="col-span-3"
                    disabled={isSharingWhatsApp}
                    onClick={() => void shareWhatsApp()}
                  >
                    <MessageCircle />{" "}
                    {isSharingWhatsApp ? "Abriendo..." : "Compartir WhatsApp"}
                  </Button>
                  <Button
                    variant="outline"
                    className="col-span-1 px-2"
                    disabled={isCopyingOrder}
                    onClick={() => void copyOrder()}
                    aria-label="Copiar detalle del pedido"
                    title="Copiar detalle"
                  >
                    <Copy />
                  </Button>
                </div>
              )}
              {locked && !cancelled && (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    <Button
                      variant="outline"
                      className="col-span-3"
                      disabled={isSharingWhatsApp}
                      onClick={() => void shareWhatsApp()}
                    >
                      <MessageCircle />{" "}
                      {isSharingWhatsApp ? "Abriendo..." : "Compartir WhatsApp"}
                    </Button>
                    <Button
                      variant="outline"
                      className="col-span-1 px-2"
                      disabled={isCopyingOrder}
                      onClick={() => void copyOrder()}
                      aria-label="Copiar detalle del pedido"
                      title="Copiar detalle"
                    >
                      <Copy />
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={isPrintingReceipt}
                    onClick={() => void printReceipt()}
                  >
                    <Printer />{" "}
                    {isPrintingReceipt
                      ? "Imprimiendo..."
                      : "Imprimir comprobante"}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={
                      isSavingReceiptPdf ||
                      !window.retailCore?.printer?.saveSaleReceiptPdf
                    }
                    title="Para guardar un PDF en el navegador, usá Imprimir comprobante y elegí Guardar como PDF."
                    onClick={() => void saveReceiptPdf()}
                  >
                    <FileDown />{" "}
                    {isSavingReceiptPdf ? "Guardando..." : "Guardar PDF"}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => setConfirmCancel(true)}
                  >
                    <Undo2 /> Anular venta
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={resetSale}
                  >
                    <FilePlus2 /> Nueva venta
                  </Button>
                </>
              )}
              {locked && cancelled && (
                <Button className="w-full" onClick={resetSale}>
                  <FilePlus2 /> Nueva venta
                </Button>
              )}
              {!locked && (
                <Button variant="outline" className="w-full" disabled>
                  <Printer /> Imprimir comprobante
                </Button>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
              Vista previa del comprobante
            </div>
            <div
              className={cn(
                "receipt-preview bg-white border border-dashed border-border rounded-md p-4 font-mono text-[11px] text-foreground leading-5",
                cancelled && "opacity-60",
              )}
            >
              <div className="text-center font-semibold text-sm">
                {receiptHeaderLines[0]}
              </div>
              {receiptHeaderLines.slice(1).map((line) => (
                <div key={line} className="text-center text-muted-foreground">
                  {line}
                </div>
              ))}
              <div className="border-t border-dashed border-border my-2" />
              <div className="flex justify-between">
                <span>Comp.</span>
                <span>{receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Fecha</span>
                <span>{formatReceiptDateTimeAR()}</span>
              </div>
              <div className="border-t border-dashed border-border my-2" />
              {lines.map((l) => {
                const product = l.product;
                const showComboComponents =
                  product.itemType === "Combo" &&
                  settingsQuery.data?.comboTicketMode === "ComboWithComponents";

                return (
                  <div key={getCartItemKey(l.product)} className="space-y-0.5">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">
                        {l.qty}x {l.product.name}
                      </span>
                      <span className="tabular-nums">
                        {formatARS(l.product.price * l.qty)}
                      </span>
                    </div>
                    {showComboComponents &&
                      product.items.map((item) => (
                        <div
                          key={item.productId}
                          className="pl-3 text-muted-foreground"
                        >
                          {item.qty * l.qty}x {item.productName}
                        </div>
                      ))}
                  </div>
                );
              })}
              <div className="border-t border-dashed border-border my-2" />
              {pricing &&
                ((pricing.discount ?? 0) > 0 ||
                  (pricing.surcharge ?? 0) > 0) && (
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="tabular-nums">
                      {formatARS(pricing.subtotal)}
                    </span>
                  </div>
                )}
              {(pricing?.discount ?? 0) > 0 && pricing?.couponCode && (
                <div className="flex justify-between gap-2">
                  <span className="truncate">Cupón {pricing.couponCode}</span>
                  <span className="tabular-nums">
                    -{formatARS(pricing.discount)}
                  </span>
                </div>
              )}
              {(pricing?.surcharge ?? 0) > 0 && (
                <div className="flex justify-between gap-2">
                  <span className="truncate">
                    Recargo{" "}
                    {basisPointsToPercentInput(
                      pricing?.surchargeBasisPoints ?? 0,
                    )}
                    %
                  </span>
                  <span className="tabular-nums">
                    {formatARS(pricing?.surcharge ?? 0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span>TOTAL</span>
                <span className="tabular-nums">
                  {pricing ? formatARS(pricing.total) : formatARS(subtotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Pago</span>
                <span>{paymentLabel || "Sin método"}</span>
              </div>
              {pricing?.cashReceived != null && (
                <div className="flex justify-between">
                  <span>Recibido</span>
                  <span>{formatARS(pricing.cashReceived)}</span>
                </div>
              )}
              {pricing?.change != null && (
                <div className="flex justify-between">
                  <span>Vuelto</span>
                  <span>{formatARS(pricing.change)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Entrega</span>
                <span>{delivery}</span>
              </div>
              {cancelled && (
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
            {confirmed && !cancelled && (
              <div className="mt-3 text-xs text-success">
                ✓ Venta {receiptNumber} confirmada.{" "}
                {delivery === "Entregado"
                  ? "Stock actualizado."
                  : "Stock reservado hasta la entrega."}
              </div>
            )}
            {cancelled && (
              <div className="mt-3 text-xs text-destructive">
                ✕ Venta {receiptNumber} anulada. Stock devuelto al inventario.
                <div className="text-muted-foreground mt-1">
                  Motivo: {cancelled.reason}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertDialog
        open={confirmNegativeStock}
        onOpenChange={setConfirmNegativeStock}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar stock negativo</AlertDialogTitle>
            <AlertDialogDescription>
              Esta venta dejará productos con stock disponible negativo. Si
              confirmás, el stock se actualizará igual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-sm">
            {negativeStockWarnings.map((warning) => (
              <div
                key={warning.productId}
                className="rounded-md border border-border bg-muted/40 px-3 py-2"
              >
                <div className="font-medium">{warning.productName}</div>
                <div className="text-xs text-muted-foreground">
                  Disponible: {warning.availableStock}. Venta:{" "}
                  {warning.requestedQty}. Quedará: {warning.resultingStock}.
                </div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canSubmitQuotedSale || createSaleMutation.isPending}
              onClick={() => void submitSale(true)}
            >
              Confirmar venta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vaciar carrito</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán los {lines.length} ítems del carrito. La venta no se
              llegó a confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={clearCart}>Vaciar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmCancel}
        onOpenChange={(o) => {
          setConfirmCancel(o);
          if (!o) setCancelReason("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular venta {receiptNumber}</AlertDialogTitle>
            <AlertDialogDescription>
              Se devolverá el stock al inventario y la venta quedará marcada
              como anulada. El comprobante no se borra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-1">
            <Label className="text-xs text-muted-foreground">
              Motivo de la anulación
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
            <AlertDialogAction onClick={annulSale}>
              <XCircle /> Anular venta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", muted && "text-muted-foreground")}>
        {value}
      </span>
    </div>
  );
}

function enrichComboStock(
  combo: Combo,
  stockByProductId: Map<string, Product>,
): Combo {
  return {
    ...combo,
    items: combo.items.map((item) => {
      const stockProduct = stockByProductId.get(item.productId);

      return {
        ...item,
        stock: stockProduct?.stock ?? item.stock,
        availableStock: stockProduct?.availableStock ?? item.availableStock,
      };
    }),
  };
}

function findCatalogItemByBarcode(
  items: SaleCatalogItem[],
  barcode: string,
):
  | { itemType: "Product"; item: Product }
  | { itemType: "Combo"; item: Combo }
  | undefined {
  const normalized = barcode.trim();
  const item = items.find((candidate) => candidate.barcode === normalized);

  if (!item) {
    return undefined;
  }

  return item.itemType === "Combo"
    ? { itemType: "Combo", item }
    : { itemType: "Product", item };
}

function getPaymentMethodIcon(name: string) {
  const normalized = name.toLowerCase();

  if (normalized.includes("efectivo")) {
    return <Banknote className="h-4 w-4" />;
  }

  if (
    normalized.includes("tarjeta") ||
    normalized.includes("credito") ||
    normalized.includes("crédito") ||
    normalized.includes("debito") ||
    normalized.includes("débito")
  ) {
    return <CreditCard className="h-4 w-4" />;
  }

  return <Wallet className="h-4 w-4" />;
}

function PagoBtn({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center gap-1 py-3 rounded-md border text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-muted-foreground hover:bg-muted",
        disabled && "opacity-60 cursor-not-allowed hover:bg-transparent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
