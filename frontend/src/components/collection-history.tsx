import { useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Filter,
  MoreHorizontal,
  Printer,
  ReceiptText,
  Search,
  Undo2,
} from "lucide-react";
import { Field } from "@/components/collections-controls";
import { AccountHistoryPager } from "@/components/account-history-pager";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getCollectionHistoryView,
  type CollectionHistoryFilters,
} from "@/lib/collection-history";
import { printReceipt } from "@/lib/collection-receipt";
import type { FinancialEntry } from "@/lib/collections";
import { money } from "@/lib/collections-form";
import { formatDateAR } from "@/lib/formatters";
import { cn } from "@/lib/utils";

export function CollectionHistory({
  entries,
  reverse,
}: {
  entries: FinancialEntry[];
  reverse: (id: string) => void;
}) {
  const [filters, setFilters] = useState<CollectionHistoryFilters>({
    search: "",
    date: "",
    method: "",
  });
  const [page, setPage] = useState(0);
  const view = getCollectionHistoryView(entries, filters, page);
  const methods = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.paymentMethodName ? [entry.paymentMethodName] : [],
      ),
    ),
  ].sort((a, b) => a.localeCompare(b, "es-AR"));
  const hasFilters = Boolean(filters.search || filters.date || filters.method);

  function updateFilters(changes: Partial<CollectionHistoryFilters>) {
    setFilters((current) => ({ ...current, ...changes }));
    setPage(0);
  }

  return (
    <Disclosure
      className="min-w-0"
      title={
        <>
          <ReceiptText
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="font-semibold">Historial de cobros</span>
          <span className="text-xs font-normal text-muted-foreground">
            {entries.length} {entries.length === 1 ? "registro" : "registros"}
          </span>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-[1_1_13rem]">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Buscar cobro"
              placeholder="Buscar cobro…"
              className="pl-9"
              value={filters.search}
              onChange={(event) =>
                updateFilters({ search: event.target.value })
              }
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                aria-label="Filtrar cobros por fecha"
              >
                <CalendarDays aria-hidden="true" />
                {filters.date
                  ? formatDateAR(`${filters.date}T12:00:00Z`)
                  : "Fecha"}
                <ChevronDown
                  aria-hidden="true"
                  className="text-muted-foreground"
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-3">
              <Field label="Fecha del cobro">
                <Input
                  type="date"
                  value={filters.date}
                  onChange={(event) =>
                    updateFilters({ date: event.target.value })
                  }
                />
              </Field>
              {filters.date ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => updateFilters({ date: "" })}
                >
                  Quitar filtro de fecha
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
          <Select
            value={filters.method ? `method:${filters.method}` : "all"}
            onValueChange={(value) =>
              updateFilters({ method: value === "all" ? "" : value.slice(7) })
            }
          >
            <SelectTrigger
              aria-label="Filtrar cobros por método"
              className="w-auto max-w-52 gap-2"
            >
              <Filter aria-hidden="true" className="size-4 shrink-0" />
              <SelectValue>{filters.method || "Método"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los métodos</SelectItem>
              {methods.map((method) => (
                <SelectItem key={method} value={`method:${method}`}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                updateFilters({ search: "", date: "", method: "" })
              }
            >
              Limpiar filtros
            </Button>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table
            aria-label="Historial de cobros"
            className="w-full min-w-[32rem] text-sm"
          >
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-3 text-left font-medium">
                  Fecha
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Método
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Importe
                </th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((entry) => {
                const date = formatDateAR(
                  `${entry.date.slice(0, 10)}T12:00:00Z`,
                );
                const label = `${date} por ${money(entry.amountCents)}`;
                return (
                  <tr
                    key={entry.id}
                    className={cn(
                      "border-b border-border/60 last:border-0 hover:bg-muted/30",
                      entry.reversedAt && "text-muted-foreground",
                    )}
                  >
                    <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">
                      {date}
                    </td>
                    <td className="px-3 py-1.5">
                      {entry.paymentMethodName || "—"}
                      {entry.reversedAt ? (
                        <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                          Revertido
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums">
                      {money(entry.amountCents)}
                    </td>
                    <td className="py-1.5 pl-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          aria-label={`Imprimir cobro del ${label}`}
                          title="Imprimir cobro"
                          onClick={() => void printReceipt(entry.id, false)}
                        >
                          <Printer aria-hidden="true" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              aria-label={`Acciones del cobro del ${label}`}
                              title={
                                entry.reversedAt
                                  ? "Cobro revertido"
                                  : "Más acciones"
                              }
                              disabled={Boolean(entry.reversedAt)}
                            >
                              <MoreHorizontal aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={Boolean(entry.reversedAt)}
                              className="text-destructive focus:text-destructive"
                              onSelect={() => reverse(entry.id)}
                            >
                              <Undo2 aria-hidden="true" /> Revertir cobro
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!view.rows.length ? (
                <tr>
                  <td
                    colSpan={4}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    {entries.length
                      ? "No hay cobros para estos filtros."
                      : "Sin cobros registrados."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <AccountHistoryPager kind="cobros" view={view} onPageChange={setPage} />
      </div>
    </Disclosure>
  );
}
