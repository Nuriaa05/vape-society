import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  Boxes,
  DatabaseBackup,
  History,
  Package,
  PackagePlus,
  Receipt,
  Search,
  Settings,
  Truck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatARS, formatDateTimeAR } from "@/lib/formatters";
import { historyRepository, type HistoryEventType } from "@/lib/repositories";
import { cn } from "@/lib/utils";

const HISTORY_PAGE_SIZE = 20;

const eventTypes: Array<{
  id: HistoryEventType;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "sales", label: "Ventas", icon: Receipt },
  { id: "purchases", label: "Compras", icon: Truck },
  { id: "products", label: "Productos", icon: Package },
  { id: "stock", label: "Stock", icon: Boxes },
  { id: "suppliers", label: "Proveedores", icon: Users },
  { id: "combos", label: "Combos", icon: PackagePlus },
  { id: "settings", label: "Configuración", icon: Settings },
  { id: "backups", label: "Backups", icon: DatabaseBackup },
];

const eventTypeById = new Map(eventTypes.map((type) => [type.id, type]));

export function HistorialPage() {
  const [selectedMonth, setSelectedMonth] = useState("");
  const [day, setDay] = useState("");
  const [type, setType] = useState<HistoryEventType | "all">("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const monthsQuery = useQuery({
    queryKey: ["history", "months"],
    queryFn: () => historyRepository.getMonths(),
  });
  const months = useMemo(() => monthsQuery.data ?? [], [monthsQuery.data]);

  useEffect(() => {
    if (months.length === 0) return;
    if (!months.some((month) => month.month === selectedMonth)) {
      setSelectedMonth(months[0].month);
      setDay("");
    }
  }, [months, selectedMonth]);

  const eventsQuery = useInfiniteQuery({
    queryKey: ["history", "events", selectedMonth, day, type, deferredSearch],
    enabled: selectedMonth.length > 0,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      historyRepository.findAll({
        month: selectedMonth,
        day: day || undefined,
        type: type === "all" ? undefined : type,
        query: deferredSearch || undefined,
        take: HISTORY_PAGE_SIZE,
        skip: pageParam,
      }),
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore
        ? pages.reduce((sum, page) => sum + page.items.length, 0)
        : undefined,
  });
  const events = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [eventsQuery.data],
  );
  const total = eventsQuery.data?.pages[0]?.total ?? 0;
  const selectedMonthLabel =
    months.find((month) => month.month === selectedMonth)?.label ?? "";
  const hasFilters = day !== "" || type !== "all" || search.trim() !== "";

  const selectMonth = (month: string) => {
    setSelectedMonth(month);
    setDay("");
  };

  const clearFilters = () => {
    setDay("");
    setType("all");
    setSearch("");
  };

  if (monthsQuery.isLoading) {
    return (
      <AppShell title="Historial" subtitle="Actividad registrada en el sistema">
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Cargando historial...
        </div>
      </AppShell>
    );
  }

  if (monthsQuery.error) {
    return (
      <AppShell title="Historial" subtitle="Actividad registrada en el sistema">
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-destructive">
          No se pudo cargar el historial.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Historial" subtitle="Actividad registrada en el sistema">
      <div className="grid min-h-[620px] overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-border lg:border-b-0 lg:border-r">
          <div className="border-b border-border px-4 py-4">
            <div className="text-sm font-semibold">Meses con actividad</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {months.length} {months.length === 1 ? "mes" : "meses"}
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-2 lg:max-h-[calc(100vh-13rem)]">
            {months.map((month) => {
              const active = month.month === selectedMonth;
              return (
                <button
                  key={month.month}
                  type="button"
                  onClick={() => selectMonth(month.month)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span className="capitalize">{month.label}</span>
                  <span className="tabular-nums text-xs">
                    {month.eventCount}
                  </span>
                </button>
              );
            })}
            {months.length === 0 && (
              <div className="px-3 py-6 text-sm text-muted-foreground">
                Todavía no hay actividad registrada.
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0">
          <div className="border-b border-border px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold capitalize">
                  {selectedMonthLabel || "Actividad"}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {total} {total === 1 ? "movimiento" : "movimientos"}
                </div>
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X /> Limpiar filtros
                </Button>
              )}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_170px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar comprobante, producto o detalle"
                  className="pl-9"
                />
              </div>
              <Select
                value={type}
                onValueChange={(value) =>
                  setType(value as HistoryEventType | "all")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {eventTypes.map((eventType) => (
                    <SelectItem key={eventType.id} value={eventType.id}>
                      {eventType.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={day}
                min={selectedMonth ? `${selectedMonth}-01` : undefined}
                max={getLastDayOfMonth(selectedMonth)}
                onChange={(event) => setDay(event.target.value)}
                disabled={!selectedMonth}
                aria-label="Filtrar por día"
              />
            </div>
          </div>

          <div className="divide-y divide-border/70">
            {events.map((event) => {
              const eventType = eventTypeById.get(event.type);
              const Icon = eventType?.icon ?? History;
              return (
                <article key={event.id} className="flex gap-3 px-5 py-4">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <div>
                        <div className="text-sm font-medium">{event.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateTimeAR(event.occurredAt)} ·{" "}
                          {eventType?.label}
                        </div>
                      </div>
                      <div className="text-right text-sm tabular-nums">
                        {event.amount !== undefined && (
                          <div className="font-medium">
                            {formatARS(event.amount)}
                          </div>
                        )}
                        {event.quantity !== undefined && (
                          <div className="text-xs text-muted-foreground">
                            {event.type === "stock" ? "Variación" : "Cantidad"}:{" "}
                            {event.type === "stock" && event.quantity > 0
                              ? "+"
                              : ""}
                            {event.quantity}
                          </div>
                        )}
                      </div>
                    </div>
                    {event.description && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        {event.description}
                      </div>
                    )}
                    {event.status && (
                      <span className="mt-2 inline-flex rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                        {event.status}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {eventsQuery.isLoading && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              Cargando movimientos...
            </div>
          )}
          {eventsQuery.error && (
            <div className="px-5 py-8 text-center text-sm text-destructive">
              No se pudieron cargar los movimientos de este mes.
            </div>
          )}
          {!eventsQuery.isLoading &&
            !eventsQuery.error &&
            events.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No hay movimientos que coincidan con los filtros.
              </div>
            )}
          {eventsQuery.hasNextPage && (
            <div className="border-t border-border px-5 py-4 text-center">
              <Button
                variant="outline"
                onClick={() => void eventsQuery.fetchNextPage()}
                disabled={eventsQuery.isFetchingNextPage}
              >
                {eventsQuery.isFetchingNextPage ? "Cargando..." : "Ver más"}
              </Button>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function getLastDayOfMonth(month: string): string | undefined {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return undefined;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}
