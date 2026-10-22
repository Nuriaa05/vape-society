import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { formatARS } from "@/lib/formatters";
import { formatProfitAmount } from "@/lib/profit-reports";
import { cn } from "@/lib/utils";
import type {
  ProfitBucket,
  ProfitReport,
} from "@/lib/repositories/profit-reports-repository";

export function ProfitReportTable({
  report,
  disabled,
  onSelect,
}: {
  report: ProfitReport;
  disabled: boolean;
  onSelect: (bucket: ProfitBucket) => void;
}) {
  return (
    <Card aria-busy={disabled}>
      <CardHeader
        title="Detalle de ganancias"
        description="Ventas entregadas menos el costo histórico de sus productos. Los períodos parciales incluyen solo los días seleccionados."
      />
      <div className="max-h-[30rem] overflow-auto print:max-h-none print:overflow-visible">
        <table className="w-full min-w-[740px] text-sm print:min-w-0">
          <thead className="border-y border-border bg-muted/30 text-left">
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
            {report.buckets.map((bucket) => (
              <tr key={bucket.from} className="border-b border-border/60">
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
    </Card>
  );
}
