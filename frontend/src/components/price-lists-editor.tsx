import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const selected =
    lists.data?.find((list) => list.id === selectedId) ?? lists.data?.[0];
  return (
    <Card className="min-w-0">
      <CardHeader title="Listas de precios" />
      <div className="flex min-w-0 flex-col gap-4 p-5 pt-0">
        <p className="text-sm text-muted-foreground">
          Las unidades de toda la venta determinan la escala. Cada combo cuenta
          sus componentes una sola vez. Una celda vacía usa el precio anterior
          de esta lista o el habitual.
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
              <Select value={selected.id} onValueChange={setSelectedId}>
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
            <PriceListCustomers
              key={`customers-${selected.id}`}
              list={selected}
              lists={lists.data}
            />
            <PriceListTable
              key={selected.id}
              list={selected}
              rows={[...(products.data ?? []), ...(combos.data ?? [])]}
              onSelected={(id) => {
                setSelectedId(id);
                void client.invalidateQueries({ queryKey: ["price-lists"] });
              }}
            />
          </>
        ) : (
          <p>No hay listas disponibles.</p>
        )}
      </div>
    </Card>
  );
}
function PriceListTable({
  list,
  rows,
  onSelected,
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
  const [action, setAction] = useState<NameAction | null>(null);
  const [name, setName] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (run: () => Promise<PriceList>) => run(),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["price-lists"] });
      void client.invalidateQueries({ queryKey: ["price-preview"] });
      void client.invalidateQueries({ queryKey: ["sale-quote"] });
      void client.invalidateQueries({ queryKey: ["sale-price"] });
      setAction(null);
      setArchiveOpen(false);
      setError(null);
      onSelected(result.active ? result.id : "");
      toast.success("Lista guardada.");
    },
    onError: (cause) =>
      setError(
        cause instanceof Error ? cause.message : "No se pudo guardar la lista.",
      ),
  });
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
  const filtered = rows.filter((row) =>
    `${row.name} ${row.barcode}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => openName("create")}
        >
          Nueva lista
        </Button>
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => openName("rename")}
        >
          Renombrar
        </Button>
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => openName("duplicate")}
        >
          Duplicar lista
        </Button>
        <Button
          variant="outline"
          disabled={list.isGeneral || mutation.isPending}
          onClick={() => {
            setError(null);
            setArchiveOpen(true);
          }}
        >
          Archivar lista
        </Button>
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
          Agregar escala
        </Button>
        <Button disabled={mutation.isPending} onClick={save}>
          {mutation.isPending ? "Guardando..." : "Guardar precios"}
        </Button>
      </div>
      <div
        className="min-w-0 max-w-full overflow-x-auto rounded-md border border-border"
        role="region"
        aria-label="Matriz de precios"
        tabIndex={0}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="min-w-52 p-3 text-left">Producto / combo</th>
              <th className="min-w-28 p-3 text-right">Habitual</th>
              {tiers.map((tier, index) => (
                <th key={index} className="min-w-40 p-3">
                  <Label htmlFor={`tier-${index}`}>Desde unidades</Label>
                  <Input
                    id={`tier-${index}`}
                    aria-label={`Escala ${index + 1}: unidades mínimas`}
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
                    aria-label={`Eliminar escala ${index + 1}`}
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
                  <th className="p-3 text-left font-normal">
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
                        aria-label={`${row.name}, escala ${index + 1}`}
                        inputMode="decimal"
                        placeholder="Heredar"
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
          Sin escalas: se usan los precios habituales del catálogo.
        </p>
      ) : null}
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
                ? "La copia conserva escalas y precios de forma independiente."
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
                Guardar lista
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
