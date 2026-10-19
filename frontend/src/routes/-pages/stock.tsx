import { StockPurchaseDialog } from "@/components/stock-purchase-dialog";
import { StockCreditTable } from "@/components/stock-credit-table";
import { StockClassificationDialog } from "@/components/stock-classification-dialog";
import { money } from "@/lib/collections-form";
import { Card, CardHeader, CardToolbar, KpiCard } from "@/components/ui/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type Product, type StockMovement } from "@/lib/contracts";
import { getMutationErrorMessage } from "@/lib/mutation-errors";
import { invalidateInventoryQueries } from "@/lib/inventory-cache";
import {
  canShowLess,
  canShowMore,
  getNextVisibleCount,
  getVisibleItems,
  PAGE_LIST_INCREMENT,
} from "@/lib/visible-items";
import {
  productsRepository,
  stockRepository,
  type StockAdjustmentInput,
} from "@/lib/repositories";
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
  ArrowDown,
  ArrowUp,
  Boxes,
  Check,
  ChevronsUpDown,
  Info,
  Package,
  PackageCheck,
  Search,
  Settings2,
  Undo2,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ADJUST_TYPES = [
  {
    value: "Egreso manual",
    sign: "-",
    help: "Resta unidades del stock físico.",
  },
  {
    value: "Conteo físico",
    sign: "=",
    help: "Reemplaza el stock físico por el conteo indicado.",
  },
] as const;

type AdjustType = (typeof ADJUST_TYPES)[number]["value"];

export function StockPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [classifying, setClassifying] = useState<Product | null>(null);
  const [increase, setIncrease] = useState<{
    productId: string | null;
    qty?: number;
  } | null>(null);
  const summaryQuery = useQuery({
    queryKey: ["stock", "summary", q.trim()],
    queryFn: () => stockRepository.summary(q.trim() || undefined),
  });
  const [visibleStockCount, setVisibleStockCount] =
    useState(PAGE_LIST_INCREMENT);
  const [visibleMovementsCount, setVisibleMovementsCount] =
    useState(PAGE_LIST_INCREMENT);
  const productsQuery = useQuery({
    queryKey: ["stock", "products"],
    queryFn: () => stockRepository.getPhysicalStock(),
  });
  const movementsQuery = useQuery({
    queryKey: ["stock", "movements"],
    queryFn: () => stockRepository.findAll(),
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [movs, setMovs] = useState<StockMovement[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preselectedId, setPreselectedId] = useState<string | null>(null);
  const [editingMin, setEditingMin] = useState<Product | null>(null);
  const [reverting, setReverting] = useState<StockMovement | null>(null);
  const updateMinStockMutation = useMutation({
    mutationFn: ({ id, minStock }: { id: string; minStock: number }) =>
      productsRepository.updateMinStock(id, minStock),
    onSuccess: () => {
      invalidateInventoryQueries(queryClient);
    },
  });
  const adjustmentMutation = useMutation({
    mutationFn: (input: StockAdjustmentInput) =>
      stockRepository.createAdjustment(input),
    onSuccess: () => {
      invalidateInventoryQueries(queryClient);
    },
  });
  const reverseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      stockRepository.reverseMovement(id, reason),
    onSuccess: () => {
      invalidateInventoryQueries(queryClient);
    },
  });

  useEffect(() => {
    if (productsQuery.data) {
      setProducts(productsQuery.data);
    }
  }, [productsQuery.data]);

  useEffect(() => {
    if (movementsQuery.data) {
      setMovs(movementsQuery.data);
    }
  }, [movementsQuery.data]);

  useEffect(() => {
    setVisibleStockCount(PAGE_LIST_INCREMENT);
  }, [q]);

  const list = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(q.trim().toLowerCase()) ||
          p.barcode.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [products, q],
  );
  const visibleStockProducts = useMemo(
    () => getVisibleItems(list, visibleStockCount),
    [list, visibleStockCount],
  );
  const visibleMovements = useMemo(
    () => getVisibleItems(movs, visibleMovementsCount),
    [movs, visibleMovementsCount],
  );

  if (productsQuery.isLoading || movementsQuery.isLoading) {
    return (
      <AppShell title="Stock" subtitle="Inventario actual y movimientos">
        <Card className="app-card-body text-sm text-muted-foreground">
          Cargando stock...
        </Card>
      </AppShell>
    );
  }

  if (productsQuery.error || movementsQuery.error) {
    return (
      <AppShell title="Stock" subtitle="Inventario actual y movimientos">
        <Card className="app-card-body text-sm text-destructive">
          No se pudo cargar el stock.
        </Card>
      </AppShell>
    );
  }

  const openAdjust = (id: string | null = null) => {
    setPreselectedId(id);
    setDialogOpen(true);
  };

  const applyAdjustment = async (input: StockAdjustmentInput) => {
    try {
      await adjustmentMutation.mutateAsync(input);
      setDialogOpen(false);
      toast.success("Ajuste de stock registrado.");
    } catch (error) {
      toast.error(
        getMutationErrorMessage(
          error,
          "No se pudo registrar el ajuste de stock.",
        ),
      );
    }
  };

  const saveMinStock = async (id: string, min: number) => {
    try {
      const saved = await updateMinStockMutation.mutateAsync({
        id,
        minStock: Math.max(0, min),
      });
      setProducts((arr) =>
        arr.map((p) => (p.id === id ? { ...p, ...saved } : p)),
      );
      setEditingMin(null);
      toast.success("Stock mínimo actualizado.");
    } catch (error) {
      toast.error(
        getMutationErrorMessage(
          error,
          "No se pudo actualizar el stock mínimo.",
        ),
      );
    }
  };

  const reverseMovement = async (m: StockMovement, reason: string) => {
    try {
      await reverseMutation.mutateAsync({ id: m.id, reason });
      setReverting(null);
      toast.success(
        m.sourceType === "StockClassification"
          ? "Clasificación revertida."
          : "Ajuste manual revertido.",
      );
    } catch (error) {
      toast.error(
        getMutationErrorMessage(error, "No se pudo revertir el ajuste."),
      );
    }
  };

  return (
    <AppShell title="Stock" subtitle="Inventario actual y movimientos">
      <section aria-label="Resumen del stock" className="space-y-3">
        <div>
          <h2 className="font-semibold">Tu inventario</h2>
          <p className="text-xs text-muted-foreground">
            Unidades actuales y valor al costo de compra
            {q.trim() ? " de los productos filtrados" : ""}.
          </p>
        </div>
        {summaryQuery.error ? (
          <p role="alert" className="text-sm text-destructive">
            No se pudieron cargar los totales.{" "}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void summaryQuery.refetch()}
            >
              Reintentar
            </Button>
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(
              [
                [
                  "Stock Propio",
                  summaryQuery.data?.paidValueCents,
                  <PackageCheck
                    className="size-4 text-success"
                    aria-hidden="true"
                  />,
                ],
                [
                  "Stock a crédito",
                  summaryQuery.data?.creditValueCents,
                  <Package
                    className="size-4 text-warning-foreground"
                    aria-hidden="true"
                  />,
                ],
                [
                  "Valor Stock",
                  summaryQuery.data?.totalValueCents,
                  <Boxes className="size-4 text-accent" aria-hidden="true" />,
                ],
              ] as const
            ).map(([label, value, icon]) => (
              <KpiCard
                key={label}
                icon={icon}
                label={label}
                value={
                  summaryQuery.isLoading
                    ? "..."
                    : value === undefined
                      ? "—"
                      : money(value)
                }
              />
            ))}
          </div>
        )}
        {(summaryQuery.data?.unclassifiedQty ?? 0) > 0 ? (
          <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
            <strong>
              {summaryQuery.data?.unclassifiedQty} unidades con pago sin indicar
              · {money(summaryQuery.data?.unclassifiedValueCents ?? 0)}
            </strong>
            <p className="mt-1 text-xs text-muted-foreground">
              Incluidas en el total. Indicá si ya las pagaste o todavía las
              debés desde las acciones del producto.
            </p>
          </div>
        ) : null}
      </section>
      <div className="grid grid-cols-1 gap-5">
        <Card>
          <CardHeader
            title="Inventario"
            className="justify-start gap-1"
            action={
              <StockInventoryInfo
                reservedStock={summaryQuery.data?.reservedStock}
                availableStock={summaryQuery.data?.availableStock}
              />
            }
          />
          <CardToolbar className="flex flex-wrap items-center justify-between gap-3 pt-0">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar producto"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setIncrease({ productId: null })}>
                <ArrowUp /> Aumentar stock
              </Button>
              <Button variant="outline" onClick={() => openAdjust(null)}>
                <Settings2 /> Ajustar stock
              </Button>
            </div>
          </CardToolbar>
          <StockCreditTable
            products={visibleStockProducts}
            classify={setClassifying}
            increase={(id) => setIncrease({ productId: id })}
            adjust={(id) => openAdjust(id)}
            minimum={setEditingMin}
          />
          {(canShowMore(visibleStockCount, list.length) ||
            canShowLess(
              visibleStockCount,
              PAGE_LIST_INCREMENT,
              list.length,
            )) && (
            <div className="border-t border-border px-5 py-3 flex justify-center gap-2">
              {canShowMore(visibleStockCount, list.length) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setVisibleStockCount((current) =>
                      getNextVisibleCount(
                        current,
                        PAGE_LIST_INCREMENT,
                        list.length,
                      ),
                    )
                  }
                >
                  Ver m&aacute;s
                </Button>
              )}
              {canShowLess(
                visibleStockCount,
                PAGE_LIST_INCREMENT,
                list.length,
              ) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleStockCount(PAGE_LIST_INCREMENT)}
                >
                  Ver menos
                </Button>
              )}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Movimientos recientes"
            className="border-b border-border"
          />
          <ul className="divide-y divide-border max-h-[640px] overflow-y-auto">
            {visibleMovements.map((m) => {
              const canRevert =
                ((m.sourceType === "ManualAdjustment" && m.type === "Ajuste") ||
                  m.sourceType === "StockClassification") &&
                !m.reversed &&
                !m.reversalOf &&
                (m.canReverse ?? m.sourceType !== "StockClassification");
              return (
                <li
                  key={m.id}
                  className={cn(
                    "px-5 py-3 flex items-start gap-3",
                    m.reversed && "opacity-60",
                  )}
                >
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center mt-0.5 ${m.qty > 0 ? "bg-success/10 text-success" : m.qty < 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}
                  >
                    {m.qty >= 0 ? (
                      <ArrowUp className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {m.productName}
                      {m.reversed && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (anulado)
                        </span>
                      )}
                      {m.reversalOf && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (anulación)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {m.type} - {m.date}
                      {m.note ? ` · ${m.note}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className={`text-sm font-semibold tabular-nums ${m.qty > 0 ? "text-success" : m.qty < 0 ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {m.qty > 0 ? `+${m.qty}` : m.qty}
                    </div>
                    {canRevert && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        aria-label="Anular movimiento"
                        onClick={() => setReverting(m)}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {(canShowMore(visibleMovementsCount, movs.length) ||
            canShowLess(
              visibleMovementsCount,
              PAGE_LIST_INCREMENT,
              movs.length,
            )) && (
            <div className="border-t border-border px-5 py-3 flex justify-center gap-2">
              {canShowMore(visibleMovementsCount, movs.length) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setVisibleMovementsCount((current) =>
                      getNextVisibleCount(
                        current,
                        PAGE_LIST_INCREMENT,
                        movs.length,
                      ),
                    )
                  }
                >
                  Ver m&aacute;s
                </Button>
              )}
              {canShowLess(
                visibleMovementsCount,
                PAGE_LIST_INCREMENT,
                movs.length,
              ) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleMovementsCount(PAGE_LIST_INCREMENT)}
                >
                  Ver menos
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>

      {classifying ? (
        <StockClassificationDialog
          key={classifying.id}
          product={classifying}
          close={() => setClassifying(null)}
        />
      ) : null}
      {increase ? (
        <StockPurchaseDialog
          products={products}
          initialProductId={increase.productId}
          initialQty={increase.qty}
          close={() => setIncrease(null)}
        />
      ) : null}
      <AdjustStockDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        products={products}
        preselectedId={preselectedId}
        onSubmit={applyAdjustment}
        onIncrease={(productId, qty) => {
          setDialogOpen(false);
          setIncrease({ productId, qty });
        }}
        saving={adjustmentMutation.isPending}
      />

      <MinStockDialog
        product={editingMin}
        onCancel={() => setEditingMin(null)}
        onSave={saveMinStock}
        saving={updateMinStockMutation.isPending}
      />

      <ReverseMovementDialog
        movement={reverting}
        onCancel={() => setReverting(null)}
        onConfirm={reverseMovement}
        saving={reverseMutation.isPending}
      />
    </AppShell>
  );
}

function StockInventoryInfo({
  reservedStock,
  availableStock,
}: {
  reservedStock?: number;
  availableStock?: number;
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  function showTooltip() {
    clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function hideTooltip() {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground"
          aria-label="Información sobre stock y deuda"
          aria-describedby={open ? tooltipId : undefined}
          aria-haspopup={undefined}
          aria-expanded={undefined}
          aria-controls={undefined}
          onClick={(event) => {
            event.preventDefault();
            showTooltip();
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") showTooltip();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") hideTooltip();
          }}
          onFocus={(event) => {
            if (event.currentTarget.matches(":focus-visible")) showTooltip();
          }}
          onBlur={hideTooltip}
        >
          <Info aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        id={tooltipId}
        role="tooltip"
        side="top"
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] space-y-2 p-3 text-sm"
        onPointerEnter={showTooltip}
        onPointerLeave={hideTooltip}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <p className="font-medium">Stock y deuda: qué muestra cada uno</p>
        <p>
          Stock muestra lo que queda. Vender unidades a crédito no reduce lo que
          debés: consultá y registrá ese pago en Proveedores. Las unidades
          reservadas siguen en el total físico y se descuentan de Disponible.
        </p>
        <p className="text-xs text-muted-foreground">
          Reservadas para entregas: {reservedStock ?? "—"}. Disponibles:{" "}
          {availableStock ?? "—"}.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function MinStockDialog({
  product,
  onCancel,
  onSave,
  saving,
}: {
  product: Product | null;
  onCancel: () => void;
  onSave: (id: string, min: number) => Promise<void>;
  saving: boolean;
}) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (product) setVal(product.minStock);
  }, [product]);
  return (
    <Dialog
      open={product !== null}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar stock mínimo</DialogTitle>
          <DialogDescription className="sr-only">
            Configurá el nivel que activa la alerta de bajo stock para este
            producto.
          </DialogDescription>
        </DialogHeader>
        {product && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">{product.name}</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Stock mínimo
              </Label>
              <Input
                type="number"
                min={0}
                value={val}
                onChange={(e) => setVal(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Al llegar a este valor, el producto aparecerá como «Bajo stock».
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            disabled={saving}
            onClick={() => product && void onSave(product.id, val)}
          >
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReverseMovementDialog({
  movement,
  onCancel,
  onConfirm,
  saving,
}: {
  movement: StockMovement | null;
  onCancel: () => void;
  onConfirm: (m: StockMovement, reason: string) => Promise<void>;
  saving: boolean;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (movement) setReason("");
  }, [movement]);
  const classification = movement?.sourceType === "StockClassification";
  const canSave = !classification || reason.trim().length >= 3;
  return (
    <AlertDialog
      open={movement !== null}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Anular movimiento</AlertDialogTitle>
          <AlertDialogDescription>
            {movement && (
              <>
                {classification
                  ? "Se revertirá la clasificación de "
                  : "Se revertirá el ajuste manual de "}
                <strong>{movement.productName}</strong> (
                {movement.qty > 0 ? `+${movement.qty}` : movement.qty} unidades,
                {movement.type.toLowerCase()} del {movement.date}). Se genera un
                movimiento inverso y el original queda auditado.{" "}
                {classification
                  ? "Las unidades vuelven a sin clasificar. Solo se puede revertir si el lote clasificado permanece intacto."
                  : ""}
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5 py-1">
          <Label className="text-xs text-muted-foreground">
            {classification ? "Motivo (obligatorio)" : "Motivo (opcional)"}
          </Label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Ej. Carga incorrecta, se duplico el ingreso..."
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canSave || saving}
            onClick={() => movement && void onConfirm(movement, reason.trim())}
          >
            {saving ? "Revirtiendo..." : "Confirmar anulación"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AdjustStockDialog({
  open,
  onOpenChange,
  products,
  preselectedId,
  onSubmit,
  onIncrease,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: Product[];
  preselectedId: string | null;
  onSubmit: (input: StockAdjustmentInput) => Promise<void>;
  onIncrease: (productId: string, qty: number) => void;
  saving: boolean;
}) {
  const [productId, setProductId] = useState<string>("");
  const [type, setType] = useState<AdjustType>("Egreso manual");
  const [qty, setQty] = useState<number>(1);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setProductId(preselectedId ?? "");
      setType("Egreso manual");
      setQty(1);
      setReason("");
      setTouched(false);
    }
  }, [open, preselectedId]);

  const product = products.find((p) => p.id === productId);
  const sign = ADJUST_TYPES.find((t) => t.value === type)!.sign;
  const resulting = product ? (sign === "=" ? qty : product.stock - qty) : 0;

  const errors = {
    product: !productId ? "Elegí un producto" : null,
    qty:
      !Number.isSafeInteger(qty) || (sign === "=" ? qty < 0 : qty <= 0)
        ? "Ingresá una cantidad entera válida"
        : null,
    reason:
      reason.trim().length < 3 ? "Indicá un motivo (min. 3 caracteres)" : null,
    negative:
      product && resulting < 0
        ? "El stock resultante no puede ser negativo"
        : null,
  };
  const extra = product && sign === "=" ? Math.max(0, qty - product.stock) : 0;
  const hasError = Boolean(
    errors.product || errors.qty || errors.negative || extra > 0,
  );
  const showReasonError = false;

  const submit = () => {
    setTouched(true);
    if (hasError || !product) return;

    const trimmedReason = reason.trim();
    const input: StockAdjustmentInput =
      type === "Conteo físico"
        ? {
            productId,
            type: "ConteoFisico",
            physicalStock: qty,
            reason: trimmedReason || undefined,
          }
        : {
            productId,
            type: "Egreso",
            qty,
            reason: trimmedReason || undefined,
          };

    void onSubmit(input);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustar stock</DialogTitle>
          <DialogDescription className="sr-only">
            Registrá una baja o corregí el conteo físico. Para sumar unidades se
            registra una compra.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Producto</Label>
            <ProductCombobox
              products={products}
              value={productId}
              onChange={setProductId}
              disabled={!!preselectedId}
            />
            {touched && errors.product && (
              <p className="text-xs text-destructive">{errors.product}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Tipo de ajuste
              </Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as AdjustType)}
              >
                <SelectTrigger aria-label="Tipo de ajuste">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUST_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span
                        aria-hidden="true"
                        className="font-mono mr-2 text-muted-foreground"
                      >
                        {t.sign}
                      </span>
                      {t.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ADJUST_TYPES.find((t) => t.value === type)!.help}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {sign === "=" ? "Stock contado" : "Cantidad"}
              </Label>
              <Input
                aria-label={sign === "=" ? "Stock contado" : "Cantidad"}
                type="number"
                min={sign === "=" ? 0 : 1}
                step={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
              {touched && errors.qty && (
                <p className="text-xs text-destructive">{errors.qty}</p>
              )}
            </div>
          </div>

          {product && (
            <div
              className={cn(
                "rounded-md border border-border bg-muted/40 px-3 py-2 text-sm flex items-center justify-between",
                errors.negative && "border-destructive/60 bg-destructive/10",
              )}
            >
              <span className="text-muted-foreground">
                Stock actual:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {product.stock}
                </span>
              </span>
              <span className="text-muted-foreground">→</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  errors.negative
                    ? "text-destructive"
                    : resulting > product.stock
                      ? "text-success"
                      : resulting < product.stock
                        ? "text-destructive"
                        : "text-foreground",
                )}
              >
                Resultante: {resulting}
              </span>
            </div>
          )}
          {product && extra > 0 ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p>
                Hay {extra} unidades adicionales. Registrá el ingreso indicando
                proveedor y condición de pago.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={!!errors.qty || saving}
                onClick={() => onIncrease(product.id, extra)}
              >
                Registrar ingreso de {extra} unidades
              </Button>
            </div>
          ) : null}
          {touched && errors.negative && (
            <p className="text-xs text-destructive">{errors.negative}</p>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Motivo / nota (opcional)
            </Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="Ej. Conteo físico del 10/06, 2 unidades dañadas..."
            />
            {showReasonError && touched && errors.reason && (
              <p className="text-xs text-destructive">{errors.reason}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={saving || extra > 0} onClick={submit}>
            {saving ? "Guardando..." : "Guardar ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductCombobox({
  products,
  value,
  onChange,
  disabled,
}: {
  products: Product[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = products.find((p) => p.id === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? products.filter(
        (p) => p.name.toLowerCase().includes(q) || p.barcode.includes(q),
      )
    : products;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (disabled) return;
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-70 disabled:cursor-not-allowed"
        >
          <span
            className={cn(!selected && "text-muted-foreground", "truncate")}
          >
            {selected ? selected.name : "Elegí un producto"}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[calc(var(--radix-popover-trigger-width)/var(--interface-scale))]"
        align="start"
        sideOffset={4}
      >
        <div className="flex items-center border-b border-border px-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o código"
            className="border-0 shadow-none focus-visible:ring-0 h-9"
          />
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Sin resultados
            </div>
          )}
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p.id);
                setOpen(false);
                setQuery("");
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/60"
            >
              <Check
                className={cn(
                  "h-4 w-4",
                  value === p.id ? "opacity-100" : "opacity-0",
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  Stock: {p.stock}
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
