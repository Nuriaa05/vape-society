import { Disclosure } from "@/components/ui/disclosure";
import { useEffect, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { MoreHorizontal, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { priceListsRepository } from "@/lib/repositories/price-lists-repository";
import { productsRepository } from "@/lib/repositories/products-repository";
import { combosRepository } from "@/lib/repositories/combos-repository";
import {
  serializePriceListTiers,
  type PriceList,
  type TierDraft,
} from "@/lib/price-lists";
import { formatARS } from "@/lib/formatters";
import { PriceListCustomers } from "./price-list-customers";
import { PriceListExample } from "./price-list-example";
import { effectiveDraftPrice } from "@/lib/price-lists";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

type NameAction = "create" | "rename" | "duplicate";
export function PriceListsEditor() {
  const client = useQueryClient();
  const lists = useQuery({
    queryKey: ["price-lists"],
    queryFn: () => priceListsRepository.findAll(),
  });
  const products = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => productsRepository.findAll(true),
  });
  const combos = useQuery({
    queryKey: ["combos", "all"],
    queryFn: () => combosRepository.findAll(true),
  });
  const [selectedId, setSelectedId] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingList, setPendingList] = useState<string | null>(null);
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || saving,
    enableBeforeUnload: dirty || saving,
    withResolver: true,
  });
  const selected =
    lists.data?.find((list) => list.id === selectedId) ?? lists.data?.[0];
  return (
    <Card className="min-w-0">
      <CardHeader title="Listas de precios" />
      <div className="flex min-w-0 flex-col gap-4 p-5 pt-0">
        <p className="text-sm text-muted-foreground">
          Definí el precio de cada producto según la cantidad total de la venta.
          Podés mezclar productos para alcanzar esa cantidad.
        </p>
        {lists.isError || products.isError || combos.isError ? (
          <p role="alert" className="text-destructive">
            No se pudieron cargar las listas y el catálogo.{" "}
            <Button
              variant="outline"
              onClick={() => {
                void lists.refetch();
                void products.refetch();
                void combos.refetch();
              }}
            >
              Reintentar
            </Button>
          </p>
        ) : lists.isPending || products.isPending || combos.isPending ? (
          <p role="status">Cargando listas...</p>
        ) : selected ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="price-list-selector">Lista de precios</Label>
              <Select
                value={selected.id}
                disabled={saving}
                onValueChange={(id) => {
                  if (id === selected.id) return;
                  if (dirty) setPendingList(id);
                  else setSelectedId(id);
                }}
              >
                <SelectTrigger id="price-list-selector" className="sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {lists.data.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name}
                        {list.isGeneral ? " (predeterminada)" : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              {selected.isGeneral
                ? "Se aplica a las ventas sin una lista particular."
                : "Se aplica a los clientes que tengan esta lista asignada."}
            </p>
            <PriceListTable
              key={selected.id}
              list={selected}
              rows={[...(products.data ?? []), ...(combos.data ?? [])]}
              onDirtyChange={setDirty}
              onSavingChange={setSaving}
              onSelected={(id) => {
                setSelectedId(id);
                void client.invalidateQueries({ queryKey: ["price-lists"] });
              }}
            />
            <Disclosure title="Clientes que usan esta lista">
              <PriceListCustomers
                key={`customers-${selected.id}`}
                list={selected}
                lists={lists.data}
              />
            </Disclosure>
          </>
        ) : (
          <p>No hay listas disponibles.</p>
        )}
        <Dialog
          open={pendingList !== null || blocker.status === "blocked"}
          onOpenChange={(open) => {
            if (!open && !saving) {
              setPendingList(null);
              blocker.reset?.();
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tenés precios sin guardar</DialogTitle>
              <DialogDescription>
                Volvé a los precios para guardarlos o descartá los cambios antes
                de salir.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setPendingList(null);
                  blocker.reset?.();
                }}
              >
                Seguir editando
              </Button>
              <Button
                variant="destructive"
                disabled={saving}
                onClick={() => {
                  setDirty(false);
                  if (pendingList !== null) {
                    setSelectedId(pendingList);
                    setPendingList(null);
                  } else blocker.proceed?.();
                }}
              >
                Descartar cambios
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}
function PriceListTable({
  list,
  rows,
  onSelected,
  onDirtyChange,
  onSavingChange,
}: {
  list: PriceList;
  rows: Array<{
    itemType: "Product" | "Combo";
    id: string;
    name: string;
    barcode: string;
    price: number;
    archived?: boolean;
  }>;
  onSelected: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const client = useQueryClient();
  const [tiers, setTiers] = useState<TierDraft[]>(() =>
    list.tiers.map((tier) => ({
      minimumQty: String(tier.minimumQty),
      cells: Object.fromEntries(
        tier.prices.map((price) => [
          `${price.itemType}:${price.itemId}`,
          (price.priceAmountCents / 100).toFixed(2).replace(".", ","),
        ]),
      ),
    })),
  );
  const [search, setSearch] = useState("");
  const [savedDraft, setSavedDraft] = useState(() => JSON.stringify(tiers));
  const dirty = JSON.stringify(tiers) !== savedDraft;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  const [showArchived, setShowArchived] = useState(false);
  const [action, setAction] = useState<NameAction | null>(null);
  const [name, setName] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (run: () => Promise<PriceList>) => run(),
    onSuccess: (result) => {
      if (action === null && !archiveOpen) setSavedDraft(JSON.stringify(tiers));
      void client.invalidateQueries({ queryKey: ["price-lists"] });
      void client.invalidateQueries({ queryKey: ["price-preview"] });
      void client.invalidateQueries({ queryKey: ["sale-quote"] });
      void client.invalidateQueries({ queryKey: ["sale-price"] });
      setAction(null);
      setArchiveOpen(false);
      setError(null);
      onSelected(result.active ? result.id : "");
      toast.success(
        action === "create"
          ? "Lista creada. Agregá una cantidad mínima y sus precios."
          : "Cambios guardados.",
      );
    },
    onError: (cause) =>
      setError(
        cause instanceof Error ? cause.message : "No se pudo guardar la lista.",
      ),
  });
  useEffect(() => {
    onSavingChange(mutation.isPending);
  }, [mutation.isPending, onSavingChange]);
  const openName = (next: NameAction) => {
    setAction(next);
    setName(
      next === "rename"
        ? list.name
        : next === "duplicate"
          ? `${list.name} (copia)`
          : "",
    );
    setError(null);
  };
  const save = () => {
    try {
      const serialized = serializePriceListTiers(tiers);
      mutation.mutate(() =>
        priceListsRepository.update(list.id, { tiers: serialized }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revisá los precios.");
    }
  };
  const filtered = rows.filter(
    (row) =>
      (!row.archived || showArchived) &&
      `${row.name} ${row.barcode}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div>
          <h3 className="font-medium">Precios por cantidad</h3>
          <p className="text-sm text-muted-foreground">
            Todos los importes son por unidad, en pesos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={mutation.isPending || dirty}
            onClick={() => openName("create")}
          >
            Nueva lista
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Acciones de la lista"
                disabled={mutation.isPending || dirty}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => openName("rename")}>
                Renombrar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openName("duplicate")}>
                Duplicar lista
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={list.isGeneral}
                onSelect={() => {
                  setError(null);
                  setArchiveOpen(true);
                }}
              >
                Archivar lista
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}{" "}
          {archiveOpen
            ? "Reasigná sus clientes a otra lista antes de archivarla."
            : ""}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex min-w-0 flex-col gap-1.5 sm:flex-1">
          <Label htmlFor="price-matrix-search">Buscar producto o combo</Label>
          <Input
            id="price-matrix-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() =>
            setTiers((current) => [
              ...current,
              {
                minimumQty: String(
                  Math.max(
                    0,
                    ...current.map((t) => Number(t.minimumQty) || 0),
                  ) + 1,
                ),
                cells: {},
              },
            ])
          }
        >
          <Plus /> Agregar cantidad mínima
        </Button>
        <Button disabled={mutation.isPending || !dirty} onClick={save}>
          {mutation.isPending ? "Guardando..." : "Guardar precios"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <label className="flex items-center gap-2 text-muted-foreground">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          Mostrar archivados
        </label>
        {dirty ? (
          <span role="status" className="font-medium">
            Cambios sin guardar
          </span>
        ) : (
          <span className="text-muted-foreground">Precios guardados</span>
        )}
      </div>
      {dirty ? (
        <p className="text-xs text-muted-foreground">
          Guardá los precios para crear, duplicar o archivar listas.
        </p>
      ) : null}
      <div
        className="min-w-0 max-w-full overflow-x-auto rounded-md border border-border"
        role="region"
        aria-label="Matriz de precios"
        tabIndex={0}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 min-w-40 bg-card p-3 text-left">
                Producto / combo
              </th>
              <th className="min-w-28 p-3 text-right">Precio habitual</th>
              {tiers.map((tier, index) => (
                <th key={index} className="min-w-40 p-3">
                  <Label htmlFor={`tier-${index}`}>
                    Desde cuántas unidades
                  </Label>
                  <Input
                    id={`tier-${index}`}
                    aria-label={`Cantidad mínima ${index + 1}`}
                    inputMode="numeric"
                    type="number"
                    min={1}
                    step={1}
                    value={tier.minimumQty}
                    disabled={mutation.isPending}
                    onChange={(e) =>
                      setTiers((current) =>
                        current.map((t, i) =>
                          i === index
                            ? { ...t, minimumQty: e.target.value }
                            : t,
                        ),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() =>
                      setTiers((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                    aria-label={`Eliminar cantidad mínima ${index + 1}`}
                  >
                    Eliminar
                  </Button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const key = `${row.itemType}:${row.id}`;
              return (
                <tr key={key} className="border-b border-border last:border-0">
                  <th className="sticky left-0 z-10 bg-card p-3 text-left font-normal">
                    {row.name}
                    <span className="block text-xs text-muted-foreground">
                      {row.itemType === "Combo" ? "Combo" : "Producto"}
                      {row.archived ? " · Archivado" : ""}
                    </span>
                  </th>
                  <td className="p-3 text-right tabular-nums">
                    {formatARS(row.price)}
                  </td>
                  {tiers.map((tier, index) => (
                    <td key={index} className="p-3">
                      <Input
                        aria-label={`${row.name}, precio por unidad desde cantidad ${index + 1}`}
                        inputMode="decimal"
                        placeholder={(() => {
                          const price = effectiveDraftPrice(
                            tiers,
                            key,
                            row.price,
                            Number(tier.minimumQty),
                          );
                          return price === null
                            ? "Revisá la cantidad"
                            : formatARS(price);
                        })()}
                        value={tier.cells[key] ?? ""}
                        disabled={mutation.isPending}
                        onChange={(e) =>
                          setTiers((current) =>
                            current.map((t, i) =>
                              i === index
                                ? {
                                    ...t,
                                    cells: {
                                      ...t.cells,
                                      [key]: e.target.value,
                                    },
                                  }
                                : t,
                            ),
                          )
                        }
                      />
                      {!tier.cells[key]?.trim() ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Se usa este precio
                        </span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!tiers.length ? (
        <p className="text-sm text-muted-foreground">
          Todavía usás los precios habituales. Agregá una cantidad mínima para
          definir otros precios.
        </p>
      ) : null}
      {!filtered.length ? (
        <p className="text-sm text-muted-foreground">
          No hay productos que coincidan con la búsqueda.
        </p>
      ) : null}
      <PriceListExample
        tiers={tiers}
        rows={rows.filter((row) => !row.archived)}
        listName={list.name}
      />
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "create"
                ? "Nueva lista"
                : action === "duplicate"
                  ? "Duplicar lista"
                  : "Renombrar lista"}
            </DialogTitle>
            <DialogDescription>
              {action === "duplicate"
                ? "La copia conserva cantidades y precios de forma independiente."
                : "Ingresá un nombre para identificar la lista."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              mutation.mutate(() =>
                action === "create"
                  ? priceListsRepository.create({
                      name: name.trim(),
                      tiers: [],
                    })
                  : action === "duplicate"
                    ? priceListsRepository.duplicate(list.id, name.trim())
                    : priceListsRepository.update(list.id, {
                        name: name.trim(),
                      }),
              );
            }}
          >
            <Label htmlFor="price-list-name">Nombre de lista</Label>
            <Input
              id="price-list-name"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            {error ? (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button disabled={mutation.isPending || !name.trim()}>
                {action === "create"
                  ? "Continuar con precios"
                  : "Guardar lista"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={archiveOpen}
        onOpenChange={(open) => {
          if (!mutation.isPending) setArchiveOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archivar lista {list.name}</DialogTitle>
            <DialogDescription>
              Las ventas anteriores conservarán sus precios originales. Reasigná
              los clientes de esta lista antes de archivarla.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setArchiveOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate(() =>
                  priceListsRepository.update(list.id, { active: false }),
                )
              }
            >
              Confirmar archivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
