import { SaleAttemptRecovery } from "@/components/sale-attempt-recovery";
import { ApiError } from "@/lib/api-client";
import {
  getPersistedWholesaleSaleAttempt,
  resolveWholesaleSaleAttempt,
  releaseWholesaleSaleAttempt,
} from "@/lib/sale-wholesale-attempt";
import { priceListsRepository } from "@/lib/repositories/price-lists-repository";
import { pricingContextLabel } from "@/lib/price-lists";
import { getResolvedItemPrice, hasCurrentPricing } from "@/lib/sale-wholesale";
import {
  SaleFinanceFields,
  type FinanceDraft,
} from "@/components/sale-finance-fields";
import { SaleCustomerFields } from "@/components/sale-customer-fields";
import { Card, CardToolbar } from "@/components/ui/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import {
  createEmptySaleDraft,
  useSaleDraft,
} from "@/components/sale-draft-context";
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
  type SaleQuote,
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
  isSalePriceChanged,
  setLineQuantity,
  type Line,
} from "@/lib/sale-cart";
import { buildSaleQuoteKey, parseOptionalCashInput } from "@/lib/sale-checkout";
import { basisPointsToPercentInput } from "@/lib/payment-pricing";
import { resolveSelectedPaymentMethodId } from "@/lib/payment-methods";
import {
  getSaleFinanceIssue,
  getSalePaymentMethods,
  nextMonthlyDueDate,
} from "@/lib/sale-finance-validation";
import type { CreateSaleInput } from "@/lib/repositories/sales-repository";
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
import { printReceiptBySaleId } from "@/lib/desktop-printer";
import {
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  FilePlus2,
  LoaderCircle,
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
  const { draft, setDraft } = useSaleDraft();
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
      setDraft(createEmptySaleDraft());
      void queryClient.invalidateQueries({ queryKey: ["sales"] });
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({ queryKey: ["history"] });
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
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({ queryKey: ["history"] });
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
  const [search, setSearch] = useState(draft.search);
  const [lines, setLines] = useState<Line[]>(draft.lines);
  const [activeLineProductId, setActiveLineProductId] = useState<string | null>(
    draft.activeLineProductId,
  );
  const [paymentMethodId, setPaymentMethodId] = useState(draft.paymentMethodId);
  const [delivery, setDelivery] = useState<"Entregado" | "Pendiente">(
    draft.delivery,
  );
  const [couponInput, setCouponInput] = useState(draft.couponInput);
  const [appliedCouponCode, setAppliedCouponCode] = useState(
    draft.appliedCouponCode,
  );
  const [cashReceivedInput, setCashReceivedInput] = useState(
    draft.cashReceivedInput,
  );
  const [customerName, setCustomerName] = useState(draft.customerName);
  const [customerPhone, setCustomerPhone] = useState(draft.customerPhone);
  const [financeDraft, setFinanceDraft] = useState<FinanceDraft>(() => ({
    customerId: draft.customerId,
    paymentTerms: draft.paymentTerms,
    directPlan: draft.directPlan,
    cardPlan: { ...draft.cardPlan, settlements: [] },
    operationId: draft.operationId,
    operationFingerprint: draft.operationFingerprint,
  }));
  const [financeMoneyValid, setFinanceMoneyValid] = useState(true);
  const directSale = financeDraft.paymentTerms === "DirectInstallments";
  const financeInput = {
    customerId: financeDraft.customerId || undefined,
    paymentTerms: financeDraft.paymentTerms,
    directPlan: directSale ? financeDraft.directPlan : undefined,
    cardPlan:
      financeDraft.paymentTerms === "CardInstallments"
        ? financeDraft.cardPlan
        : undefined,
  };
  const [financeFieldsKey, setFinanceFieldsKey] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedSale, setConfirmedSale] = useState<Sale | null>(null);
  const [cancelled, setCancelled] = useState<{ reason: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmNegativeStock, setConfirmNegativeStock] = useState(false);
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [saleError, setSaleError] = useState<string | null>(null);
  const [pricingRevision, setPricingRevision] = useState(0);
  const [uncertainAttempt, setUncertainAttempt] = useState(
    Boolean(draft.operationFingerprint),
  );
  const pendingRecovery = uncertainAttempt
    ? getPersistedWholesaleSaleAttempt(financeDraft)
    : null;
  const inputRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const receiptNumber = confirmedSale?.number ?? "000000";

  const locked = confirmed;
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const availablePaymentMethods = useMemo(
    () =>
      getSalePaymentMethods(
        settingsQuery.data?.paymentMethods ?? [],
        financeDraft.paymentTerms,
      ),
    [settingsQuery.data?.paymentMethods, financeDraft.paymentTerms],
  );
  const selectedPaymentMethod = availablePaymentMethods.find(
    (method) => method.id === paymentMethodId,
  );
  const paymentLabel = directSale
    ? "Cuotas directas"
    : (selectedPaymentMethod?.name ?? "");
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
  const previewInput = {
    customerId: financeDraft.customerId || undefined,
    items: quoteLines,
    catalogItems: saleCatalogItems.map((item) => ({
      itemType: item.itemType,
      itemId: item.id,
    })),
  };
  const previewQuery = useQuery({
    queryKey: ["price-preview", previewInput],
    queryFn: () => priceListsRepository.preview(previewInput),
    enabled:
      !locked &&
      !pendingRecovery &&
      productsQuery.isSuccess &&
      combosQuery.isSuccess,
    placeholderData: (previous) => previous,
    retry: false,
  });
  const previewReady = hasCurrentPricing(previewQuery);
  const quoteAllowsNegativeStock = negativeStockWarnings.length > 0;
  let cashReceivedAmountCents: number | undefined;
  let cashInputError: string | null = null;
  if (!directSale && selectedPaymentMethod?.cashHandling) {
    try {
      cashReceivedAmountCents = parseOptionalCashInput(cashReceivedInput);
    } catch {
      cashInputError = "Ingresá un importe válido en dinero recibido.";
    }
  }
  const priceInput = {
    customerId: financeDraft.customerId || undefined,
    pricingOnly: true,
    paymentTerms: financeDraft.paymentTerms,
    directSurchargeBasisPoints: directSale
      ? (financeDraft.directPlan.surchargeBasisPoints ?? 0)
      : undefined,
    items: quoteLines,
    paymentMethodId: directSale ? undefined : paymentMethodId,
    deliveryStatus: delivery,
    allowNegativeStock: quoteAllowsNegativeStock,
    couponCode: appliedCouponCode || undefined,
  };
  const priceQuery = useQuery({
    queryKey: [
      "sale-price",
      priceInput,
      previewQuery.data?.fingerprint,
      pricingRevision,
    ],
    queryFn: () => salesRepository.quote(priceInput),
    enabled:
      !locked &&
      !pendingRecovery &&
      previewReady &&
      quoteLines.length > 0 &&
      (directSale || Boolean(selectedPaymentMethod)) &&
      Number.isInteger(priceInput.directSurchargeBasisPoints ?? 0) &&
      (priceInput.directSurchargeBasisPoints ?? 0) >= 0 &&
      (priceInput.directSurchargeBasisPoints ?? 0) <= 100000,
    placeholderData: (previous) => previous,
    retry: false,
  });
  const totalAmountCents =
    priceQuery.data && !priceQuery.isPlaceholderData
      ? Math.round(priceQuery.data.total * 100)
      : undefined;
  const financeIssue = getSaleFinanceIssue({
    ...financeDraft,
    paymentMethodId,
    methods: settingsQuery.data?.paymentMethods ?? [],
    totalAmountCents,
    moneyValid: financeMoneyValid,
  });
  const financeReady = financeIssue === null;
  const quoteQuery = useQuery({
    queryKey: [
      ...buildSaleQuoteKey({
        ...financeInput,
        lines: quoteLines,
        paymentMethodId,
        couponCode: appliedCouponCode,
        cashReceivedInput,
        deliveryStatus: delivery,
        allowNegativeStock: quoteAllowsNegativeStock,
      }),
      previewQuery.data?.fingerprint,
      pricingRevision,
    ],
    queryFn: () =>
      salesRepository.quote({
        ...financeInput,
        items: quoteLines,
        paymentMethodId: directSale ? undefined : paymentMethodId,
        deliveryStatus: delivery,
        allowNegativeStock: quoteAllowsNegativeStock,
        couponCode: appliedCouponCode || undefined,
        cashReceivedAmountCents,
      }),
    enabled:
      !locked &&
      !pendingRecovery &&
      previewReady &&
      quoteLines.length > 0 &&
      financeReady &&
      !cashInputError &&
      totalAmountCents !== undefined &&
      !priceQuery.isFetching &&
      !priceQuery.error,
    placeholderData: (previous) => previous,
    retry: false,
  });
  const resolvedSnapshot = confirmedSale
    ? confirmedSale.pricingSnapshot
    : (quoteQuery.data?.pricing ?? previewQuery.data);
  const displayLines = lines.map((line) => {
    const confirmedItem = confirmedSale?.items.find(
      (item) =>
        (item.itemType ?? "Product") === line.product.itemType &&
        (item.comboId ?? item.productId) === line.product.id,
    );
    const resolved = getResolvedItemPrice(
      resolvedSnapshot?.lines,
      line.product.itemType,
      line.product.id,
    );
    const product = {
      ...line.product,
      name: confirmedItem?.name ?? line.product.name,
      price: confirmedItem?.price ?? resolved?.price ?? line.product.price,
    };
    if (product.itemType === "Combo" && confirmedItem?.components)
      product.items = confirmedItem.components.map((item) => ({
        ...item,
        qty: item.qty / confirmedItem.qty,
      }));
    return {
      ...line,
      qty: confirmedItem?.qty ?? line.qty,
      product,
      habitualPrice: resolved?.habitualPrice ?? line.product.price,
    };
  });
  const effectivePrice = (item: SaleCatalogItem) =>
    getResolvedItemPrice(
      previewQuery.data?.catalogPrices,
      item.itemType,
      item.id,
    );
  const confirmedPricing = confirmedSale
    ? {
        pricing: confirmedSale.pricingSnapshot ?? undefined,
        finance: confirmedSale.finance,
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
  const pricing: SaleQuote | null | undefined =
    confirmedPricing ??
    (lines.length > 0
      ? ((financeReady ? quoteQuery.data : undefined) ?? priceQuery.data)
      : undefined);
  const cashInputMissing =
    !directSale &&
    selectedPaymentMethod?.cashHandling === true &&
    cashReceivedInput.trim().length === 0;
  const canSubmitQuotedSale = canConfirmQuotedSale({
    hasLines: lines.length > 0,
    hasPaymentMethod: financeReady && (directSale || Boolean(paymentMethodId)),
    quotePending:
      quoteQuery.isFetching || priceQuery.isFetching || !previewReady,
    quoteError: Boolean(
      quoteQuery.error ||
      priceQuery.error ||
      previewQuery.error ||
      cashInputError,
    ),
    quoteAvailable:
      Boolean(quoteQuery.data?.pricing?.fingerprint) &&
      !quoteQuery.isPlaceholderData &&
      !priceQuery.isPlaceholderData &&
      previewReady &&
      !cashInputMissing &&
      financeMoneyValid &&
      financeReady &&
      totalAmountCents !== undefined,
    cashShortfall: quoteQuery.data?.cashShortfall ?? 0,
  });
  const quoteError = previewQuery.error ?? priceQuery.error ?? quoteQuery.error;
  const quoteErrorMessage = quoteError
    ? getSaleCreationErrorMessage(quoteError)
    : null;
  const quoteBlockingMessage =
    lines.length === 0
      ? "Agregá al menos un producto para empezar."
      : (financeIssue ??
        cashInputError ??
        (cashInputMissing
          ? "Ingresá el dinero recibido para calcular el vuelto."
          : (quoteErrorMessage ??
            ((quoteQuery.data?.cashShortfall ?? 0) > 0
              ? `Faltan ${formatARS(quoteQuery.data?.cashShortfall ?? 0)} para completar la venta.`
              : quoteQuery.isFetching || priceQuery.isFetching || !previewReady
                ? "Calculando el total y las condiciones de la venta..."
                : !quoteQuery.data
                  ? "No se pudo obtener el total final. Revisá los datos e intentá nuevamente."
                  : null))));

  useEffect(() => {
    if (confirmed) return;

    setDraft({
      ...financeDraft,
      search,
      lines,
      activeLineProductId,
      paymentMethodId,
      delivery,
      couponInput,
      appliedCouponCode,
      cashReceivedInput,
      customerName,
      customerPhone,
    });
  }, [
    financeDraft,
    search,
    lines,
    activeLineProductId,
    paymentMethodId,
    delivery,
    couponInput,
    appliedCouponCode,
    cashReceivedInput,
    customerName,
    customerPhone,
    confirmed,
    setDraft,
  ]);

  useEffect(() => {
    if (locked || pendingRecovery || directSale) return;
    setPaymentMethodId((current) =>
      availablePaymentMethods.some((method) => method.id === current)
        ? current
        : (availablePaymentMethods[0]?.id ?? ""),
    );
  }, [availablePaymentMethods, directSale, locked, pendingRecovery]);

  const changePaymentTerms = (paymentTerms: FinanceDraft["paymentTerms"]) => {
    setFinanceDraft((current) => ({
      ...current,
      paymentTerms,
      directPlan:
        paymentTerms === "DirectInstallments" &&
        !current.directPlan.firstDueDate
          ? { ...current.directPlan, firstDueDate: nextMonthlyDueDate() }
          : current.directPlan,
    }));
    setCashReceivedInput("");
    setSaleError(null);
  };

  const resetSale = () => {
    setFinanceDraft(createEmptySaleDraft());
    setFinanceMoneyValid(true);
    setFinanceFieldsKey((key) => key + 1);
    setLines([]);
    setActiveLineProductId(null);
    setConfirmed(false);
    setConfirmedSale(null);
    setCancelled(null);
    setSaleError(null);
    setUncertainAttempt(false);
    setIsPrintingReceipt(false);
    setConfirmNegativeStock(false);
    setCouponInput("");
    setAppliedCouponCode("");
    setCashReceivedInput("");
    setCustomerName("");
    setCustomerPhone("");
    setDelivery("Entregado");
    setPaymentMethodId(
      resolveSelectedPaymentMethodId(
        "",
        settingsQuery.data?.paymentMethods ?? [],
      ),
    );
    setSearch("");
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
    () =>
      filterSaleCatalogItems(
        saleCatalogItems.filter(
          (item) =>
            previewReady &&
            Boolean(
              getResolvedItemPrice(
                previewQuery.data?.catalogPrices,
                item.itemType,
                item.id,
              ),
            ),
        ),
        search,
      ),
    [saleCatalogItems, search, previewReady, previewQuery.data],
  );

  useEffect(() => {
    const handleQuantityShortcut = (event: KeyboardEvent) => {
      if (
        locked ||
        pendingRecovery ||
        createSaleMutation.isPending ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;

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
  }, [
    activeLineProductId,
    lines,
    locked,
    pendingRecovery,
    createSaleMutation.isPending,
  ]);

  const acceptConfirmedSale = (sale: Sale) => {
    setUncertainAttempt(false);
    setConfirmedSale(sale);
    setFinanceDraft((current) => ({
      ...current,
      customerId: sale.customerId ?? current.customerId,
    }));
    setCustomerName(sale.customerName ?? "");
    setCustomerPhone(sale.customerPhone ?? "");
    setConfirmed(true);
    setConfirmNegativeStock(false);
    setCouponInput("");
    setAppliedCouponCode("");
    setCashReceivedInput("");
    toast.success(`Venta ${sale.number} confirmada.`);
  };
  const handleSaleFailure = (error: unknown) => {
    const definitiveRejection =
      error instanceof ApiError && error.status >= 400 && error.status < 500;
    if (definitiveRejection) {
      setFinanceDraft((current) => ({
        ...current,
        ...releaseWholesaleSaleAttempt(),
      }));
      setUncertainAttempt(false);
      if (isSalePriceChanged(error)) {
        setPricingRevision((revision) => revision + 1);
        void previewQuery.refetch();
      }
    } else {
      setUncertainAttempt(true);
    }
    const message = getSaleCreationErrorMessage(error);
    setSaleError(message);
    toast.error(message);
    inputRef.current?.focus();
  };
  const recoverSale = async (payload: CreateSaleInput) => {
    setSaleError(null);
    try {
      const sale = await createSaleMutation.mutateAsync(payload);
      acceptConfirmedSale(sale);
      return sale;
    } catch (error) {
      handleSaleFailure(error);
    }
  };
  if (pendingRecovery && !locked) {
    return (
      <AppShell
        title="Nueva venta"
        subtitle="Comprobá el resultado de la venta anterior"
      >
        <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div
            className="min-w-0 xl:col-start-2"
            role="region"
            aria-label="Resumen de venta"
          >
            <SaleAttemptRecovery
              payload={pendingRecovery}
              pending={createSaleMutation.isPending}
              error={saleError}
              onRecover={recoverSale}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  if (
    !locked &&
    (productsQuery.isLoading ||
      combosQuery.isLoading ||
      settingsQuery.isLoading ||
      stockQuery.isLoading)
  ) {
    return (
      <AppShell
        title="Nueva venta"
        subtitle="Escaneá un código o buscá el producto"
      >
        <Card className="app-card-body text-sm text-muted-foreground">
          Cargando productos...
        </Card>
      </AppShell>
    );
  }

  if (
    !locked &&
    (productsQuery.error ||
      combosQuery.error ||
      settingsQuery.error ||
      stockQuery.error)
  ) {
    return (
      <AppShell
        title="Nueva venta"
        subtitle="Escaneá un código o buscá el producto"
      >
        <Card className="app-card-body text-sm text-destructive">
          No se pudo cargar la venta.
        </Card>
      </AppShell>
    );
  }

  if (!locked && !settingsQuery.data) {
    return (
      <AppShell
        title="Nueva venta"
        subtitle="Escaneá un código o buscá el producto"
      >
        <Card className="app-card-body text-sm text-destructive">
          No se pudo cargar la configuración de venta.
        </Card>
      </AppShell>
    );
  }

  const receiptHeaderLines = settingsQuery.data
    ? buildReceiptHeaderLines(settingsQuery.data)
    : ["Comprobante de venta"];
  const receiptFooter = getReceiptFooter(
    settingsQuery.data?.receipt ?? { header: "", footer: "" },
  );

  const addProduct = (p: SaleCatalogItem) => {
    if (locked) return;
    if (!previewReady || !effectivePrice(p)) {
      toast.error("El producto o combo no está disponible para esta venta.");
      return;
    }
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

  const submitCatalogSearch = async () => {
    const query = search.trim();
    if (!query || locked) return;

    const barcodeMatch = findCatalogItemByBarcode(saleCatalogItems, query);
    if (!barcodeMatch && filtered.length > 0) {
      if (filtered.length === 1) {
        addProduct(filtered[0]);
        setSearch("");
      }
      return;
    }

    try {
      const found =
        (await catalogRepository.findByBarcode(query)) ?? barcodeMatch;
      if (found) {
        addProduct(
          found.itemType === "Combo"
            ? enrichComboStock(
                found.item,
                new Map(
                  (stockQuery.data ?? []).map((product) => [
                    product.id,
                    product,
                  ]),
                ),
              )
            : (saleProducts.find((product) => product.id === found.item.id) ??
                found.item),
        );
      } else {
        toast.error("Producto o combo no encontrado.");
      }
      setSearch((current) => (current.trim() === query ? "" : current));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo buscar el producto o combo. Intentá nuevamente.",
      );
    }
    inputRef.current?.focus();
  };

  const handleCatalogSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void submitCatalogSearch();
  };

  const submitSale = async (allowNegativeStock: boolean) => {
    if (lines.length === 0) return;
    if (!directSale && !paymentMethodId) {
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
      const payload: CreateSaleInput = {
        ...financeInput,
        expectedPricingFingerprint: quoteQuery.data?.pricing?.fingerprint,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        paymentMethodId: directSale ? undefined : paymentMethodId,
        deliveryStatus: delivery,
        items: quoteLines,
        allowNegativeStock,
        couponCode: appliedCouponCode || undefined,
        cashReceivedAmountCents,
      };
      const attempt = resolveWholesaleSaleAttempt(financeDraft, payload);
      setFinanceDraft((current) => ({
        ...current,
        operationId: attempt.operationId,
        operationFingerprint: attempt.operationFingerprint,
      }));
      const sale = await createSaleMutation.mutateAsync(attempt.payload);
      acceptConfirmedSale(sale);
    } catch (error) {
      handleSaleFailure(error);
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

  return (
    <AppShell
      title="Nueva venta"
      subtitle="Escaneá un código o buscá el producto"
    >
      <fieldset
        disabled={createSaleMutation.isPending}
        className="grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 items-start pb-20 xl:pb-0"
      >
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <form onSubmit={handleCatalogSearch} className="app-card-body">
              <div className="relative">
                <ScanLine className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-accent" />
                <Input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (isScannerSubmitKey(e.key)) {
                      e.preventDefault();
                      void submitCatalogSearch();
                    }
                  }}
                  aria-label="Buscar producto o combo por nombre o código"
                  placeholder="Escaneá un código o buscá por nombre"
                  className="h-14 pl-12 text-base placeholder:text-muted-foreground"
                  autoComplete="off"
                  disabled={locked}
                  autoFocus
                />
                {!locked && filtered.length > 0 && (
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
                          {formatARS(effectivePrice(p)?.price ?? p.price)}
                          {effectivePrice(p) &&
                          effectivePrice(p)!.price !==
                            effectivePrice(p)!.habitualPrice ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              Habitual{" "}
                              {formatARS(effectivePrice(p)!.habitualPrice)}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </form>
          </Card>

          <Card className="overflow-hidden">
            <CardToolbar className="flex items-center justify-between gap-3">
              <h2 className="font-semibold app-card-title">
                Carrito ({lines.length})
              </h2>
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
            </CardToolbar>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-sm text-foreground border-b border-border bg-card">
                  <tr>
                    <th className="app-table-heading font-medium">Producto</th>
                    <th className="app-table-heading font-medium text-center w-32">
                      Cantidad
                    </th>
                    <th className="app-table-heading font-medium text-right w-32">
                      Precio
                    </th>
                    <th className="app-table-heading font-medium text-right w-32">
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
                        Escaneá un código o buscá por nombre para comenzar.
                      </td>
                    </tr>
                  )}
                  {displayLines.map((l) => {
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
                          {l.habitualPrice !== l.product.price ? (
                            <span className="block text-xs text-muted-foreground">
                              Habitual {formatARS(l.habitualPrice)}
                            </span>
                          ) : null}
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
          </Card>
        </div>

        <div
          ref={summaryRef}
          className="flex min-w-0 flex-col gap-5"
          role="region"
          aria-label="Resumen de venta"
        >
          <Card className="app-card-body">
            <h2 className="font-semibold mb-3 app-card-title">
              Resumen de venta
            </h2>
            <div className="space-y-2 text-sm">
              {uncertainAttempt && !locked ? (
                <p role="status" className="text-sm text-muted-foreground">
                  No se recibió una respuesta de la venta. Al reintentar se
                  comprobará la misma operación con sus importes originales para
                  evitar duplicados, si mantenés los datos de la venta.
                </p>
              ) : null}
              <p
                className="text-xs text-muted-foreground"
                aria-label="Lista y escala de venta"
              >
                {pricingContextLabel(
                  confirmedSale
                    ? confirmedSale.pricingSnapshot
                    : previewQuery.data,
                )}
              </p>
              {!locked &&
              (previewQuery.isFetching ||
                priceQuery.isFetching ||
                quoteQuery.isFetching ||
                previewQuery.isPlaceholderData ||
                priceQuery.isPlaceholderData ||
                quoteQuery.isPlaceholderData) ? (
                <p role="status" className="text-xs text-muted-foreground">
                  Recalculando...
                </p>
              ) : null}
              <Row
                label="Subtotal"
                value={formatARS(pricing?.subtotal ?? subtotal)}
              />
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
                <span
                  className="font-semibold tabular-nums"
                  data-testid="sale-total"
                >
                  {formatARS(pricing?.total ?? subtotal)}
                </span>
              </div>
              {directSale && pricing ? (
                <div className="space-y-2 border-t border-border pt-3">
                  <Row
                    label="Anticipo"
                    value={formatARS(
                      (financeDraft.directPlan.upfrontAmountCents ?? 0) / 100,
                    )}
                  />
                  <Row
                    label="Saldo en cuotas"
                    value={formatARS(
                      pricing.total -
                        (financeDraft.directPlan.upfrontAmountCents ?? 0) / 100,
                    )}
                  />
                </div>
              ) : null}
              {pricing?.finance?.paymentTerms === "DirectInstallments" ? (
                <p className="text-xs text-muted-foreground">
                  {pricing.finance.installments.length} cuotas mensuales ·
                  primer vencimiento {pricing.finance.installments[0]?.dueDate}
                </p>
              ) : pricing?.finance?.cardPlan ? (
                <p className="text-xs text-muted-foreground">
                  {pricing.finance.cardPlan.installmentCount} cuotas con tarjeta
                  · {pricing.finance.cardPlan.processor}
                </p>
              ) : null}
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

            {!locked ? (
              <section
                className="mt-5 space-y-4 border-t border-border pt-4"
                aria-labelledby="sale-payment-title"
              >
                <div>
                  <h3 id="sale-payment-title" className="text-sm font-semibold">
                    Cliente y forma de pago
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Elegí cómo se paga esta venta y completá los datos
                    correspondientes.
                  </p>
                </div>
                <fieldset
                  disabled={createSaleMutation.isPending}
                  className="min-w-0 space-y-4"
                >
                  <fieldset className="space-y-2">
                    <legend className="mb-2 text-sm font-medium">
                      Condición de pago
                    </legend>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          [
                            "Immediate",
                            "Contado",
                            "Cobrás el total ahora",
                            Banknote,
                          ],
                          [
                            "DirectInstallments",
                            "Cuotas directas",
                            "El cliente te paga cada mes",
                            Wallet,
                          ],
                          [
                            "CardInstallments",
                            "Cuotas con tarjeta",
                            "El procesador te acredita",
                            CreditCard,
                          ],
                        ] as const
                      ).map(([term, label, description, Icon]) => (
                        <label
                          key={term}
                          className={cn(
                            "relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border px-2 py-3 text-center text-xs transition-colors focus-within:ring-2 focus-within:ring-ring",
                            financeDraft.paymentTerms === term
                              ? "border-accent bg-accent/5 ring-1 ring-accent"
                              : "border-border hover:bg-muted/50",
                          )}
                        >
                          <input
                            type="radio"
                            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                            name="paymentTerms"
                            value={term}
                            checked={financeDraft.paymentTerms === term}
                            onChange={() => changePaymentTerms(term)}
                            aria-label={label}
                          />
                          <span className="flex flex-col items-center gap-1.5 font-medium">
                            <Icon className="h-4 w-4 shrink-0" />
                            {label}
                          </span>
                          <span className="sr-only">{description}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {directSale
                        ? "El cliente te paga cada mes."
                        : financeDraft.paymentTerms === "CardInstallments"
                          ? "El procesador acredita el dinero al negocio."
                          : "Cobrás el total de la venta ahora."}
                    </p>
                  </fieldset>
                  <div className="border-t border-border pt-4">
                    <SaleCustomerFields
                      key={financeFieldsKey}
                      customerId={financeDraft.customerId}
                      name={customerName}
                      phone={customerPhone}
                      required={directSale}
                      onSelect={(id, name, phone) => {
                        setFinanceDraft((current) => ({
                          ...current,
                          customerId: id,
                        }));
                        setCustomerName(name);
                        setCustomerPhone(phone);
                      }}
                      onDetailsChange={(name, phone) => {
                        setCustomerName(name);
                        setCustomerPhone(phone);
                      }}
                    />
                  </div>
                  {!directSale ? (
                    <div className="space-y-3 border-t border-border pt-4">
                      <h3 className="text-sm font-medium">
                        {financeDraft.paymentTerms === "CardInstallments"
                          ? "Tarjeta / medio habilitado para cuotas"
                          : "Medio de pago"}
                      </h3>
                      {availablePaymentMethods.length === 0 ? (
                        <p className="rounded-md bg-warning/10 p-3 text-sm">
                          {financeDraft.paymentTerms === "CardInstallments"
                            ? "Habilitá un medio que admita cuotas en Configuración."
                            : "Activá al menos un medio de pago en Configuración."}
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {availablePaymentMethods.map((method) => (
                            <PagoBtn
                              key={method.id}
                              icon={getPaymentMethodIcon(method.name)}
                              label={method.name}
                              active={paymentMethodId === method.id}
                              onClick={() => {
                                if (paymentMethodId === method.id) return;
                                setPaymentMethodId(method.id);
                                setCashReceivedInput("");
                                setSaleError(null);
                              }}
                              disabled={createSaleMutation.isPending}
                            />
                          ))}
                        </div>
                      )}
                      {!directSale && selectedPaymentMethod?.cashHandling && (
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
                  ) : null}
                  <SaleFinanceFields
                    key={`finance-${financeFieldsKey}`}
                    value={financeDraft}
                    onChange={setFinanceDraft}
                    onValidityChange={setFinanceMoneyValid}
                    methods={settingsQuery.data?.paymentMethods ?? []}
                    preview={
                      financeReady &&
                      !quoteQuery.isFetching &&
                      !quoteQuery.error
                        ? quoteQuery.data?.finance
                        : undefined
                    }
                  />
                </fieldset>
              </section>
            ) : null}

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
                      {priceQuery.isFetching
                        ? `Validando ${appliedCouponCode}...`
                        : priceQuery.data?.couponCode === appliedCouponCode
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

            {!locked && quoteBlockingMessage ? (
              <div
                id="sale-confirmation-issue"
                role="status"
                className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
              >
                {quoteBlockingMessage}
              </div>
            ) : null}
            {!locked && priceQuery.isFetching && lines.length > 0 ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                Actualizando total...
              </p>
            ) : null}
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
                  aria-describedby={
                    quoteBlockingMessage ? "sale-confirmation-issue" : undefined
                  }
                  onClick={() => void confirmSale()}
                  disabled={
                    !canSubmitQuotedSale || createSaleMutation.isPending
                  }
                >
                  {createSaleMutation.isPending
                    ? "Confirmando..."
                    : "Confirmar venta"}
                </Button>
              )}
              {locked && !cancelled && (
                <>
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
            </div>
          </Card>

          {locked ? (
            <Card className="app-card-body">
              <h2 className="mb-3 app-card-title font-semibold">
                Comprobante de venta
              </h2>
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
                  <span>{formatReceiptDateTimeAR(confirmedSale?.date)}</span>
                </div>
                <div className="border-t border-dashed border-border my-2" />
                <p>
                  {pricingContextLabel(
                    confirmedSale
                      ? confirmedSale.pricingSnapshot
                      : previewQuery.data,
                  )}
                </p>
                {displayLines.map((l) => {
                  const product = l.product;
                  const showComboComponents =
                    product.itemType === "Combo" &&
                    settingsQuery.data?.comboTicketMode ===
                      "ComboWithComponents";

                  return (
                    <div
                      key={getCartItemKey(l.product)}
                      className="space-y-0.5"
                    >
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
                {pricing?.finance?.paymentTerms === "DirectInstallments" ? (
                  <div className="my-2 border-y border-dashed border-border py-2">
                    <div>
                      Anticipo:{" "}
                      {formatARS(pricing.finance.upfrontAmountCents / 100)}
                    </div>
                    <div>
                      Saldo en cuotas:{" "}
                      {formatARS(pricing.finance.financedAmountCents / 100)}
                    </div>
                    {pricing.finance.installments.map((item) => (
                      <div key={item.number}>
                        Cuota {item.number} · {item.dueDate} ·{" "}
                        {formatARS(item.amountCents / 100)}
                      </div>
                    ))}
                  </div>
                ) : pricing?.finance?.cardPlan ? (
                  <div className="my-2 border-y border-dashed border-border py-2">
                    {pricing.finance.cardPlan.installmentCount} cuotas con
                    tarjeta · {pricing.finance.cardPlan.processor}
                  </div>
                ) : null}
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
            </Card>
          ) : null}
        </div>
      </fieldset>

      {!locked ? (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-6 py-3 backdrop-blur xl:hidden">
          <div className="text-sm">
            <span className="text-muted-foreground">Total de la venta</span>
            <div className="text-lg font-semibold tabular-nums">
              {formatARS(pricing?.total ?? subtotal)}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              summaryRef.current?.scrollIntoView({ block: "start" })
            }
          >
            Ver resumen
          </Button>
        </div>
      ) : null}

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
      aria-pressed={active}
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
