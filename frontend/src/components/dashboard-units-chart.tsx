import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  reportsRepository,
  type SoldUnitsPeriod,
} from "@/lib/repositories/reports-repository";
import { cn } from "@/lib/utils";

const unitsFormatter = new Intl.NumberFormat("es-AR");
const periods: Array<{ id: SoldUnitsPeriod; label: string }> = [
  { id: "week", label: "Semanal" },
  { id: "month", label: "Mensual" },
];

export function DashboardUnitsChart() {
  const [period, setPeriod] = useState<SoldUnitsPeriod>("week");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["reports", "sold-units", period],
    queryFn: () => reportsRepository.getSoldUnitsDataset(period),
  });
  const points = data?.points ?? [];
  const highest = Math.max(0, ...points.map((point) => point.units));
  const precision = 10 ** Math.floor(Math.log10(Math.max(1, highest / 4)));
  const step = Math.max(1, Math.ceil(highest / 4 / precision) * precision);
  const maximum = step * 4;
  const lastSaleIndex = points.reduce(
    (last, point, index) => (point.units > 0 ? index : last),
    -1,
  );
  const activeIndex =
    hoveredIndex ??
    selectedIndex ??
    (lastSaleIndex >= 0 ? lastSaleIndex : points.length - 1);

  return (
    <section
      aria-labelledby="dashboard-units-title"
      className="dashboard-units min-w-0 rounded-lg border border-sidebar-border bg-sidebar p-[18px] pb-8"
    >
      <div className="dashboard-units-header flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="dashboard-units-title"
            className="text-lg font-semibold text-foreground"
          >
            Unidades vendidas
          </h2>
          <p className="text-sm text-muted-foreground">
            {data?.meta.subtitle ??
              (period === "week" ? "Últimos 7 días" : "Unidades por mes")}
          </p>
        </div>
        <div
          role="group"
          aria-label="Período de unidades vendidas"
          className="flex rounded-md border border-sidebar-border bg-background p-0.5"
        >
          {periods.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={period === option.id}
              onClick={() => {
                setPeriod(option.id);
                setSelectedIndex(null);
                setHoveredIndex(null);
              }}
              className={cn(
                "rounded-[6px] px-2.5 py-[5px] text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                period === option.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div
          className="dashboard-units-placeholder flex h-[290px] items-center justify-center text-sm text-muted-foreground"
          role="status"
        >
          Cargando unidades vendidas...
        </div>
      ) : error || !data ? (
        <div className="dashboard-units-placeholder flex h-[290px] flex-col items-center justify-center gap-3 text-sm">
          <p role="alert" className="text-destructive">
            No se pudo cargar el gráfico.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-md border border-border bg-background px-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-ring"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <div className="dashboard-units-scroll mt-3 overflow-x-auto pb-2 pt-12">
            <div
              className={cn(
                "dashboard-units-grid grid grid-cols-[28px_minmax(0,1fr)] gap-x-2 gap-y-2.5",
                period === "month"
                  ? "min-w-[560px] sm:min-w-0"
                  : "min-w-[260px]",
              )}
            >
              <div
                aria-hidden="true"
                className="dashboard-units-axis sticky left-0 z-10 flex h-[200px] flex-col justify-between bg-sidebar text-right text-[12px] leading-none text-muted-foreground tabular-nums"
              >
                {[4, 3, 2, 1, 0].map((tick) => (
                  <span key={tick}>{unitsFormatter.format(step * tick)}</span>
                ))}
              </div>
              <div
                role="group"
                aria-label={
                  period === "week" ? "Unidades por día" : "Unidades por mes"
                }
                onMouseLeave={() => setHoveredIndex(null)}
                className="dashboard-units-bars flex h-[200px] gap-3 border-b border-sidebar-border"
              >
                {points.map((point, index) => {
                  const active = index === activeIndex;
                  const height = (point.units / maximum) * 100;

                  return (
                    <button
                      key={point.from}
                      type="button"
                      aria-label={`${point.fullLabel}: ${unitsFormatter.format(point.units)} unidades`}
                      aria-pressed={active}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onFocus={() => {
                        setHoveredIndex(null);
                        setSelectedIndex(index);
                      }}
                      onClick={() => setSelectedIndex(index)}
                      className="relative flex h-full min-w-0 flex-1 items-end rounded-t-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "w-full rounded-t-lg rounded-b-[4px] transition-colors",
                          active ? "bg-brand" : "bg-chart-bar",
                        )}
                        style={{ height: `${height}%` }}
                      />
                      {active && (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-md bg-foreground px-2.5 py-[5px] text-center leading-tight text-background",
                            index === 0 && "left-0 translate-x-0",
                            index === points.length - 1 &&
                              "right-0 left-auto translate-x-0",
                          )}
                          style={{ bottom: `calc(${height}% + 8px)` }}
                        >
                          <span className="block text-[11px] text-background/70">
                            Unidades
                          </span>
                          <span className="block text-sm font-semibold tabular-nums">
                            {unitsFormatter.format(point.units)}
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div aria-hidden="true" className="col-start-2 flex gap-3">
                {points.map((point, index) => (
                  <span
                    key={point.from}
                    className={cn(
                      "min-w-0 flex-1 text-center text-[12px]",
                      index === activeIndex
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {point.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {highest === 0 && (
            <p className="mt-2 text-sm text-muted-foreground" role="status">
              Sin unidades vendidas en este período.
            </p>
          )}
        </>
      )}
    </section>
  );
}
