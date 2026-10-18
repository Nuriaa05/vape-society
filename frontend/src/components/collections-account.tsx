import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Disclosure } from "@/components/ui/disclosure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/collections-controls";
import { money } from "@/lib/collections-form";
import { collectionsRepository as repo } from "@/lib/repositories/collections-repository";
import type { Customer, FinancialEntry } from "@/lib/collections";
import { cn } from "@/lib/utils";
import { printReceipt } from "@/lib/collection-receipt";
import { formatDateAR } from "@/lib/formatters";
import { StatusBadge } from "@/components/app-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}
export function Account({
  customer,
  collect,
  opening,
  reverse,
  cancel,
  cards,
}: {
  customer: Customer;
  collect: () => void;
  opening: () => void;
  reverse: (id: string) => void;
  cancel: (id: string) => void;
  cards: () => void;
}) {
  const query = useQuery({
    queryKey: ["collections", "account", customer.id],
    queryFn: () => repo.account(customer.id),
  });
  const [installmentMonth, setInstallmentMonth] = useState("");
  const [installmentStatus, setInstallmentStatus] = useState("");
  const installments =
    query.data?.installments.filter(
      (installment) =>
        (!installmentMonth ||
          installment.dueDate.startsWith(installmentMonth)) &&
        (!installmentStatus || installment.status === installmentStatus),
    ) ?? [];
  const cancellablePlans =
    query.data?.plans.filter(
      (plan) => !plan.saleId && !plan.cancelledAt && plan.status !== "Anulado",
    ) ?? [];
  const hasCards =
    query.data?.sales.some(
      (sale) => sale.paymentTerms === "CardInstallments",
    ) ||
    (query.data?.cardPendingAmountCents ?? 0) > 0 ||
    (query.data?.cardUnscheduledAmountCents ?? 0) > 0;
  return query.isPending ? (
    <p>Cargando cuenta…</p>
  ) : query.error ? (
    <p role="alert">No se pudo cargar la cuenta.</p>
  ) : query.data ? (
    <div className="flex flex-col gap-4">
      {customer.phone || customer.notes ? (
        <p>{[customer.phone, customer.notes].filter(Boolean).join(" · ")}</p>
      ) : null}
      <div className="space-y-1 border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          Deuda pendiente con el negocio
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          {money(query.data.balanceAmountCents)}
        </p>
        <p
          className={cn(
            "text-sm",
            query.data.overdueAmountCents > 0
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {query.data.overdueAmountCents > 0
            ? `${money(query.data.overdueAmountCents)} tienen el vencimiento pasado.`
            : query.data.balanceAmountCents > 0
              ? "No tiene pagos vencidos."
              : "El cliente está al día."}
        </p>
      </div>

      <Actions>
        <Button disabled={query.data.balanceAmountCents <= 0} onClick={collect}>
          Registrar cobro
        </Button>
        <Button variant="outline" onClick={opening}>
          Cargar deuda anterior
        </Button>
      </Actions>
      <h3 className="font-semibold">Detalle de la deuda</h3>
      {query.data.installments.length > 0 ? (
        <Disclosure
          title="Filtrar cuotas"
          badge={
            installmentMonth || installmentStatus
              ? "Filtros activos"
              : undefined
          }
        >
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Mes de las cuotas">
              <Input
                type="month"
                value={installmentMonth}
                onChange={(e) => setInstallmentMonth(e.target.value)}
              />
            </Field>
            <Select
              value={installmentStatus || "all"}
              onValueChange={(value) =>
                setInstallmentStatus(value === "all" ? "" : value)
              }
            >
              <Field label="Estado de las cuotas">
                <SelectTrigger className="min-w-40">
                  <SelectValue />
                </SelectTrigger>
              </Field>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {["Pendiente", "Parcial", "Pagada", "Vencida", "Anulada"].map(
                  (status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            {installmentMonth || installmentStatus ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setInstallmentMonth("");
                  setInstallmentStatus("");
                }}
              >
                Restablecer filtros
              </Button>
            ) : null}
          </div>
        </Disclosure>
      ) : null}
      {query.data.plans.map((plan) => {
        const planInstallments = installments.filter(
          (item) => item.planId === plan.id,
        );
        if (!planInstallments.length) return null;
        return (
          <section
            key={plan.id}
            aria-label={`Deuda: ${plan.title}`}
            className="space-y-3"
          >
            <h4 className="font-medium">
              {plan.title}
              {plan.status === "Anulado" ? " · Anulada" : ""}
            </h4>
            <ul
              className="flex flex-col gap-2"
              aria-label={`Cuotas de ${plan.title}`}
            >
              {planInstallments.map((i) => {
                const overdue = i.status === "Vencida";
                const pending =
                  i.status === "Pendiente" || i.status === "Parcial";
                return (
                  <li
                    className={cn(
                      "flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 text-sm",
                      overdue
                        ? "border-destructive/30 bg-destructive/5"
                        : pending
                          ? "border-warning/30 bg-warning/5"
                          : "border-border",
                    )}
                    key={i.id}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">Cuota {i.number}</p>
                        <StatusBadge
                          tone={
                            overdue
                              ? "destructive"
                              : pending
                                ? "warning"
                                : i.status === "Pagada"
                                  ? "success"
                                  : "muted"
                          }
                        >
                          {i.status}
                        </StatusBadge>
                      </div>
                      <p
                        className={cn(
                          "mt-2 text-xs",
                          overdue
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        Vence {formatDateAR(`${i.dueDate}T12:00:00Z`)}
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p>
                        Saldo:{" "}
                        <strong
                          className={overdue ? "text-destructive" : undefined}
                        >
                          {money(i.remainingAmountCents)}
                        </strong>
                      </p>
                      {i.paidAmountCents > 0 &&
                      i.remainingAmountCents > 0 &&
                      i.remainingAmountCents !== i.amountCents ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Importe original: {money(i.amountCents)}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!installments.length ? (
        <p className="text-sm text-muted-foreground">
          {query.data.installments.length
            ? "No hay cuotas para estos filtros."
            : "Sin cuotas directas."}
        </p>
      ) : null}
      {hasCards ? (
        <Disclosure title="Tarjetas del cliente">
          <section
            aria-label="Tarjetas del cliente"
            className="flex flex-col gap-2"
          >
            <h3 className="font-semibold">Tarjetas por acreditar</h3>
            <p>
              <strong>{money(query.data.cardPendingAmountCents ?? 0)}</strong> ·
              Neto estimado
            </p>
            {(query.data.cardUnscheduledAmountCents ?? 0) > 0 ? (
              <p>
                Por completar:{" "}
                <strong>{money(query.data.cardUnscheduledAmountCents)}</strong>{" "}
                de bruto, con fecha y comisión por definir.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              El cliente paga las cuotas a su tarjeta. El procesador acredita el
              dinero al negocio.
            </p>
            <Actions>
              <Button size="sm" variant="outline" onClick={cards}>
                Ver tarjetas
              </Button>
            </Actions>
          </section>
        </Disclosure>
      ) : null}
      <h3 className="font-semibold">Historial de cobros</h3>
      <EntryList entries={query.data.collections} reverse={reverse} />
      {query.data.refunds.length > 0 ? (
        <>
          <h3 className="font-semibold">Historial de reintegros</h3>
          <EntryList entries={query.data.refunds} refund />
        </>
      ) : null}
      {query.data.sales.length > 0 ? (
        <Disclosure title={`Ventas asociadas (${query.data.sales.length})`}>
          <ul className="space-y-2 text-sm">
            {query.data.sales.map((sale) => (
              <li key={sale.id}>
                Venta {sale.number ?? sale.id}
                {sale.totalAmountCents !== undefined
                  ? ` · ${money(sale.totalAmountCents)}`
                  : ""}
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
      {cancellablePlans.length > 0 ? (
        <Disclosure title="Más opciones">
          <p className="text-sm text-muted-foreground">
            Anular una deuda sirve para corregir una carga equivocada. Si el
            cliente pagó, usá Registrar cobro.
          </p>
          {cancellablePlans.map((plan) => (
            <div
              key={plan.id}
              className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span>{plan.title}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancel(plan.id)}
              >
                Anular deuda anterior
              </Button>
            </div>
          ))}
        </Disclosure>
      ) : null}
    </div>
  ) : null;
}
export function EntryList({
  entries,
  refund = false,
  reverse,
}: {
  entries: FinancialEntry[];
  refund?: boolean;
  reverse?: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin movimientos.</p>
      ) : (
        entries.map((e) => (
          <div
            key={e.id}
            className={cn(
              "flex flex-wrap items-center gap-2 text-sm",
              e.reversedAt && "text-muted-foreground",
            )}
          >
            <span>
              {e.date} · {money(e.amountCents)} · {e.paymentMethodName}{" "}
              {e.reversedAt ? "(revertido)" : ""}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void printReceipt(e.id, refund)}
            >
              Imprimir
            </Button>
            {!e.reversedAt && reverse ? (
              <Button size="sm" variant="ghost" onClick={() => reverse(e.id)}>
                Revertir
              </Button>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
