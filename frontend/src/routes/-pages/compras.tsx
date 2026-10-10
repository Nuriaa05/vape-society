import {
  Card,
  CardBody,
  CardHeader,
  CardToolbar,
  CardFooter,
} from "@/components/ui/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  type Product,
  type Purchase,
  type PurchaseStatus,
} from "@/lib/contracts";
import { formatARS } from "@/lib/formatters";
import {
  productsRepository,
  purchasesRepository,
  suppliersRepository,
} from "@/lib/repositories";
import { getMutationErrorMessage } from "@/lib/mutation-errors";
import { getPurchaseSupplierOptions } from "@/lib/purchase-suppliers";
import {
  canShowLess,
  canShowMore,
  getNextVisibleCount,
  getVisibleItems,
  PAGE_LIST_INCREMENT,
} from "@/lib/visible-items";
import {
  ArrowDown,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { amountCentsToPesos, parsePesosToAmountCents } from "@/lib/money";
import { toast } from "sonner";
import {
  createEmptyPurchaseDraft,
  discardPurchaseDraft,
} from "@/lib/purchase-draft";

type Item = {
  productId: string;
  qty: number;
  cost: string;
};

function parseCostInput(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;

  try {
    return amountCentsToPesos(parsePesosToAmountCents(trimmed));
  } catch {
    return 0;
  }
}

function costInputFromProduct(product?: Product): string {
  if (!product) return "0";

  return new Intl.NumberFormat("es-AR", {
    useGrouping: false,
    maximumFractionDigits: 2,
  }).format(product.cost);
}

export function ComprasPage() {
  const queryClient = useQueryClient();
  const productsQuery = useQuery({
    queryKey: ["products", "active"],
    queryFn: () => productsRepository.findActive(),
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersRepository.findAll(),
  });
  const purchasesQuery = useQuery({
    queryKey: ["purchases"],
    queryFn: () => purchasesRepository.findAll(),
  });
  const invalidateOperationalQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ["purchases"] });
    void queryClient.invalidateQueries({ queryKey: ["stock"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
  };
  const createPurchaseMutation = useMutation({
    mutationFn: purchasesRepository.create,
    onSuccess: invalidateOperationalQueries,
  });
  const updatePurchaseMutation = useMutation({
    mutationFn: purchasesRepository.update,
    onSuccess: invalidateOperationalQueries,
  });
  const registerPurchaseMutation = useMutation({
    mutationFn: (id: string) => purchasesRepository.register(id),
    onSuccess: invalidateOperationalQueries,
  });
  const cancelPurchaseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      purchasesRepository.cancel(id, reason),
    onSuccess: invalidateOperationalQueries,
  });
  const deletePurchaseMutation = useMutation({
    mutationFn: (id: string) => purchasesRepository.deleteDraft(id),
    onSuccess: invalidateOperationalQueries,
  });
  const list = useMemo(() => purchasesQuery.data ?? [], [purchasesQuery.data]);
  const purchaseProducts = useMemo(
    () => productsQuery.data ?? [],
    [productsQuery.data],
  );
  const suppliers = useMemo(
    () => suppliersQuery.data ?? [],
    [suppliersQuery.data],
  );
  const purchaseSuppliers = useMemo(
    () => getPurchaseSupplierOptions(suppliers),
    [suppliers],
  );

  // Draft form (top)
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<Item[]>([]);
  const [clearOpen, setClearOpen] = useState(false);

  // History interactions
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [cancelling, setCancelling] = useState<Purchase | null>(null);
  const [deleting, setDeleting] = useState<Purchase | null>(null);
  const [visiblePurchasesCount, setVisiblePurchasesCount] =
    useState(PAGE_LIST_INCREMENT);
  const editSupplierOptions = useMemo(
    () => getPurchaseSupplierOptions(suppliers, editing?.supplierId),
    [editing?.supplierId, suppliers],
  );

  const visiblePurchases = useMemo(
    () => getVisibleItems(list, visiblePurchasesCount),
    [list, visiblePurchasesCount],
  );

  const total = items.reduce((s, i) => s + i.qty * parseCostInput(i.cost), 0);

  const resetDraft = () => {
    const draft = createEmptyPurchaseDraft();

    setSupplier(draft.supplierId);
    setDate(new Date().toISOString().slice(0, 10));
    setItems(draft.items);
  };

  const discardDraft = () => {
    const draft = discardPurchaseDraft();
    setSupplier(draft.supplierId);
    setDate(new Date().toISOString().slice(0, 10));
    setItems(draft.items);
  };

  const savePurchase = async (status: PurchaseStatus) => {
    if (items.length === 0 || !supplier) return;
    await createPurchaseMutation.mutateAsync({
      supplierId: supplier,
      date,
      items: items.map((it) => ({
        productId: it.productId,
        qty: it.qty,
        cost: parseCostInput(it.cost),
      })),
      status,
    });
    resetDraft();
  };

  const applyEdit = async (updated: Purchase) => {
    await updatePurchaseMutation.mutateAsync({
      id: updated.id,
      supplierId: updated.supplierId,
      date: updated.date,
      items: updated.items.map((item) => ({
        productId: item.productId,
        qty: item.qty,
        cost: item.cost,
      })),
    });
    if (updated.status === "Registrada") {
      await registerPurchaseMutation.mutateAsync(updated.id);
    }
    setEditing(null);
  };

  const cancelPurchase = async (p: Purchase, reason: string) => {
    try {
      await cancelPurchaseMutation.mutateAsync({ id: p.id, reason });
      setCancelling(null);
      toast.success("Compra anulada.");
    } catch (error) {
      toast.error(
        getMutationErrorMessage(error, "No se pudo anular la compra."),
      );
    }
  };

  const deletePurchase = async (p: Purchase) => {
    await deletePurchaseMutation.mutateAsync(p.id);
    setDeleting(null);
  };

  const monthlyPurchases = purchasesRepository.findByMonth(list);
  const monthTotal = purchasesRepository.getActiveTotal(monthlyPurchases);

  if (
    productsQuery.isLoading ||
    suppliersQuery.isLoading ||
    purchasesQuery.isLoading
  ) {
    return (
      <AppShell title="Compras" subtitle="Registro de mercadería recibida">
        <Card className="app-card-body text-sm text-muted-foreground">
          Cargando compras...
        </Card>
      </AppShell>
    );
  }

  if (productsQuery.error || suppliersQuery.error || purchasesQuery.error) {
    return (
      <AppShell title="Compras" subtitle="Registro de mercadería recibida">
        <Card className="app-card-body text-sm text-destructive">
          No se pudieron cargar las compras.
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Compras" subtitle="Registro de mercadería recibida">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5">
        <Card>
          <CardToolbar className="flex items-center justify-between">
            <h2 className="font-semibold app-card-title">Nueva compra</h2>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setClearOpen(true)}
            >
              <Trash2 /> Descartar borrador
            </Button>
          </CardToolbar>

          <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Proveedor</Label>
              <Select value={supplier} onValueChange={setSupplier}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {purchaseSuppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Fecha de compra
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </CardBody>

          <CardBody className="pb-2 pt-0 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Productos</h3>
            <Button
              size="sm"
              variant="outline"
              disabled={!purchaseProducts[0]}
              onClick={() =>
                setItems([
                  ...items,
                  {
                    productId: purchaseProducts[0]?.id ?? "",
                    qty: 1,
                    cost: costInputFromProduct(purchaseProducts[0]),
                  },
                ])
              }
            >
              <Plus /> Agregar producto
            </Button>
          </CardBody>

          <ItemsEditor
            items={items}
            products={purchaseProducts}
            onChange={setItems}
          />

          <CardFooter className="flex flex-wrap items-center justify-between gap-4 bg-muted/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ArrowDown className="h-3.5 w-3.5 text-success" />
              Al registrar la compra, el stock se incrementa. Si la guardás como
              pendiente, no afecta el inventario hasta confirmarla.
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-xl font-semibold tabular-nums">
                  {formatARS(total)}
                </div>
              </div>
              <Button
                variant="outline"
                disabled={items.length === 0}
                onClick={() => void savePurchase("Pendiente")}
              >
                Guardar borrador
              </Button>
              <Button
                disabled={items.length === 0}
                onClick={() => void savePurchase("Registrada")}
              >
                Registrar compra
              </Button>
            </div>
          </CardFooter>
        </Card>

        <Card className="app-card-body">
          <h2 className="flex items-center gap-2 font-semibold mb-2 app-card-title">
            <TrendingUp className="h-4 w-4 text-accent" /> Resumen del mes
          </h2>
          <div className="text-2xl font-semibold tabular-nums">
            {formatARS(monthTotal)}
          </div>
          <div className="text-xs text-muted-foreground mb-4">
            {purchasesRepository.getActiveCount(monthlyPurchases)} compras (sin
            anuladas)
          </div>
          <div className="text-xs text-muted-foreground border-t border-border pt-3 space-y-2">
            <p>
              Cada compra <strong>registrada</strong> ingresa stock al
              inventario.
            </p>
            <p>
              Las compras <strong>pendientes</strong> son borradores: se pueden
              editar antes de registrar.
            </p>
            <p>
              Una compra <strong>anulada</strong> devuelve el stock y queda en
              el historial con su motivo.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Historial de compras"
          className="border-b border-border"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-sm text-foreground border-b border-border bg-card">
              <tr>
                <th className="app-table-heading font-medium">Fecha</th>
                <th className="app-table-heading font-medium">Proveedor</th>
                <th className="app-table-heading font-medium">Productos</th>
                <th className="app-table-heading font-medium">Estado</th>
                <th className="app-table-heading font-medium text-right">
                  Total
                </th>
                <th className="app-table-heading font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {visiblePurchases.map((c) => {
                const status = c.status ?? "Registrada";
                const tone =
                  status === "Registrada"
                    ? "success"
                    : status === "Pendiente"
                      ? "warning"
                      : "destructive";
                return (
                  <tr
                    key={c.id}
                    className={cn(
                      "border-b border-border/60 last:border-0 hover:bg-muted/30",
                      status === "Anulada" && "opacity-60",
                    )}
                  >
                    <td className="px-5 py-3 text-muted-foreground">
                      {c.date}
                    </td>
                    <td className="px-5 py-3 font-medium">
                      {suppliers.find((s) => s.id === c.supplierId)?.name}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {c.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                      {status === "Anulada" && c.cancelReason && (
                        <div className="text-xs text-destructive mt-0.5">
                          Anulada: {c.cancelReason}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={tone}>{status}</StatusBadge>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium">
                      {formatARS(c.total)}
                    </td>
                    <td className="px-2 py-3">
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
                          {status === "Pendiente" && (
                            <>
                              <DropdownMenuItem onClick={() => setEditing(c)}>
                                <Pencil /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  void applyEdit({ ...c, status: "Registrada" })
                                }
                              >
                                <ArrowDown /> Registrar (ingresa stock)
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleting(c)}
                              >
                                <Trash2 /> Eliminar borrador
                              </DropdownMenuItem>
                            </>
                          )}
                          {status === "Registrada" && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setCancelling(c)}
                            >
                              <Undo2 /> Anular compra
                            </DropdownMenuItem>
                          )}
                          {status === "Anulada" && (
                            <DropdownMenuItem disabled>
                              Sin acciones
                            </DropdownMenuItem>
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
        {(canShowMore(visiblePurchasesCount, list.length) ||
          canShowLess(
            visiblePurchasesCount,
            PAGE_LIST_INCREMENT,
            list.length,
          )) && (
          <div className="border-t border-border px-5 py-3 flex justify-center gap-2">
            {canShowMore(visiblePurchasesCount, list.length) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setVisiblePurchasesCount((current) =>
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
              visiblePurchasesCount,
              PAGE_LIST_INCREMENT,
              list.length,
            ) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisiblePurchasesCount(PAGE_LIST_INCREMENT)}
              >
                Ver menos
              </Button>
            )}
          </div>
        )}
      </Card>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar borrador</AlertDialogTitle>
            <AlertDialogDescription>
              Se limpiarán todos los productos cargados en la nueva compra. Esta
              acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                discardDraft();
                setClearOpen(false);
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditPurchaseDialog
        purchase={editing}
        products={purchaseProducts}
        suppliers={editSupplierOptions}
        onCancel={() => setEditing(null)}
        onSave={applyEdit}
      />
      <CancelPurchaseDialog
        purchase={cancelling}
        suppliers={suppliers}
        onCancel={() => setCancelling(null)}
        onConfirm={cancelPurchase}
        saving={cancelPurchaseMutation.isPending}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar borrador</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la compra pendiente del {deleting?.date} a «
              {suppliers.find((s) => s.id === deleting?.supplierId)?.name}
              ». Como no fue registrada, no afecta al stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && void deletePurchase(deleting)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function ItemsEditor({
  items,
  products,
  onChange,
}: {
  items: Item[];
  products: Product[];
  onChange: (i: Item[]) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-sm text-foreground border-y border-border bg-card">
          <tr>
            <th className="app-table-heading font-medium">Producto</th>
            <th className="app-table-heading font-medium text-right w-24">
              Cantidad
            </th>
            <th className="app-table-heading font-medium text-right w-36">
              Costo unit.
            </th>
            <th className="app-table-heading font-medium text-right w-36">
              Subtotal
            </th>
            <th className="w-10"></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="px-5 py-6 text-center text-muted-foreground text-sm"
              >
                Sin productos cargados.
              </td>
            </tr>
          )}
          {items.map((it, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              <td className="px-5 py-2.5">
                <Select
                  value={it.productId}
                  onValueChange={(v) =>
                    onChange(
                      items.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              productId: v,
                              cost: costInputFromProduct(
                                products.find((p) => p.id === v),
                              ),
                            }
                          : x,
                      ),
                    )
                  }
                >
                  <SelectTrigger className="h-8 border-none shadow-none -mx-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="px-5 py-2.5">
                <Input
                  className="h-8 text-right"
                  type="number"
                  value={it.qty}
                  onChange={(e) =>
                    onChange(
                      items.map((x, j) =>
                        j === i ? { ...x, qty: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
              </td>
              <td className="px-5 py-2.5">
                <Input
                  className="h-8 text-right"
                  inputMode="decimal"
                  value={it.cost}
                  onChange={(e) =>
                    onChange(
                      items.map((x, j) =>
                        j === i ? { ...x, cost: e.target.value } : x,
                      ),
                    )
                  }
                />
              </td>
              <td className="px-5 py-2.5 text-right tabular-nums font-medium">
                {formatARS(it.qty * parseCostInput(it.cost))}
              </td>
              <td className="px-2">
                <button
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  className="h-7 w-7 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center justify-center"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditPurchaseDialog({
  purchase,
  products,
  suppliers,
  onCancel,
  onSave,
}: {
  purchase: Purchase | null;
  products: Product[];
  suppliers: { id: string; name: string }[];
  onCancel: () => void;
  onSave: (p: Purchase) => Promise<void>;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState("");
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (purchase) {
      setSupplierId(purchase.supplierId);
      setDate(purchase.date);
      setItems(
        purchase.items.map((i) => ({
          productId: i.productId,
          qty: i.qty,
          cost: String(i.cost),
        })),
      );
    }
  }, [purchase]);

  if (!purchase) return null;
  const total = items.reduce((s, i) => s + i.qty * parseCostInput(i.cost), 0);

  const save = (status: PurchaseStatus) => {
    void onSave({
      ...purchase,
      supplierId,
      date,
      items: items.map((it) => {
        const p = products.find((x) => x.id === it.productId)!;
        return {
          productId: p.id,
          name: p.name,
          qty: it.qty,
          cost: parseCostInput(it.cost),
        };
      }),
      total,
      status,
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar compra pendiente</DialogTitle>
          <DialogDescription>
            Ajustá proveedor, fecha, cantidades o costos antes de registrar la
            compra.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Proveedor</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Fecha</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <div className="border border-border rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
            <span className="text-sm font-medium">Productos</span>
            <Button
              size="sm"
              variant="outline"
              disabled={!products[0]}
              onClick={() =>
                setItems([
                  ...items,
                  {
                    productId: products[0]?.id ?? "",
                    qty: 1,
                    cost: costInputFromProduct(products[0]),
                  },
                ])
              }
            >
              <Plus /> Agregar
            </Button>
          </div>
          <ItemsEditor items={items} products={products} onChange={setItems} />
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatARS(total)}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            disabled={items.length === 0}
            onClick={() => save("Pendiente")}
          >
            Guardar cambios
          </Button>
          <Button
            disabled={items.length === 0}
            onClick={() => save("Registrada")}
          >
            Guardar y registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelPurchaseDialog({
  purchase,
  suppliers,
  onCancel,
  onConfirm,
  saving,
}: {
  purchase: Purchase | null;
  suppliers: { id: string; name: string }[];
  onCancel: () => void;
  onConfirm: (p: Purchase, reason: string) => Promise<void>;
  saving: boolean;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (purchase) setReason("");
  }, [purchase]);
  return (
    <AlertDialog
      open={purchase !== null}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Anular compra</AlertDialogTitle>
          <AlertDialogDescription>
            {purchase && (
              <>
                Se devolverá el stock ingresado por la compra del{" "}
                {purchase.date} a «
                {suppliers.find((s) => s.id === purchase.supplierId)?.name}» (
                {formatARS(purchase.total)}). El registro se conserva marcado
                como anulado.
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
            placeholder="Ej. Mercadería devuelta al proveedor, error de carga…"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={(event) => {
              event.preventDefault();
              if (purchase) void onConfirm(purchase, reason.trim());
            }}
          >
            {saving ? "Anulando..." : "Confirmar anulación"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
