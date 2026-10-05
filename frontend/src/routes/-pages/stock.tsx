import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, StatusBadge } from "@/components/app-shell";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Check,
  ChevronsUpDown,
  MoreHorizontal,
  Search,
  Settings2,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ADJUST_TYPES = [
  {
    value: "Ingreso manual",
    sign: "+",
    help: "Suma unidades al stock físico.",
  },
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
      products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
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
        <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">
          Cargando stock...
        </div>
      </AppShell>
    );
  }

  if (productsQuery.error || movementsQuery.error) {
    return (
      <AppShell title="Stock" subtitle="Inventario actual y movimientos">
        <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">
          No se pudo cargar el stock.
        </div>
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
      setProducts((arr) => arr.map((p) => (p.id === id ? saved : p)));
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
      toast.success("Ajuste manual revertido.");
    } catch (error) {
      toast.error(
        getMutationErrorMessage(error, "No se pudo revertir el ajuste."),
      );
    }
  };

  return (
    <AppShell title="Stock" subtitle="Inventario actual y movimientos">
      <div className="mb-4 rounded-md border border-accent/30 bg-accent/5 px-4 py-2.5 text-xs text-foreground">
        Las ventas con <strong>Entrega: Pendiente</strong> reservan stock
        automáticamente. El stock disponible para nuevas ventas excluye lo
        reservado. Los ajustes manuales se registran como movimientos auditables
        y nunca pueden dejar stock disponible negativo.
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar producto"
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => openAdjust(null)}>
              <Settings2 /> Ajustar stock
            </Button>
          </div>
          <div className="max-h-[640px] overflow-auto overscroll-contain">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 z-10 text-left text-sm text-foreground border-b border-border bg-card">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Producto</th>
                  <th className="px-5 py-2.5 font-medium text-right">Físico</th>
                  <th className="px-5 py-2.5 font-medium text-right">
                    Reservado
                  </th>
                  <th className="px-5 py-2.5 font-medium text-right">
                    Disponible
                  </th>
                  <th className="px-5 py-2.5 font-medium text-right">Mínimo</th>
                  <th className="px-5 py-2.5 font-medium">Estado</th>
                  <th className="px-5 py-2.5 font-medium text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleStockProducts.map((p) => {
                  const st = stockRepository.getStatus(p);
                  const reserved = p.reservedStock ?? 0;
                  const available = stockRepository.getAvailableStock(p);
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs font-mono text-muted-foreground">
                          {p.barcode}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">
                        {p.stock}
                      </td>
                      <td
                        className={cn(
                          "px-5 py-3 text-right tabular-nums",
                          reserved > 0
                            ? "text-warning-foreground font-medium"
                            : "text-muted-foreground",
                        )}
                      >
                        {reserved}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold">
                        {available}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                        {p.minStock}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              aria-label="Acciones"
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openAdjust(p.id)}>
                              <Settings2 /> Ajustar stock
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditingMin(p)}>
                              <SlidersHorizontal /> Editar stock mínimo
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
        </div>

        <div className="bg-card border border-border rounded-lg">
          <div className="px-5 py-4 border-b border-border text-sm font-semibold">
            Movimientos recientes
          </div>
          <ul className="divide-y divide-border max-h-[640px] overflow-y-auto overscroll-contain">
            {visibleMovements.map((m) => {
              const canRevert =
                m.sourceType === "ManualAdjustment" &&
                m.type === "Ajuste" &&
                !m.reversed &&
                !m.reversalOf;
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
        </div>
      </div>

      <AdjustStockDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        products={products}
        preselectedId={preselectedId}
        onSubmit={applyAdjustment}
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
  const canSave = true;
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
                Se revertira el ajuste manual de{" "}
                <strong>{movement.productName}</strong> (
                {movement.qty > 0 ? `+${movement.qty}` : movement.qty} unidades,
                {movement.type.toLowerCase()} del {movement.date}). Se genera un
                movimiento inverso y el original queda auditado.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5 py-1">
          <Label className="text-xs text-muted-foreground">
            Motivo (opcional)
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
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: Product[];
  preselectedId: string | null;
  onSubmit: (input: StockAdjustmentInput) => Promise<void>;
  saving: boolean;
}) {
  const [productId, setProductId] = useState<string>("");
  const [type, setType] = useState<AdjustType>("Ingreso manual");
  const [qty, setQty] = useState<number>(1);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setProductId(preselectedId ?? "");
      setType("Ingreso manual");
      setQty(1);
      setReason("");
      setTouched(false);
    }
  }, [open, preselectedId]);

  const product = products.find((p) => p.id === productId);
  const sign = ADJUST_TYPES.find((t) => t.value === type)!.sign;
  const resulting = product
    ? sign === "="
      ? qty
      : sign === "+"
        ? product.stock + qty
        : product.stock - qty
    : 0;

  const errors = {
    product: !productId ? "Elegí un producto" : null,
    qty: !(qty > 0) ? "La cantidad debe ser mayor a 0" : null,
    reason:
      reason.trim().length < 3 ? "Indicá un motivo (min. 3 caracteres)" : null,
    negative:
      product && resulting < 0
        ? "El stock resultante no puede ser negativo"
        : null,
  };
  const hasError = Boolean(errors.product || errors.qty || errors.negative);
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
            type: sign === "+" ? "Ingreso" : "Egreso",
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
            Registrá un ingreso, egreso o conteo físico. El movimiento quedará
            guardado en el historial.
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUST_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="font-mono mr-2 text-muted-foreground">
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
                type="number"
                min={sign === "=" ? 0 : 1}
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
          <Button disabled={saving} onClick={submit}>
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
        className="p-0 w-[var(--radix-popover-trigger-width)]"
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
