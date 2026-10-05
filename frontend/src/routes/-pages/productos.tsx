import {
  Card,
  CardHeader,
  CardToolbar,
  CardFooter,
} from "@/components/ui/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Label } from "@/components/ui/label";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { type CategorySetting, type Product } from "@/lib/contracts";
import { formatARS } from "@/lib/formatters";
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
  settingsRepository,
  stockRepository,
  suppliersRepository,
} from "@/lib/repositories";
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronsUpDown,
  Download,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { amountCentsToPesos, parsePesosToAmountCents } from "@/lib/money";
import { getMutationErrorMessage } from "@/lib/mutation-errors";
import {
  calculateMarginPctFromSalePrice,
  calculateSalePriceFromMargin,
} from "@/lib/product-pricing";
import {
  filterProductsForList,
  type ProductSaleFilter,
} from "@/lib/product-visibility";
import { requiresNegativeInitialStockConfirmation } from "@/lib/product-stock-warning";
import { toast } from "sonner";

type Editing =
  | { mode: "create" }
  | {
      mode: "edit";
      product: Product;
    }
  | null;

export function ProductosPage() {
  const queryClient = useQueryClient();
  const productsQuery = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => productsRepository.findAll(true),
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsRepository.getSettings(),
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersRepository.findAll(),
  });
  const saveProductMutation = useMutation({
    mutationFn: (product: Parameters<typeof productsRepository.save>[0]) =>
      productsRepository.save(product),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
    },
  });
  const archiveProductMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      productsRepository.setArchived(id, archived),
    onSuccess: () => {
      invalidateInventoryQueries(queryClient);
    },
  });
  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => settingsRepository.createCategory(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
  const createSupplierMutation = useMutation({
    mutationFn: (name: string) =>
      suppliersRepository.save({
        name,
        phone: "-",
        email: "",
        active: true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Todas");
  const [saleFilter, setSaleFilter] = useState<ProductSaleFilter>("Todos");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const [visibleProductsCount, setVisibleProductsCount] =
    useState(PAGE_LIST_INCREMENT);

  const items = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const catOptions = settingsQuery.data?.categories ?? [];
  const supplierOptions =
    suppliersQuery.data?.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
    })) ?? [];
  const categories = ["Todas", ...catOptions.map((category) => category.name)];

  const filtered = useMemo(
    () =>
      filterProductsForList(items, {
        query: q,
        category: cat,
        showArchived,
        saleFilter,
      }),
    [items, q, cat, showArchived, saleFilter],
  );

  useEffect(() => {
    setVisibleProductsCount(PAGE_LIST_INCREMENT);
  }, [q, cat, saleFilter, showArchived]);

  const visibleProducts = useMemo(
    () => getVisibleItems(filtered, visibleProductsCount),
    [filtered, visibleProductsCount],
  );

  const handleSave = async (
    data: Omit<Product, "id" | "itemType"> & { id?: string },
  ) => {
    try {
      await saveProductMutation.mutateAsync(data);
      setEditing(null);
    } catch (error) {
      toast.error(
        getMutationErrorMessage(error, "No se pudo guardar el producto."),
      );
    }
  };

  const toggleArchive = async (p: Product) => {
    await archiveProductMutation.mutateAsync({
      id: p.id,
      archived: !p.archived,
    });
    setArchiving(null);
  };

  const isLoading =
    productsQuery.isLoading ||
    settingsQuery.isLoading ||
    suppliersQuery.isLoading;
  const hasError =
    productsQuery.error || settingsQuery.error || suppliersQuery.error;

  if (isLoading) {
    return (
      <AppShell title="Productos" subtitle="Catálogo, precios y márgenes">
        <Card className="app-card-body text-sm text-muted-foreground">
          Cargando productos...
        </Card>
      </AppShell>
    );
  }

  if (hasError) {
    return (
      <AppShell title="Productos" subtitle="Catálogo, precios y márgenes">
        <Card className="app-card-body text-sm text-destructive">
          No se pudieron cargar los productos.
        </Card>
      </AppShell>
    );
  }

  const exportCSV = () => {
    const header = [
      "Código",
      "Producto",
      "Categoría",
      "Stock",
      "StockMin",
      "Costo",
      "MargenPct",
      "Precio",
      "Archivado",
    ];
    const rows = filtered.map((p) => [
      p.barcode,
      p.name,
      p.category,
      p.stock,
      p.minStock,
      p.cost,
      p.marginPct,
      p.price,
      p.archived ? "si" : "no",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `productos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell
      title="Productos"
      subtitle="Catálogo, precios y márgenes"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download /> Exportar
          </Button>
          <Button onClick={() => setEditing({ mode: "create" })}>
            <Plus /> Nuevo producto
          </Button>
        </div>
      }
    >
      <Card>
        <CardHeader title="Catálogo de productos" />
        <CardToolbar className="flex flex-col items-stretch md:flex-row md:items-center gap-3 pt-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o código de barras"
              className="pl-9"
            />
          </div>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="md:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={saleFilter}
            onValueChange={(value) => setSaleFilter(value as ProductSaleFilter)}
          >
            <SelectTrigger className="md:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos</SelectItem>
              <SelectItem value="Vendibles">Vendibles</SelectItem>
              <SelectItem value="Solo stock">Solo stock</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground px-2">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            Mostrar archivados
          </label>
        </CardToolbar>

        <div className="max-h-[640px] overflow-auto overscroll-contain">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 text-left text-sm text-foreground border-b border-border bg-card">
              <tr>
                <th className="app-table-heading font-medium">
                  Código de barras
                </th>
                <th className="app-table-heading font-medium">Producto</th>
                <th className="app-table-heading font-medium">Categoría</th>
                <th className="app-table-heading font-medium text-right">
                  Stock
                </th>
                <th className="app-table-heading font-medium text-right">
                  Precio costo
                </th>
                <th className="app-table-heading font-medium text-right">
                  Margen
                </th>
                <th className="app-table-heading font-medium text-right">
                  Precio venta
                </th>
                <th className="app-table-heading font-medium">Estado</th>
                <th className="app-table-heading font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((p) => {
                const st = stockRepository.getStatus(p);
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-b border-border/60 last:border-0 hover:bg-muted/30",
                      p.archived && "opacity-60",
                    )}
                  >
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                      {p.barcode}
                    </td>
                    <td className="px-5 py-3 font-medium text-foreground">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{p.name}</span>
                        {p.saleEnabled === false && (
                          <StatusBadge tone="muted">Solo stock</StatusBadge>
                        )}
                      </div>
                      {p.archived && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (archivado)
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {p.category}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {p.stock}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                      {formatARS(p.cost)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {p.marginPct}%
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium">
                      {formatARS(p.price)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </td>
                    <td className="px-2 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Acciones"
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              setEditing({ mode: "edit", product: p })
                            }
                          >
                            <Pencil /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {p.archived ? (
                            <DropdownMenuItem onClick={() => toggleArchive(p)}>
                              <ArchiveRestore /> Restaurar
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setArchiving(p)}
                            >
                              <Archive /> Archivar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-10 text-center text-sm text-muted-foreground"
                  >
                    Sin productos para mostrar
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <CardFooter className="grid grid-cols-1 items-center gap-3 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <span className="text-center sm:text-left">
            Mostrando {visibleProducts.length} de {filtered.length} productos
          </span>
          <div className="flex items-center justify-center gap-2">
            {canShowMore(visibleProductsCount, filtered.length) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setVisibleProductsCount((current) =>
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
              visibleProductsCount,
              PAGE_LIST_INCREMENT,
              filtered.length,
            ) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisibleProductsCount(PAGE_LIST_INCREMENT)}
              >
                Ver menos
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        {editing && (
          <ProductDialog
            initial={editing.mode === "edit" ? editing.product : undefined}
            defaultMargin={settingsQuery.data?.defaultMargin ?? 45}
            catOptions={catOptions}
            supplierOptions={supplierOptions}
            onCreateCategory={(name) =>
              createCategoryMutation.mutateAsync(name)
            }
            onCreateSupplier={(name) =>
              createSupplierMutation.mutateAsync(name)
            }
            onCancel={() => setEditing(null)}
            onSave={handleSave}
          />
        )}
      </Dialog>

      <AlertDialog
        open={archiving !== null}
        onOpenChange={(o) => {
          if (!o) setArchiving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archivar producto</AlertDialogTitle>
            <AlertDialogDescription>
              «{archiving?.name}» dejará de aparecer en el catálogo y en nueva
              venta, pero se conserva en el historial de ventas y movimientos.
              Podés restaurarlo cuando quieras desde "Mostrar archivados".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiving && toggleArchive(archiving)}
            >
              Archivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

interface ProductDialogProps {
  initial?: Product;
  defaultMargin: number;
  catOptions: CategorySetting[];
  supplierOptions: { id: string; name: string }[];
  onCreateCategory: (name: string) => Promise<CategorySetting>;
  onCreateSupplier: (name: string) => Promise<{ id: string; name: string }>;
  onCancel: () => void;
  onSave: (
    p: Omit<Product, "id" | "itemType"> & { id?: string },
  ) => Promise<void>;
}

function ProductDialog({
  initial,
  defaultMargin,
  catOptions,
  supplierOptions,
  onCreateCategory,
  onCreateSupplier,
  onCancel,
  onSave,
}: ProductDialogProps) {
  const isEdit = !!initial;
  const initialCost = initial?.cost ?? 1500;
  const initialMargin = initial?.marginPct ?? defaultMargin;
  const initialPrice =
    initial?.price ?? calculateSalePriceFromMargin(initialCost, initialMargin);
  const [name, setName] = useState(initial?.name ?? "");
  const [barcode, setBarcode] = useState(initial?.barcode ?? "");
  const [categoryId, setCategoryId] = useState<string>(
    initial?.categoryId ?? catOptions[0]?.id ?? "",
  );
  const [supplierId, setSupplierId] = useState<string>(
    initial?.supplierId ?? supplierOptions[0]?.id ?? "",
  );
  const [costInput, setCostInput] = useState(formatPriceInput(initialCost));
  const [margin, setMargin] = useState(initialMargin);
  const [priceInput, setPriceInput] = useState(formatPriceInput(initialPrice));
  const [stock, setStock] = useState(initial?.stock ?? 0);
  const [minStock, setMinStock] = useState(initial?.minStock ?? 5);
  const [negativeStockConfirmationOpen, setNegativeStockConfirmationOpen] =
    useState(false);
  const costAmountCents = (() => {
    try {
      return parsePesosToAmountCents(costInput);
    } catch {
      return 0;
    }
  })();
  const cost = amountCentsToPesos(costAmountCents);
  const priceAmountCents = (() => {
    try {
      return parsePesosToAmountCents(priceInput);
    } catch {
      return 0;
    }
  })();
  const price = amountCentsToPesos(priceAmountCents);
  const category = catOptions.find((option) => option.id === categoryId);

  const canSave =
    name.trim().length > 0 &&
    !!category &&
    supplierId &&
    costAmountCents > 0 &&
    priceAmountCents > 0;

  const handleCostChange = (value: string) => {
    setCostInput(value);

    try {
      const nextCost = amountCentsToPesos(parsePesosToAmountCents(value));
      setPriceInput(
        formatPriceInput(calculateSalePriceFromMargin(nextCost, margin)),
      );
    } catch {
      setPriceInput("");
    }
  };

  const handleMarginChange = (value: string) => {
    const nextMargin = Number(value);
    const normalizedMargin = Number.isFinite(nextMargin) ? nextMargin : 0;

    setMargin(normalizedMargin);
    setPriceInput(
      formatPriceInput(calculateSalePriceFromMargin(cost, normalizedMargin)),
    );
  };

  const handlePriceChange = (value: string) => {
    setPriceInput(value);

    try {
      const nextPrice = amountCentsToPesos(parsePesosToAmountCents(value));
      setMargin(calculateMarginPctFromSalePrice(cost, nextPrice));
    } catch {
      return;
    }
  };

  const submit = async (negativeStockConfirmed = false) => {
    if (!canSave || !category) return;
    if (
      requiresNegativeInitialStockConfirmation({ isEdit, stock }) &&
      !negativeStockConfirmed
    ) {
      setNegativeStockConfirmationOpen(true);
      return;
    }

    await onSave({
      id: initial?.id,
      name: name.trim(),
      barcode: barcode.trim(),
      categoryId,
      category: category.name as Product["category"],
      supplierId,
      cost,
      marginPct: margin,
      price,
      stock,
      minStock,
      archived: initial?.archived ?? false,
    });
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Editar producto" : "Nuevo producto"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Actualizá los datos del producto. Los cambios afectan al catálogo, no al historial."
            : "Completá los datos del nuevo producto."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
        <Field label="Nombre">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Hamburguesas premium x4"
          />
        </Field>
        <Field label="Código de barras (opcional)">
          <Input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Puede quedar vacío"
          />
        </Field>
        <Field label="Categoría">
          <Combobox
            value={categoryId}
            onChange={setCategoryId}
            options={catOptions.map((c) => ({ value: c.id, label: c.name }))}
            onCreate={async (name) => {
              const v = name.trim();
              if (!v) return;
              const created = await onCreateCategory(v);
              setCategoryId(created.id);
            }}
            placeholder="Buscar o crear categoría"
            createLabel="Crear categoría"
          />
        </Field>
        <Field label="Proveedor">
          <Combobox
            value={supplierId}
            onChange={setSupplierId}
            options={supplierOptions.map((s) => ({
              value: s.id,
              label: s.name,
            }))}
            onCreate={async (name) => {
              const v = name.trim();
              if (!v) return;
              const created = await onCreateSupplier(v);
              setSupplierId(created.id);
            }}
            placeholder="Buscar o crear proveedor"
            createLabel="Crear proveedor"
          />
        </Field>
        <Field label="Precio de costo">
          <Input
            inputMode="decimal"
            value={costInput}
            onChange={(e) => handleCostChange(e.target.value)}
          />
        </Field>
        <Field label="Porcentaje de ganancia">
          <Input
            type="number"
            value={margin}
            onChange={(e) => handleMarginChange(e.target.value)}
          />
        </Field>
        <Field label="Precio de venta">
          <Input
            inputMode="decimal"
            value={priceInput}
            onChange={(e) => handlePriceChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Al cambiar este precio se recalcula el porcentaje de ganancia.
          </p>
        </Field>
        <Field label={isEdit ? "Stock actual" : "Stock inicial"}>
          <Input
            type="number"
            value={stock}
            disabled={isEdit}
            onChange={(e) => setStock(Number(e.target.value))}
          />
          {!isEdit && stock < 0 && (
            <p className="text-xs text-warning">
              Advertencia: el producto se guardará con stock inicial negativo.
            </p>
          )}
          {isEdit && (
            <p className="text-xs text-muted-foreground">
              El stock físico se modifica por compras, ventas y anulaciones. Los
              ajustes manuales quedan fuera de esta fase.
            </p>
          )}
        </Field>
        <Field label="Stock mínimo">
          <Input
            type="number"
            value={minStock}
            onChange={(e) => setMinStock(Number(e.target.value))}
          />
        </Field>
      </div>
      {isEdit && (
        <p className="text-xs text-muted-foreground -mt-1">
          Los cambios afectan datos de catálogo y precios, no el historial ni el
          stock físico.
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={() => void submit()} disabled={!canSave}>
          {isEdit ? "Guardar cambios" : "Guardar producto"}
        </Button>
      </DialogFooter>
      <AlertDialog
        open={negativeStockConfirmationOpen}
        onOpenChange={setNegativeStockConfirmationOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirmar stock inicial negativo
            </AlertDialogTitle>
            <AlertDialogDescription>
              El producto se guardará con {stock} unidades de stock físico. Esta
              cantidad quedará registrada como movimiento inicial y generará una
              alerta de stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit(true)}>
              Guardar de todos modos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContent>
  );
}

function formatPriceInput(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    useGrouping: false,
    maximumFractionDigits: 2,
  }).format(value);
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

interface ComboboxOption {
  value: string;
  label: string;
}
interface ComboboxProps {
  value: string;
  onChange: (v: string) => void;
  options: ComboboxOption[];
  onCreate: (name: string) => void | Promise<void>;
  placeholder?: string;
  createLabel?: string;
}

function Combobox({
  value,
  onChange,
  options,
  onCreate,
  placeholder = "Buscar...",
  createLabel = "Crear",
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;
  const exact = options.some((o) => o.label.toLowerCase() === q);
  const canCreate = q.length > 0 && !exact;

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className={cn(!selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder}
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) {
                e.preventDefault();
                void onCreate(query);
                setQuery("");
                setOpen(false);
              }
            }}
            placeholder={placeholder}
            className="border-0 shadow-none focus-visible:ring-0 h-9"
          />
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          {filtered.length === 0 && !canCreate && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Sin resultados
            </div>
          )}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
                setQuery("");
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/60"
            >
              <Check
                className={cn(
                  "h-4 w-4",
                  value === o.value ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="flex-1 truncate">{o.label}</span>
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onClick={() => {
                void onCreate(query);
                setQuery("");
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/60 border-t border-border text-primary"
            >
              <Plus className="h-4 w-4" />
              <span className="truncate">
                {createLabel} «{query.trim()}»
              </span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
