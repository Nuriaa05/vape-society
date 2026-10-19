import { KpiCard, CardHeader } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { money } from "@/lib/collections-form";
import type { SupplierDebtSummary } from "@/lib/supplier-credit";
import { Banknote, CalendarClock, CircleAlert, Wallet } from "lucide-react";

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={
            <Wallet
              className="size-4 text-warning-foreground"
              aria-hidden="true"
            />
          }
          label="Deuda pendiente"
          value={loading ? "..." : data ? money(data.balanceCents) : "—"}
          hint={`Reintegros a favor: ${loading ? "..." : data ? money(data.refundPendingCents) : "—"}`}
        />
        <KpiCard
          icon={
            <CircleAlert
              className="size-4 text-destructive"
              aria-hidden="true"
            />
          }
          label="Deuda vencida"
          value={loading ? "..." : data ? money(data.overdueCents) : "—"}
          hint="Incluida en la deuda pendiente"
        />
        <KpiCard
          icon={<Banknote className="size-4 text-success" aria-hidden="true" />}
          label="Pagado en el mes"
          value={loading ? "..." : data ? money(data.paidAmountCents) : "—"}
          hint="Pagos registrados en el mes seleccionado"
        />
        <KpiCard
          icon={
            <CalendarClock className="size-4 text-accent" aria-hidden="true" />
          }
          label="Vence este mes"
          value={loading ? "..." : data ? money(data.dueThisMonthCents) : "—"}
          hint="Vencimientos pendientes del mes seleccionado"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudieron cargar los saldos.{" "}
          <Button variant="outline" size="sm" onClick={retry}>
            Reintentar
          </Button>
        </p>
      ) : null}
    </section>
  );
}
