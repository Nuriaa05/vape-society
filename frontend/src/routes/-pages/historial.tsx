import { Card, CardFooter } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
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
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { HistoryMonthNavigation } from "@/components/history-month-navigation";
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

const HISTORY_PREVIEW_LIMIT = 5;

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
  const [showAllEvents, setShowAllEvents] = useState(false);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    setShowAllEvents(false);
    eventsScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedMonth, day, type, deferredSearch]);

  const filters = {
    month: selectedMonth,
    day: day || undefined,
    type: type === "all" ? undefined : type,
    query: deferredSearch || undefined,
  };
  const previewEventsQuery = useQuery({
    queryKey: ["history", "events", filters, "preview"],
    enabled: selectedMonth.length > 0,
    queryFn: () =>
      historyRepository.findAll({
        ...filters,
        take: HISTORY_PREVIEW_LIMIT,
        skip: 0,
      }),
  });
  const allEventsQuery = useQuery({
    queryKey: ["history", "events", filters, "all"],
    enabled: selectedMonth.length > 0 && showAllEvents,
    queryFn: () => historyRepository.findAllMatching(filters),
  });
  const eventsQuery = showAllEvents ? allEventsQuery : previewEventsQuery;
  const events =
    eventsQuery.data?.items ?? previewEventsQuery.data?.items ?? [];
  const total = eventsQuery.data?.total ?? previewEventsQuery.data?.total ?? 0;
  const isExpanded = showAllEvents && allEventsQuery.data !== undefined;
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

  const toggleEvents = () => {
    if (isExpanded) {
      setShowAllEvents(false);
      eventsScrollRef.current?.scrollTo({ top: 0 });
    } else if (showAllEvents) {
      void allEventsQuery.refetch();
    } else {
      setShowAllEvents(true);
    }
  };

  if (monthsQuery.isLoading) {
    return (
      <AppShell title="Historial" subtitle="Actividad registrada en el sistema">
        <Card className="app-card-body text-sm text-muted-foreground">
          Cargando historial...
        </Card>
      </AppShell>
    );
  }

  if (monthsQuery.error) {
    return (
      <AppShell title="Historial" subtitle="Actividad registrada en el sistema">
        <Card className="app-card-body text-sm text-destructive">
          No se pudo cargar el historial.
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Historial" subtitle="Actividad registrada en el sistema">
      <Card className="grid min-h-[620px] overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)]">
        <HistoryMonthNavigation
          months={months}
          selectedMonth={selectedMonth}
          onSelectMonth={selectMonth}
        />

        <section className="min-w-0">
          <div className="border-b border-border app-card-header">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold capitalize app-card-title">
                  {selectedMonthLabel || "Actividad"}
                </h2>
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

          <div
            ref={eventsScrollRef}
            className="max-h-[640px] divide-y divide-border/70 overflow-y-auto overscroll-contain"
          >
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
            {eventsQuery.isLoading && events.length === 0 && (
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
          </div>
          {total > HISTORY_PREVIEW_LIMIT && (
            <CardFooter className="justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={toggleEvents}
                disabled={eventsQuery.isFetching}
              >
                {eventsQuery.isFetching
                  ? "Cargando..."
                  : isExpanded
                    ? "Ver menos"
                    : "Ver más"}
              </Button>
            </CardFooter>
          )}
        </section>
      </Card>
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
