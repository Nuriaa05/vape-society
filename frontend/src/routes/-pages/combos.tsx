import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Combo } from "@/lib/contracts";
import { formatARS } from "@/lib/formatters";
import { amountCentsToPesos, parsePesosToAmountCents } from "@/lib/money";
import { combosRepository, productsRepository } from "@/lib/repositories";
import {
  canShowLess,
  canShowMore,
  getNextVisibleCount,
  getVisibleItems,
  PAGE_LIST_INCREMENT,
} from "@/lib/visible-items";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type ComboForm = {
  id?: string;
  name: string;
  barcode: string;
  priceInput: string;
  selectedProductId: string;
  selectedQty: string;
  items: Array<{ productId: string; qty: number }>;
};

const EMPTY_FORM: ComboForm = {
  name: "",
  barcode: "",
  priceInput: "",
  selectedProductId: "",
  selectedQty: "1",
  items: [],
};

export function CombosPage() {
  const queryClient = useQueryClient();
  const combosQuery = useQuery({
    queryKey: ["combos", "all"],
    queryFn: () => combosRepository.findAll(true),
  });
  const productsQuery = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => productsRepository.findAll(true),
  });
  const saveComboMutation = useMutation({
    mutationFn: (combo: Parameters<typeof combosRepository.save>[0]) =>
      combosRepository.save(combo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["combos"] });
    },
  });
  const archiveComboMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      combosRepository.setArchived(id, archived),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["combos"] });
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ComboForm>(EMPTY_FORM);
  const [visibleCombosCount, setVisibleCombosCount] =
    useState(PAGE_LIST_INCREMENT);
  const products = useMemo(
    () => productsQuery.data ?? [],
    [productsQuery.data],
  );
  const activeProducts = useMemo(
    () => products.filter((product) => !product.archived),
    [products],
  );
  const combos = useMemo(() => combosQuery.data ?? [], [combosQuery.data]);
  const visibleCombos = getVisibleItems(combos, visibleCombosCount);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const formProductsTotal = form.items.reduce((total, item) => {
    const product = productById.get(item.productId);
    return total + (product?.price ?? 0) * item.qty;
  }, 0);
  const formPrice = parsePriceOrZero(form.priceInput);
  const formDiscount = Math.max(0, formProductsTotal - formPrice);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (combo: Combo) => {
    setDialogOpen(true);
    setForm({
      id: combo.id,
      name: combo.name,
      barcode: combo.barcode,
      priceInput: toPriceInput(combo.price),
      selectedProductId: "",
      selectedQty: "1",
      items: combo.items.map((item) => ({
        productId: item.productId,
        qty: item.qty,
      })),
    });
  };

  const closeDialog = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(false);
  };

  const addComponent = () => {
    const qty = Math.max(1, Math.trunc(Number(form.selectedQty)));
    if (!form.selectedProductId || !Number.isFinite(qty)) return;

    setForm((current) => ({
      ...current,
      selectedProductId: "",
      selectedQty: "1",
      items: upsertComponent(current.items, form.selectedProductId, qty),
    }));
  };

  const saveCombo = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("El combo necesita un nombre.");
      return;
    }

    if (form.items.length === 0) {
      toast.error("El combo necesita al menos un producto.");
      return;
    }

    let price: number;
    try {
      price = amountCentsToPesos(parsePesosToAmountCents(form.priceInput));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "El precio no es válido.",
      );
      return;
    }

    if (price <= 0) {
      toast.error("El precio del combo debe ser mayor a cero.");
      return;
    }

    try {
      await saveComboMutation.mutateAsync({
        id: form.id,
        name,
        barcode: form.barcode,
        price,
        items: form.items,
      });
      toast.success(form.id ? "Combo actualizado." : "Combo creado.");
      closeDialog();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar el combo.",
      );
    }
  };

  if (combosQuery.isLoading || productsQuery.isLoading) {
    return (
      <AppShell title="Combos" subtitle="Productos agrupados para venta">
        <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">
          Cargando combos...
        </div>
      </AppShell>
    );
  }

  if (combosQuery.error || productsQuery.error) {
    return (
      <AppShell title="Combos" subtitle="Productos agrupados para venta">
        <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">
          No se pudieron cargar los combos.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Combos"
      subtitle="Armados desde productos activos"
      actions={
        <Button onClick={openCreate}>
          <Plus /> Nuevo combo
        </Button>
      }
    >
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-sm text-foreground border-b border-border bg-card">
              <tr>
                <th className="px-5 py-3 font-medium">Combo</th>
                <th className="px-5 py-3 font-medium">Componentes</th>
                <th className="px-5 py-3 font-medium text-right">Valor</th>
                <th className="px-5 py-3 font-medium text-right">Precio</th>
                <th className="px-5 py-3 font-medium text-right">Descuento</th>
                <th className="px-5 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleCombos.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-muted-foreground"
                  >
                    Todavia no hay combos cargados.
                  </td>
                </tr>
              )}
              {visibleCombos.map((combo) => (
                <tr
                  key={combo.id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-5 py-3">
                    <div className="font-medium">{combo.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {combo.barcode || "Sin código"}
                    </div>
                    {combo.archived && (
                      <div className="mt-1">
                        <StatusBadge tone="muted">Archivado</StatusBadge>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {combo.items
                      .map((item) => `${item.qty}x ${item.productName}`)
                      .join(" + ")}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                    {formatARS(combo.productsTotal)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium">
                    {formatARS(combo.price)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {formatARS(combo.discount)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(combo)}
                      >
                        <Pencil /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={archiveComboMutation.isPending}
                        onClick={() =>
                          void archiveComboMutation.mutateAsync({
                            id: combo.id,
                            archived: !combo.archived,
                          })
                        }
                      >
                        {combo.archived ? (
                          <>
                            <ArchiveRestore /> Restaurar
                          </>
                        ) : (
                          <>
                            <Archive /> Archivar
                          </>
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(canShowMore(visibleCombosCount, combos.length) ||
          canShowLess(
            visibleCombosCount,
            PAGE_LIST_INCREMENT,
            combos.length,
          )) && (
          <div className="border-t border-border px-5 py-3 flex justify-center">
            {canShowMore(visibleCombosCount, combos.length) ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setVisibleCombosCount((current) =>
                    getNextVisibleCount(
                      current,
                      PAGE_LIST_INCREMENT,
                      combos.length,
                    ),
                  )
                }
              >
                Ver mas
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVisibleCombosCount(PAGE_LIST_INCREMENT)}
              >
                Ver menos
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "Editar combo" : "Nuevo combo"}
            </DialogTitle>
            <DialogDescription>
              Seleccioná productos activos y definí el precio final del combo.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre">
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </Field>
            <Field label="Código de barras opcional">
              <Input
                value={form.barcode}
                onChange={(event) =>
                  setForm({ ...form, barcode: event.target.value })
                }
              />
            </Field>
            <Field label="Precio del combo">
              <Input
                value={form.priceInput}
                onChange={(event) =>
                  setForm({ ...form, priceInput: event.target.value })
                }
                placeholder="Ej. 2500,50"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">
                  Valor productos
                </div>
                <div className="font-medium tabular-nums">
                  {formatARS(formProductsTotal)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Descuento</div>
                <div className="font-medium tabular-nums">
                  {formatARS(formDiscount)}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="grid grid-cols-[1fr_96px_auto] gap-2">
              <Select
                value={form.selectedProductId}
                onValueChange={(value) =>
                  setForm({ ...form, selectedProductId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Producto activo" />
                </SelectTrigger>
                <SelectContent>
                  {activeProducts.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={1}
                value={form.selectedQty}
                onChange={(event) =>
                  setForm({ ...form, selectedQty: event.target.value })
                }
              />
              <Button
                type="button"
                variant="outline"
                disabled={!form.selectedProductId}
                onClick={addComponent}
              >
                <Plus /> Agregar
              </Button>
            </div>

            <div className="divide-y divide-border">
              {form.items.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Agregá al menos un producto activo.
                </div>
              )}
              {form.items.map((item) => {
                const product = productById.get(item.productId);

                return (
                  <div
                    key={item.productId}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div>
                      <div className="font-medium">
                        {product?.name ?? "Producto no disponible"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Cantidad por combo: {item.qty}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          items: current.items.filter(
                            (component) =>
                              component.productId !== item.productId,
                          ),
                        }))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button
              onClick={() => void saveCombo()}
              disabled={saveComboMutation.isPending}
            >
              Guardar combo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function upsertComponent(
  items: ComboForm["items"],
  productId: string,
  qty: number,
): ComboForm["items"] {
  const existing = items.find((item) => item.productId === productId);

  if (!existing) {
    return [...items, { productId, qty }];
  }

  return items.map((item) =>
    item.productId === productId ? { ...item, qty: item.qty + qty } : item,
  );
}

function parsePriceOrZero(input: string): number {
  try {
    return amountCentsToPesos(parsePesosToAmountCents(input));
  } catch {
    return 0;
  }
}

function toPriceInput(price: number): string {
  return Number.isInteger(price)
    ? String(price)
    : String(price).replace(".", ",");
}
