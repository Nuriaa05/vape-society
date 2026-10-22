import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateAR, formatDateInputAR, TZ } from "@/lib/formatters";
import { dateRangeToReportSearch } from "@/lib/profit-reports";
import {
  buildReportDateRange,
  getReportRangeLabel,
} from "@/lib/report-exports";
import {
  getCalendarDays,
  getCalendarMonths,
  getReportShortcut,
  moveCalendarDay,
  shiftCalendarMonth,
  type ReportShortcut,
} from "@/lib/report-date-range";
import type { ReportDateRange } from "@/lib/repositories";
import { cn } from "@/lib/utils";

const monthFormatter = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  timeZone: TZ,
});
const dayFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TZ,
});
const weekdays = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
const shortcuts: Array<{ id: ReportShortcut; label: string }> = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "last7", label: "Últimos 7 días" },
  { id: "last30", label: "Últimos 30 días" },
  { id: "thisMonth", label: "Este mes" },
  { id: "lastMonth", label: "Mes anterior" },
];

function getSelectedDays(value?: ReportDateRange) {
  if (!value) return null;
  const search = dateRangeToReportSearch(value);
  return { start: search.desde!, end: search.hasta! };
}

export function ReportDateRangePicker({
  value,
  onChange,
  disabled = false,
  mode = "range",
}: {
  value?: ReportDateRange;
  onChange: (range: ReportDateRange | undefined) => void;
  disabled?: boolean;
  mode?: "range" | "day";
}) {
  const today = formatDateInputAR().padStart(10, "0");
  const selectedDays = getSelectedDays(value);
  const selected =
    mode === "day" && selectedDays?.start !== selectedDays?.end
      ? null
      : selectedDays;
  const dayLabel = selected
    ? formatDateAR(`${selected.start}T12:00:00Z`)
    : "Seleccionar fecha";
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const initialMonth = (selected?.start ?? today).slice(0, 7);
    return mode === "day" ? initialMonth : getCalendarMonths(initialMonth)[0];
  });
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [focusedDay, setFocusedDay] = useState(selected?.start ?? today);
  const calendarRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);
  const instructionsId = useId();
  const [, secondMonth] = getCalendarMonths(month);
  const previewEnd = hoveredDay ?? focusedDay;
  const range = anchor
    ? {
        start: anchor < previewEnd ? anchor : previewEnd,
        end: anchor > previewEnd ? anchor : previewEnd,
      }
    : selected;

  useEffect(() => {
    if (pendingFocus.current) {
      calendarRef.current
        ?.querySelector<HTMLButtonElement>(`button[data-date="${focusedDay}"]`)
        ?.focus();
      pendingFocus.current = false;
    }
  }, [month, focusedDay]);

  function changeOpen(next: boolean) {
    if (next) {
      const first = selected?.start ?? today;
      const initialMonth = first.slice(0, 7);
      setMonth(
        mode === "day" ? initialMonth : getCalendarMonths(initialMonth)[0],
      );
      setFocusedDay(first);
      setAnchor(null);
      setHoveredDay(null);
    }
    setOpen(next);
  }

  function selectDay(day: string) {
    setFocusedDay(day);
    setHoveredDay(null);
    if (mode === "day") {
      onChange(buildReportDateRange(day, day));
      setOpen(false);
      return;
    }
    if (!anchor) {
      setAnchor(day);
      return;
    }
    onChange(
      buildReportDateRange(
        day < anchor ? day : anchor,
        day > anchor ? day : anchor,
      ),
    );
    setOpen(false);
  }

  function moveFocus(day: string, event: KeyboardEvent<HTMLButtonElement>) {
    const next = moveCalendarDay(day, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    if (next === day) return;
    pendingFocus.current = true;
    setHoveredDay(null);
    setFocusedDay(next);
    const nextMonth = next.slice(0, 7);
    if (nextMonth < month) setMonth(nextMonth);
    else if (nextMonth > (mode === "day" ? month : secondMonth))
      setMonth(mode === "day" ? nextMonth : shiftCalendarMonth(nextMonth, -1));
  }

  function navigateMonth(offset: number) {
    const shifted = shiftCalendarMonth(month, offset);
    const next = mode === "day" ? shifted : getCalendarMonths(shifted)[0];
    setMonth(next);
    setFocusedDay(`${next}-01`);
    setHoveredDay(null);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={
            mode === "day"
              ? `Elegir día: ${dayLabel}`
              : `Rango de fechas: ${value ? getReportRangeLabel(value) : "Seleccionar fechas"}`
          }
          className="max-w-full justify-between px-3 print:hidden"
        >
          <CalendarDays aria-hidden="true" />
          <span>{mode === "day" ? "Elegir día" : "Período"}</span>
          <ChevronDown aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={mode === "day" ? "end" : "start"}
        role="dialog"
        aria-label={mode === "day" ? "Elegir día" : "Elegir rango de fechas"}
        aria-describedby={instructionsId}
        className={cn(
          "max-w-[calc(100vw-2rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-3",
          mode === "day" ? "w-80" : "w-[40rem]",
        )}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          calendarRef.current
            ?.querySelector<HTMLButtonElement>('button[tabindex="0"]')
            ?.focus();
        }}
      >
        <p className="mb-2 text-xs text-muted-foreground">
          {mode === "day" ? (
            selected ? (
              `Día seleccionado: ${dayLabel}`
            ) : (
              "Elegí el día a consultar."
            )
          ) : (
            <>
              {value ? `${getReportRangeLabel(value)} · ` : ""}Incluye ambos
              días.
            </>
          )}
        </p>
        <div
          className="flex flex-wrap gap-1 border-b border-border pb-3"
          aria-label="Atajos de fechas"
        >
          {shortcuts
            .filter(
              (shortcut) =>
                mode === "range" ||
                shortcut.id === "today" ||
                shortcut.id === "yesterday",
            )
            .map((shortcut) => (
              <Button
                key={shortcut.id}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange(getReportShortcut(shortcut.id));
                  setOpen(false);
                }}
              >
                {shortcut.label}
              </Button>
            ))}
          {(mode === "day" ? selected : value) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              {mode === "day" ? "Ver todo el mes" : "Quitar filtro"}
            </Button>
          )}
        </div>
        <div className="my-2 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Mostrar mes anterior"
            disabled={month === "0001-01"}
            onClick={() => navigateMonth(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <p className="text-xs text-muted-foreground">
            {mode === "day"
              ? "Elegí un día"
              : anchor
                ? "Elegí la fecha final"
                : "Elegí la fecha inicial"}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Mostrar mes siguiente"
            disabled={month === (mode === "day" ? "9999-12" : "9999-11")}
            onClick={() => navigateMonth(1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <div
          ref={calendarRef}
          className={cn(
            "grid grid-cols-1 gap-4",
            mode === "range" && "sm:grid-cols-2",
          )}
          onMouseLeave={() => setHoveredDay(null)}
        >
          {(mode === "day" ? [month] : [month, secondMonth]).map(
            (visibleMonth) => (
              <CalendarMonth
                key={visibleMonth}
                month={visibleMonth}
                range={range}
                today={today}
                focusedDay={focusedDay}
                instructionsId={instructionsId}
                multiple={mode === "range"}
                onSelect={selectDay}
                onFocus={setFocusedDay}
                onPreview={(day) => {
                  if (anchor) setHoveredDay(day);
                }}
                onKeyDown={moveFocus}
              />
            ),
          )}
        </div>
        <p
          id={instructionsId}
          role="status"
          className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground"
        >
          {mode === "day"
            ? "La consulta se actualiza al elegir la fecha."
            : anchor
              ? "Elegí el último día para aplicar el rango. Podés repetir la fecha para consultar un solo día."
              : "Seleccioná inicio y fin. El rango se aplica al elegir el segundo día."}
        </p>
      </PopoverContent>
      {mode === "range" && (
        <span className="hidden print:inline">
          {value ? getReportRangeLabel(value) : "Vista sin filtro de fechas"}
        </span>
      )}
    </Popover>
  );
}

function CalendarMonth({
  month,
  range,
  today,
  focusedDay,
  instructionsId,
  multiple,
  onSelect,
  onFocus,
  onPreview,
  onKeyDown,
}: {
  month: string;
  range: { start: string; end: string } | null;
  today: string;
  focusedDay: string;
  instructionsId: string;
  multiple: boolean;
  onSelect: (day: string) => void;
  onFocus: (day: string) => void;
  onPreview: (day: string) => void;
  onKeyDown: (day: string, event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const label = monthFormatter.format(new Date(`${month}-01T12:00:00Z`));
  const days = getCalendarDays(month);
  return (
    <div className="min-w-0">
      <h3 className="mb-3 text-center text-sm font-medium">
        {label.charAt(0).toLocaleUpperCase("es-AR") + label.slice(1)}
      </h3>
      <table
        role="grid"
        aria-label={label}
        aria-multiselectable={multiple}
        className="w-full table-fixed border-separate border-spacing-0"
      >
        <thead>
          <tr>
            {weekdays.map((day) => (
              <th
                key={day}
                scope="col"
                className="pb-2 text-center text-xs font-normal text-muted-foreground"
              >
                <abbr title={day} className="no-underline">
                  {day.slice(0, 2)}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, row) => (
            <tr key={row}>
              {days.slice(row * 7, row * 7 + 7).map((day, index) => {
                const inRange = Boolean(
                  day && range && day >= range.start && day <= range.end,
                );
                const endpoint = Boolean(
                  day && range && (day === range.start || day === range.end),
                );
                return (
                  <td
                    key={day ?? `empty-${index}`}
                    aria-selected={day ? inRange : undefined}
                    className={cn(
                      "h-10 p-0 text-center",
                      inRange && "bg-primary/10",
                      day === range?.start && "rounded-l-md",
                      day === range?.end && "rounded-r-md",
                    )}
                  >
                    {day && (
                      <button
                        type="button"
                        data-date={day}
                        tabIndex={focusedDay === day ? 0 : -1}
                        aria-label={dayFormatter.format(
                          new Date(`${day}T12:00:00Z`),
                        )}
                        aria-current={day === today ? "date" : undefined}
                        aria-describedby={instructionsId}
                        onClick={() => onSelect(day)}
                        onFocus={() => onFocus(day)}
                        onMouseEnter={() => onPreview(day)}
                        onKeyDown={(event) => onKeyDown(day, event)}
                        className={cn(
                          "size-9 rounded-md text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                          endpoint
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "hover:bg-muted",
                          day === today &&
                            !endpoint &&
                            "font-semibold text-primary underline underline-offset-4",
                        )}
                      >
                        {Number(day.slice(8))}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
