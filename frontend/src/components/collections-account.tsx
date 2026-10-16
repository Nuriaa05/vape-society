import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/collections-controls";
import { money } from "@/lib/collections-form";
import { collectionsRepository as repo } from "@/lib/repositories/collections-repository";
import type { Customer, FinancialEntry } from "@/lib/collections";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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
      <p>
        Deuda del cliente:{" "}
        <strong>{money(query.data.balanceAmountCents)}</strong> · Vencido:{" "}
        {money(query.data.overdueAmountCents)}
      </p>
      {hasCards ? (
        <section
          aria-label="Tarjetas del cliente"
          className="flex flex-col gap-2 rounded-md border border-border p-3"
        >
          <h3 className="font-semibold">Tarjetas por acreditar</h3>
          <p>
            <strong>{money(query.data.cardPendingAmountCents ?? 0)}</strong> ·
            Neto estimado
          </p>
          {(query.data.cardUnscheduledAmountCents ?? 0) > 0 ? (
            <p>
              Por completar:{" "}
              <strong>{money(query.data.cardUnscheduledAmountCents)}</strong> de
              bruto, con fecha y comisión por definir.
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
      ) : null}
      <Actions>
        <Button disabled={query.data.balanceAmountCents <= 0} onClick={collect}>
          Registrar cobro
        </Button>
        <Button variant="outline" onClick={opening}>
          Deuda inicial
        </Button>
      </Actions>
      <h3 className="font-semibold">Planes y cuotas directas</h3>
      {query.data.installments.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Mes de las cuotas">
            <Input
              type="month"
              value={installmentMonth}
              onChange={(e) => setInstallmentMonth(e.target.value)}
            />
          </Field>
          <Field label="Estado de las cuotas">
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={installmentStatus}
              onChange={(e) => setInstallmentStatus(e.target.value)}
            >
              <option value="">Todas</option>
              {["Pendiente", "Parcial", "Pagada", "Vencida", "Anulada"].map(
                (status) => (
                  <option key={status}>{status}</option>
                ),
              )}
            </select>
          </Field>
        </div>
      ) : null}
      {query.data.plans.map((p) => (
        <div
          className="flex items-center justify-between gap-2 border-b border-border pb-2"
          key={p.id}
        >
          <span>
            {p.saleId ? "" : "Saldo anterior · "}
            {p.title} · {p.status}
          </span>
          {!p.saleId && !p.cancelledAt && p.status !== "Anulado" ? (
            <Button size="sm" variant="outline" onClick={() => cancel(p.id)}>
              Anular deuda inicial
            </Button>
          ) : null}
        </div>
      ))}
      {installments.length ? (
        <ul className="flex flex-col gap-2" aria-label="Cuotas del cliente">
          {installments.map((i) => (
            <li
              className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3 text-sm"
              key={i.id}
            >
              <div>
                <p className="font-medium">
                  {i.saleId ? "" : "Saldo anterior · "}
                  {i.title} · Cuota {i.number}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Vence {i.dueDate} · {i.status}
                </p>
              </div>
              <div className="text-right tabular-nums">
                <p>
                  Saldo: <strong>{money(i.remainingAmountCents)}</strong>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Importe: {money(i.amountCents)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {query.data.installments.length
            ? "No hay cuotas para estos filtros."
            : "Sin cuotas directas."}
        </p>
      )}
      <h3 className="font-semibold">Historial de cobros</h3>
      <EntryList entries={query.data.collections} reverse={reverse} />
      <h3 className="font-semibold">Historial de reintegros</h3>
      <EntryList entries={query.data.refunds} refund />
      <h3 className="font-semibold">Ventas asociadas</h3>
      {query.data.sales.map((s) => (
        <p key={s.id}>
          {s.number ?? s.id}
          {s.totalAmountCents !== undefined
            ? ` · ${money(s.totalAmountCents)}`
            : ""}
        </p>
      ))}
    </div>
  ) : null;
}
async function printReceipt(id: string, refund: boolean) {
  const popup = window.open("", "_blank", "width=500,height=700");
  if (!popup) {
    toast.error("Permití las ventanas emergentes para imprimir.");
    return;
  }
  try {
    const receipt = await repo.receipt(id, refund);
    popup.document.title = refund
      ? "Comprobante interno de reintegro"
      : "Comprobante interno de cobro";
    const title = popup.document.createElement("h1");
    title.textContent = popup.document.title;
    popup.document.body.append(title);
    const record = (value: unknown): Record<string, unknown> =>
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    const line = (label: string, value: unknown) => {
      if (value === undefined || value === null || value === "") return;
      const element = popup.document.createElement("p");
      element.textContent = `${label}${label ? ": " : ""}${String(value)}`;
      popup.document.body.append(element);
    };
    const business = record(receipt.business);
    const settings = record(receipt.receipt);
    const entry = record(refund ? receipt.refund : receipt.collection);
    const style = popup.document.createElement("style");
    style.textContent =
      "body{font:14px system-ui;max-width:380px;margin:24px auto;padding:12px}h1{font-size:20px}p{margin:8px 0}@media print{body{margin:0}}";
    popup.document.head.append(style);
    line("", business.name);
    line("Dirección", business.address);
    line("CUIT", business.cuit);
    line("Teléfono", business.phone);
    line("", settings.header);
    line("Fecha", entry.date);
    line("Cliente", entry.customerName);
    line("Medio", entry.paymentMethodName);
    line(
      "Importe",
      typeof entry.amountCents === "number"
        ? money(entry.amountCents)
        : undefined,
    );
    for (const [key, label] of [
      ["cashReceivedAmountCents", "Efectivo recibido"],
      ["changeAmountCents", "Vuelto"],
      ["cashOutAmountCents", "Dinero entregado"],
    ])
      if (typeof entry[key] === "number")
        line(label, money(entry[key] as number));
    line("Motivo", entry.reason);
    if (refund && Array.isArray(entry.cancellations)) {
      const cancelledAmountCents = entry.cancellations.reduce(
        (sum, value: unknown) => {
          const cancellation = record(value);
          return (
            sum +
            (typeof cancellation.grossAmountCents === "number"
              ? cancellation.grossAmountCents
              : 0)
          );
        },
        0,
      );
      if (cancelledAmountCents > 0)
        line(
          "Acreditaciones pendientes canceladas",
          money(cancelledAmountCents),
        );
    }
    if (entry.reversedAt) {
      line("Estado", "REVERTIDO");
      line("Motivo de reversión", entry.reversalReason);
    }
    const allocations = Array.isArray(receipt.allocations)
      ? receipt.allocations
      : [];
    for (const value of allocations) {
      const allocation = record(value);
      const installment = record(allocation.installment);
      const plan = record(installment.plan);
      line(
        `${String(plan.title ?? "Cuota")} · cuota ${String(installment.number ?? "")}`,
        typeof allocation.amountCents === "number"
          ? money(allocation.amountCents)
          : "",
      );
    }
    line("", settings.footer);
    line("", receipt.legend);
    popup.print();
  } catch (error) {
    popup.close();
    toast.error(
      error instanceof Error ? error.message : "No se pudo imprimir.",
    );
  }
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
