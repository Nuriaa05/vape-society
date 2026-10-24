import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { formatARS } from "@/lib/formatters";
import { formatProfitAmount } from "@/lib/profit-reports";
import { cn } from "@/lib/utils";
import type {
  ProfitBucket,
  ProfitReport,
} from "@/lib/repositories/profit-reports-repository";

const PREVIEW_ROWS = 6;

export function ProfitReportTable({
  report,
  disabled,
  onSelect,
}: {
  report: ProfitReport;
  disabled: boolean;
  onSelect: (bucket: ProfitBucket) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(0);
  const tableRef = useRef<HTMLTableElement>(null);
  const hasMore = report.buckets.length > PREVIEW_ROWS;

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    const rows = Array.from(table.tBodies[0]?.rows ?? []).slice(
      0,
      PREVIEW_ROWS,
    );
    const header = table.tHead;
    const updatePreviewHeight = () => {
      setPreviewHeight(
        (header?.offsetHeight ?? 0) +
          rows.reduce((height, row) => height + row.offsetHeight, 0),
      );
    };

    updatePreviewHeight();
    const observer = new ResizeObserver(updatePreviewHeight);
    observer.observe(table);
    if (header) observer.observe(header);
    rows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [report.buckets, expanded]);

  return (
    <Card aria-busy={disabled}>
      <CardHeader
        title="Detalle de ganancias"
        description="Ventas entregadas menos el costo histórico de sus productos. Los períodos parciales incluyen solo los días seleccionados."
      />
      <div
        role="region"
        aria-label="Detalle de ganancias"
        tabIndex={0}
        className={cn(
          "overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring print:max-h-none print:overflow-visible",
          expanded && "max-h-[var(--profit-preview-height)]",
        )}
        style={
          { "--profit-preview-height": `${previewHeight}px` } as CSSProperties
        }
      >
        <table
          ref={tableRef}
          className="w-full min-w-[740px] text-sm print:min-w-0"
        >
          <thead className="sticky top-0 z-10 border-y border-border bg-card text-left print:static">
            <tr>
              {[
                "Período",
                "Cantidad de ventas",
                "Ventas",
                "Costo",
                "Ganancia",
              ].map((label) => (
                <th key={label} className="app-table-heading font-medium">
                  {label}
                </th>
              ))}
              <th className="app-table-heading font-medium print:hidden">
                Detalle
              </th>
            </tr>
          </thead>
          <tbody>
            {report.buckets.map((bucket, index) => (
              <tr
                key={bucket.from}
                className={cn(
                  "border-b border-border/60",
                  !expanded &&
                    index >= PREVIEW_ROWS &&
                    "hidden print:table-row",
                )}
              >
                <td className="px-5 py-3">
                  {bucket.label}
                  {bucket.partial && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Parcial
                    </span>
                  )}
                  {bucket.missingCostSalesCount > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Historial de costo incompleto:{" "}
                      {bucket.missingCostSalesCount}
                    </p>
                  )}
                </td>
                <td className="px-5 py-3 tabular-nums">{bucket.salesCount}</td>
                <td className="px-5 py-3 whitespace-nowrap tabular-nums">
                  {formatARS(bucket.revenue)}
                </td>
                <td className="px-5 py-3 whitespace-nowrap tabular-nums">
                  {formatProfitAmount(bucket.cost)}
                </td>
                <td
                  className={cn(
                    "px-5 py-3 whitespace-nowrap font-medium tabular-nums",
                    bucket.profit !== null &&
                      bucket.profit < 0 &&
                      "text-destructive",
                  )}
                >
                  {formatProfitAmount(bucket.profit)}
                </td>
                <td className="px-5 py-3 print:hidden">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled || bucket.salesCount === 0}
                    onClick={() => onSelect(bucket)}
                    aria-label={`Ver ventas de ${bucket.label}`}
                  >
                    Ver ventas
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="flex justify-center border-t border-border px-5 py-3 print:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "Ver menos" : "Ver más"}
          </Button>
        </div>
      )}
    </Card>
  );
}
