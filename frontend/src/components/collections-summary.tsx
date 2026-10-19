import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateInputAR, formatMonthYearAR } from "@/lib/formatters";
import { formatAmountCentsAsARS } from "@/lib/money";
import { collectionsRepository } from "@/lib/repositories/collections-repository";
import type { CollectionsSummary as Summary } from "@/lib/collections";

const indicators: Array<{
  key: keyof Summary;
  label: string;
  compact?: boolean;
}> = [
  { key: "customerDebtAmountCents", label: "Deuda de clientes", compact: true },
  { key: "overdueAmountCents", label: "Deuda vencida", compact: true },
  { key: "monthCommitmentsAmountCents", label: "Cuotas pendientes del mes" },
  {
    key: "cardUnscheduledAmountCents",
    label: "Tarjetas por completar (bruto)",
  },
  {
    key: "cardPendingAmountCents",
    label: "Tarjetas pendientes (neto estimado)",
    compact: true,
  },
  {
    key: "collectedAmountCents",
    label: "Cobros registrados del mes",
    compact: true,
  },
  { key: "refundedAmountCents", label: "Egresos por devoluciones del mes" },
  { key: "pendingRefundAmountCents", label: "Pendiente de devolver" },
];

export function CollectionsSummary({ compact = false }: { compact?: boolean }) {
  const month = formatDateInputAR().slice(0, 7);
  const query = useQuery({
    queryKey: ["collections", "summary", month, ""],
    queryFn: () => collectionsRepository.summary({ month }),
  });
  return (
    <Card className="mt-5">
      <CardHeader
        title="Cobranzas"
        description={formatMonthYearAR()}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/clientes-cobranzas">Cobranzas</Link>
          </Button>
        }
      />
      <CardBody>
        {query.isPending ? (
          <p className="text-sm text-muted-foreground">Cargando cobranzas...</p>
        ) : query.isError ? (
          <p className="text-sm text-destructive">
            No se pudieron cargar las cobranzas.
          </p>
        ) : (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {indicators
              .filter((item) => !compact || item.compact)
              .map((item) => (
                <div key={item.key}>
                  <dt className="text-xs text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">
                    {formatAmountCentsAsARS(query.data[item.key] ?? 0)}
                  </dd>
                </div>
              ))}
          </dl>
        )}
        {!compact && (
          <p className="mt-4 text-xs text-muted-foreground">
            Los cobros corresponden a su fecha efectiva. Las ventas anteriores
            sin seguimiento financiero no generan cobros históricos.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
