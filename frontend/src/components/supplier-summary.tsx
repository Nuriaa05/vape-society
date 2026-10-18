import { Disclosure } from "@/components/ui/disclosure";
import { KpiCard, CardHeader } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { money } from "@/lib/collections-form";
import type { SupplierDebtSummary } from "@/lib/supplier-credit";

export function SupplierSummary({
  data,
  loading,
  error,
  month,
  onMonth,
  retry,
}: {
  data?: SupplierDebtSummary;
  loading: boolean;
  error: boolean;
  month: string;
  onMonth: (month: string) => void;
  retry: () => void;
}) {
  return (
    <section aria-label="Resumen de proveedores" className="space-y-4">
      <CardHeader
        title="Cuenta de proveedores"
        className="p-0"
        action={
          <div className="flex items-center gap-2">
            <Label htmlFor="supplier-summary-month">Mes</Label>
            <Input
              id="supplier-summary-month"
              className="w-auto"
              type="month"
              value={month}
              onChange={(event) => onMonth(event.target.value)}
            />
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Deuda pendiente"
          value={loading ? "..." : data ? money(data.balanceCents) : "—"}
          hint="Total que debés a los proveedores"
        />
        <KpiCard
          label="Deuda vencida"
          value={loading ? "..." : data ? money(data.overdueCents) : "—"}
          hint="Incluida en la deuda pendiente"
        />
        <KpiCard
          label="Pagado en el mes"
          value={loading ? "..." : data ? money(data.paidAmountCents) : "—"}
          hint="Pagos registrados en el mes seleccionado"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudieron cargar los saldos.{" "}
          <Button variant="outline" size="sm" onClick={retry}>
            Reintentar
          </Button>
        </p>
      ) : data ? (
        <Disclosure title="Vencimientos del mes y reintegros">
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
            <span>
              Vence en el mes: <strong>{money(data.dueThisMonthCents)}</strong>
            </span>
            <span>
              Reintegros por recibir:{" "}
              <strong>{money(data.refundPendingCents)}</strong>
            </span>
          </div>
        </Disclosure>
      ) : null}
    </section>
  );
}
