import {
  money,
  today,
  readMoney,
  allocationAmounts,
  createFinancialOperationResolver,
} from "@/lib/collections-form";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { collectionsRepository as repo } from "@/lib/repositories/collections-repository";
import { settingsRepository } from "@/lib/repositories/settings-repository";
import type {
  Customer,
  CardSettlementRow,
  RefundSourceRow,
} from "@/lib/collections";
import { Amount, DateField, Field } from "./collections-controls";

type Submit = (action: () => Promise<unknown>) => void;
export function CustomerForm({
  customer,
  submit,
  pending,
}: {
  customer?: Customer;
  submit: Submit;
  pending: boolean;
}) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() =>
          repo.saveCustomer({
            id: customer?.id,
            name: name.trim(),
            phone: phone.trim(),
            notes: notes.trim(),
          }),
        );
      }}
    >
      <Field label="Nombre">
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Teléfono">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="Notas">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button disabled={pending || !name.trim()}>Guardar cliente</Button>
    </form>
  );
}
export function OpeningForm({
  customerId,
  submit,
  pending,
}: {
  customerId: string;
  submit: Submit;
  pending: boolean;
}) {
  const [operationFor] = useState(() => createFinancialOperationResolver());
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [count, setCount] = useState("1");
  const [date, setDate] = useState(today());
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => {
          const payload = {
            title: title.trim(),
            totalAmountCents: readMoney(amount),
            installmentCount: Number(count),
            firstDueDate: date,
          };
          return repo.openingBalance(customerId, {
            ...payload,
            operationId: operationFor(payload),
          });
        });
      }}
    >
      <p className="text-sm text-muted-foreground">
        Saldo previo sin venta ni movimiento de stock. Cuotas mensuales fijas,
        sin interés por mora.
      </p>
      <Field label="Concepto">
        <Input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Amount label="Deuda inicial" value={amount} onChange={setAmount} />
      <Field label="Cantidad de cuotas">
        <Input
          required
          type="number"
          min="1"
          max="120"
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </Field>
      <Field label="Primer vencimiento">
        <Input
          required
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <Button disabled={pending}>Registrar deuda inicial</Button>
    </form>
  );
}
function Method({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsRepository.getSettings(),
  });
  return (
    <Field label="Medio de pago">
      <select
        required
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Seleccionar medio</option>
        {query.data?.paymentMethods
          .filter((m) => m.enabled && m.collectionEligible)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
      </select>
    </Field>
  );
}
export function CollectionForm({
  customerId,
  submit,
  pending,
}: {
  customerId: string;
  submit: Submit;
  pending: boolean;
}) {
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsRepository.getSettings(),
  });
  const query = useQuery({
    queryKey: ["collections", "account", customerId],
    queryFn: () => repo.account(customerId),
  });
  const [operationFor] = useState(() => createFinancialOperationResolver());
  const [values, setValues] = useState<Record<string, string>>({});
  const [method, setMethod] = useState("");
  const [date, setDate] = useState(today());
  const [cash, setCash] = useState("");
  const isCash =
    settings.data?.paymentMethods.find((item) => item.id === method)
      ?.cashHandling ?? false;
  const rows = (query.data?.installments ?? []).filter(
    (row) => row.remainingAmountCents > 0 && row.status !== "Anulada",
  );
  let total = 0;
  try {
    total = allocationAmounts(rows, values).reduce(
      (sum, row) => sum + row.amountCents,
      0,
    );
  } catch {
    /* Validation is shown on submit. */
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(async () => {
          const allocations = allocationAmounts(rows, values);
          const amountCents = allocations.reduce(
            (sum, row) => sum + row.amountCents,
            0,
          );
          if (!amountCents)
            throw new Error("Ingresá un importe en al menos una cuota.");
          const payload = {
            customerId,
            date,
            paymentMethodId: method,
            amountCents,
            allocations,
            ...(isCash ? { cashReceivedAmountCents: readMoney(cash) } : {}),
          };
          return repo.collect({
            ...payload,
            operationId: operationFor(payload),
          });
        });
      }}
    >
      <p className="text-sm text-muted-foreground">
        Elegí explícitamente las cuotas y el importe para cada una. Se permiten
        pagos parciales y anticipados de distintos planes del cliente.
      </p>
      {query.isPending ? (
        <p>Cargando cuotas…</p>
      ) : query.error ? (
        <p role="alert">No se pudieron cargar las cuotas.</p>
      ) : rows.length === 0 ? (
        <p>No hay cuotas pendientes.</p>
      ) : (
        rows.map((row) => (
          <div
            key={row.id}
            className="grid items-center gap-2 border-b border-border pb-3 sm:grid-cols-2"
          >
            <div className="text-sm">
              {row.saleId ? "" : "Saldo anterior · "}
              {row.title} · Cuota {row.number}
              <br />
              {row.dueDate} · Saldo {money(row.remainingAmountCents)}
            </div>
            <Amount
              label={`Importe cuota ${row.number} de ${row.title}`}
              value={values[row.id] ?? ""}
              onChange={(value) =>
                setValues((previous) => ({ ...previous, [row.id]: value }))
              }
            />
          </div>
        ))
      )}
      <strong>Total a cobrar: {money(total)}</strong>
      <DateField value={date} onChange={setDate} />
      <Method value={method} onChange={setMethod} />
      {isCash ? (
        <Amount label="Efectivo recibido" value={cash} onChange={setCash} />
      ) : null}
      <Button disabled={pending || !rows.length}>Registrar cobro</Button>
    </form>
  );
}
export function AccreditationForm({
  row,
  submit,
  pending,
}: {
  row: CardSettlementRow;
  submit: Submit;
  pending: boolean;
}) {
  const [operationFor] = useState(() => createFinancialOperationResolver());
  const [gross, setGross] = useState("");
  const [fee, setFee] = useState("");
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  let net = 0;
  try {
    net = readMoney(gross) - readMoney(fee);
  } catch {
    /* Validate on submit. */
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(async () => {
          const grossAmountCents = readMoney(gross);
          const feeAmountCents = readMoney(fee);
          if (
            grossAmountCents <= 0 ||
            grossAmountCents > row.remainingGrossAmountCents ||
            feeAmountCents > grossAmountCents
          )
            throw new Error("Revisá el bruto pendiente y la comisión.");
          const payload = {
            date,
            grossAmountCents,
            feeAmountCents,
            reference,
          };
          return repo.accredit(row.id, {
            ...payload,
            operationId: operationFor(payload),
          });
        });
      }}
    >
      <p>Bruto pendiente: {money(row.remainingGrossAmountCents)}</p>
      <DateField value={date} onChange={setDate} />
      <Amount label="Bruto acreditado" value={gross} onChange={setGross} />
      <Amount label="Comisión real" value={fee} onChange={setFee} />
      <p>Neto real: {money(net)}</p>
      <Field label="Referencia">
        <Input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </Field>
      <Button disabled={pending}>Registrar acreditación</Button>
    </form>
  );
}
export function RefundForm({
  row,
  submit,
  pending,
}: {
  row: RefundSourceRow;
  submit: Submit;
  pending: boolean;
}) {
  const [operationFor] = useState(() => createFinancialOperationResolver());
  const [cash, setCash] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("");
  const settlements = (row.settlements ?? []).filter(
    (s) => s.remainingGrossAmountCents > 0,
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(async () => {
          const cashOutAmountCents = readMoney(cash);
          const cancellations = settlements.flatMap((s) => {
            const grossAmountCents = readMoney(values[s.id] ?? "");
            if (grossAmountCents > s.remainingGrossAmountCents)
              throw new Error("La cancelación supera el bruto pendiente.");
            return grossAmountCents
              ? [{ settlementId: s.id, grossAmountCents }]
              : [];
          });
          const amountCents =
            cashOutAmountCents +
            cancellations.reduce((sum, s) => sum + s.grossAmountCents, 0);
          if (amountCents <= 0 || amountCents > row.pendingAmountCents)
            throw new Error(
              "El reintegro debe ser positivo y no superar el saldo pendiente.",
            );
          const payload = {
            ...(row.saleId ? { saleId: row.saleId } : { planId: row.planId! }),
            date,
            amountCents,
            cashOutAmountCents,
            ...(cashOutAmountCents ? { paymentMethodId: method } : {}),
            reason: reason.trim(),
            cancellations,
          };
          return repo.refund({
            ...payload,
            operationId: operationFor(payload),
          });
        });
      }}
    >
      <p>Reintegro pendiente: {money(row.pendingAmountCents)}</p>
      <DateField value={date} onChange={setDate} />
      <Amount label="Dinero que sale de caja" value={cash} onChange={setCash} />
      {cash.trim() ? <Method value={method} onChange={setMethod} /> : null}
      {settlements.map((s) => (
        <Amount
          key={s.id}
          label={`Cancelar acreditación pendiente ${s.number} · máximo ${money(s.remainingGrossAmountCents)}`}
          value={values[s.id] ?? ""}
          onChange={(value) =>
            setValues((previous) => ({ ...previous, [s.id]: value }))
          }
        />
      ))}
      <p className="text-sm text-muted-foreground">
        El reintegro combina dinero entregado y bruto pendiente cancelado.
        Cancelar acreditaciones no genera salida de caja.
      </p>
      <Field label="Motivo">
        <Input
          required
          minLength={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <Button disabled={pending}>Registrar reintegro</Button>
    </form>
  );
}
