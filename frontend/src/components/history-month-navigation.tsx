import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  getHistoryMonthPreview,
  groupHistoryMonthsByYear,
  HISTORY_MONTH_PREVIEW_LIMIT,
  type HistoryYearGroup,
} from "@/lib/history-months";
import type { HistoryMonth } from "@/lib/repositories/history-repository";
import { cn } from "@/lib/utils";

type MonthNavigationProps = {
  months: readonly HistoryMonth[];
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
};

export function HistoryMonthNavigation({
  months,
  selectedMonth,
  onSelectMonth,
}: MonthNavigationProps) {
  const years = useMemo(() => groupHistoryMonthsByYear(months), [months]);

  return (
    <aside className="border-b border-border lg:border-b-0 lg:border-r">
      <div className="border-b border-border app-card-header">
        <h2 className="font-semibold app-card-title">Meses con actividad</h2>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {months.length} {months.length === 1 ? "mes" : "meses"} ·{" "}
          {years.length} {years.length === 1 ? "año" : "años"}
        </div>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto p-2 lg:max-h-[calc(var(--app-viewport-height)-13rem)]">
        {years.map((group) => (
          <HistoryYearMonths
            key={group.year}
            group={group}
            selectedMonth={selectedMonth}
            onSelectMonth={onSelectMonth}
          />
        ))}
        {months.length === 0 && (
          <div className="px-3 py-6 text-sm text-muted-foreground">
            Todavía no hay actividad registrada.
          </div>
        )}
      </div>
    </aside>
  );
}

function HistoryYearMonths({
  group: { year, months },
  selectedMonth,
  onSelectMonth,
}: Pick<MonthNavigationProps, "selectedMonth" | "onSelectMonth"> & {
  group: HistoryYearGroup;
}) {
  const [expanded, setExpanded] = useState(
    selectedMonth.startsWith(`${year}-`),
  );
  const [showAllMonths, setShowAllMonths] = useState(false);
  const yearButtonRef = useRef<HTMLButtonElement>(null);
  const panelId = `history-year-${year}`;
  const listId = `history-months-${year}`;
  const preview = getHistoryMonthPreview(months, selectedMonth);
  const visibleMonths = showAllMonths ? months : preview;
  const remainingMonths = months.length - preview.length;

  useEffect(() => {
    if (selectedMonth.startsWith(`${year}-`)) setExpanded(true);
  }, [selectedMonth, year]);

  const toggleMonths = () => {
    if (showAllMonths) {
      yearButtonRef.current?.scrollIntoView({ block: "nearest" });
    }
    setShowAllMonths((current) => !current);
  };

  return (
    <div>
      <button
        ref={yearButtonRef}
        type="button"
        aria-label={`Año ${year}, ${months.length} ${months.length === 1 ? "mes" : "meses"}`}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
        />
        <span>{year}</span>
        {!expanded && (
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {months.length} {months.length === 1 ? "mes" : "meses"}
          </span>
        )}
      </button>
      <div id={panelId} hidden={!expanded} className="ml-5">
        <div id={listId}>
          {visibleMonths.map((month) => {
            const active = month.month === selectedMonth;
            return (
              <button
                key={month.month}
                type="button"
                aria-label={`${month.label}, ${month.eventCount} ${month.eventCount === 1 ? "movimiento" : "movimientos"}`}
                aria-current={active ? "page" : undefined}
                onClick={() => onSelectMonth(month.month)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <span className="capitalize">
                  {month.label.replace(` de ${year}`, "")}
                </span>
                <span className="tabular-nums text-xs">{month.eventCount}</span>
              </button>
            );
          })}
        </div>
        {months.length > HISTORY_MONTH_PREVIEW_LIMIT && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showAllMonths}
            aria-controls={listId}
            onClick={toggleMonths}
            className="mt-1 w-full justify-start px-3 text-muted-foreground"
          >
            {showAllMonths
              ? "Ver menos"
              : `Ver ${remainingMonths} ${remainingMonths === 1 ? "mes" : "meses"} más`}
          </Button>
        )}
      </div>
    </div>
  );
}
