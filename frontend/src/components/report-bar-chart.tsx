import { useState, type CSSProperties } from "react";

import { formatARS } from "@/lib/formatters";
import {
  buildReportChartScale,
  getReportChartBar,
  getReportChartPosition,
  type ReportChartPoint,
} from "@/lib/report-chart";
import { cn } from "@/lib/utils";

const axisFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  notation: "compact",
  maximumFractionDigits: 2,
});

export function ReportBarChart({
  data,
  selectedIdx,
  onSelect,
  signed = false,
}: {
  data: readonly ReportChartPoint[];
  selectedIdx: number | null;
  onSelect: (index: number) => void;
  signed?: boolean;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const activeIdx = hoverIdx ?? focusIdx ?? selectedIdx;
  const active = activeIdx !== null ? data[activeIdx] : null;
  const scale = buildReportChartScale(data.map((point) => point.v));
  const zeroPosition = getReportChartPosition(0, scale);
  const unavailable =
    data.length > 0 && data.every((point) => point.v === null);
  const gap = data.length > 14 ? "gap-1" : "gap-1.5";
  const labelWidth = Math.max(
    44,
    ...data.map((point) => Math.min(point.label.length, 10) * 7 + 12),
  );

  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground">
        Sin datos para el período seleccionado
      </div>
    );
  }

  return (
    <div className="relative h-full w-full min-w-0 max-w-full">
      {active ? (
        <div
          className="pointer-events-none absolute right-1 top-1 z-10 max-w-full rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md print:hidden"
          role="status"
        >
          <div className="break-words text-[10px] opacity-70">
            {active.fullLabel}
          </div>
          <div className="font-semibold tabular-nums">
            {active.v === null ? "No disponible" : formatARS(active.v)}
          </div>
        </div>
      ) : null}
      {unavailable ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          No disponible
        </div>
      ) : null}
      <div className="h-full w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain print:overflow-visible">
        <div
          className="flex h-full min-h-40 min-w-[var(--report-chart-min-width)] py-2 print:min-w-0"
          style={
            {
              "--report-chart-min-width": `${64 + data.length * labelWidth}px`,
            } as CSSProperties
          }
        >
          <div
            className="relative mb-6 w-16 shrink-0 text-right text-[10px] text-muted-foreground tabular-nums"
            aria-hidden="true"
          >
            {unavailable
              ? null
              : scale.ticks.map((tick) => (
                  <span
                    key={tick}
                    className="absolute right-2 -translate-y-1/2 whitespace-nowrap"
                    style={{ top: `${getReportChartPosition(tick, scale)}%` }}
                  >
                    {axisFormatter.format(tick)}
                  </span>
                ))}
          </div>
          <div className="relative flex min-w-0 flex-1 flex-col">
            <div className="relative flex-1">
              {unavailable
                ? null
                : scale.ticks.map((tick) => (
                    <div
                      key={tick}
                      className={cn(
                        "absolute left-0 right-0 border-t",
                        tick === 0
                          ? "border-foreground/40"
                          : "border-border/60",
                      )}
                      style={{ top: `${getReportChartPosition(tick, scale)}%` }}
                    />
                  ))}
              <div className={cn("absolute inset-0 flex print:gap-0.5", gap)}>
                {data.map((point, index) => {
                  const bar = getReportChartBar(point.v, scale);
                  const negative = point.v !== null && point.v < 0;
                  const isSelected = selectedIdx === index;
                  const isActive = activeIdx === index;
                  const amount =
                    point.v === null ? "No disponible" : formatARS(point.v);

                  return (
                    <button
                      key={`${point.from}-${point.to}-${index}`}
                      type="button"
                      onMouseEnter={() => setHoverIdx(index)}
                      onMouseLeave={() => setHoverIdx(null)}
                      onFocus={() => setFocusIdx(index)}
                      onBlur={() => setFocusIdx(null)}
                      onClick={() => onSelect(index)}
                      className={cn(
                        "group relative h-full min-w-0 flex-1 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        isSelected
                          ? "bg-muted/40 ring-1 ring-inset ring-border"
                          : "",
                      )}
                      aria-label={`${point.fullLabel}: ${amount}`}
                      aria-pressed={isSelected}
                    >
                      {bar && point.v !== 0 ? (
                        <span
                          className={cn(
                            "absolute inset-x-0 transition-colors",
                            negative ? "rounded-b" : "rounded-t",
                            signed
                              ? negative
                                ? "bg-red-500"
                                : "bg-emerald-500"
                              : isActive || isSelected
                                ? "bg-brand"
                                : "bg-chart-bar group-hover:bg-brand/80",
                            signed && isActive ? "brightness-110" : "",
                          )}
                          style={{
                            top: negative ? `${zeroPosition}%` : undefined,
                            bottom: negative
                              ? undefined
                              : `${100 - zeroPosition}%`,
                            height: `max(1px, ${bar.height}%)`,
                          }}
                        />
                      ) : point.v === null ? (
                        <span
                          className={cn(
                            "absolute left-1/2 -translate-x-1/2 text-[11px] text-muted-foreground",
                            zeroPosition > 50 || unavailable
                              ? "-translate-y-full"
                              : "",
                          )}
                          style={{ top: `${unavailable ? 85 : zeroPosition}%` }}
                          aria-hidden="true"
                        >
                          —
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={cn("mt-2 flex h-4 shrink-0 print:gap-0.5", gap)}>
              {data.map((point, index) => (
                <span
                  key={`${point.from}-${point.to}-${index}`}
                  className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground"
                  title={point.fullLabel}
                >
                  {point.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
