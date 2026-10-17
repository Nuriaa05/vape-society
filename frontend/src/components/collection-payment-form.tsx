import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Amount, DateField, Field } from "./collections-controls";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import {
  allocationAmounts,
  createFinancialOperationResolver,
  money,
  readMoney,
  suggestPaymentAllocations,
  today,
} from "@/lib/collections-form";
import { formatDateAR } from "@/lib/formatters";
import type {
  CollectionInput,
  FinancialEntry,
  InstallmentRow,
} from "@/lib/collections";
import { collectionsRepository as repo } from "@/lib/repositories/collections-repository";
import { settingsRepository } from "@/lib/repositories/settings-repository";

export type RecordedPayment = {
  entry: FinancialEntry;
  previousBalance: number;
};
type PaymentReview = {
  payload: Omit<CollectionInput, "operationId">;
  previousBalance: number;
  installments: InstallmentRow[];
};

export function CollectionForm({
  customerId,
  submit,
  pending,
}: {
  customerId: string;
  submit: (action: () => Promise<unknown>) => void;
  pending: boolean;
}) {
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsRepository.getSettings(),
  });
  const account = useQuery({
    queryKey: ["collections", "account", customerId],
    queryFn: () => repo.account(customerId),
  });
  const [operationFor] = useState(() => createFinancialOperationResolver());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [date, setDate] = useState(today());
  const [cash, setCash] = useState("");
  const [calculateChange, setCalculateChange] = useState(false);
  const [manual, setManual] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [issue, setIssue] = useState<string | null>(null);
  const [review, setReview] = useState<PaymentReview | null>(null);
  const methods =
    settings.data?.paymentMethods.filter(
      (item) => item.enabled && item.collectionEligible,
    ) ?? [];
  const selectedMethod = methods.find((item) => item.id === method);
  const rows = (account.data?.installments ?? []).filter(
    (row) => row.remainingAmountCents > 0 && row.status !== "Anulada",
  );
  const balance = account.data?.balanceAmountCents ?? 0;
  let allocations: CollectionInput["allocations"] = [];
  let amountCents = 0;
  let allocationIssue: string | null = null;
  try {
    amountCents = readMoney(amount);
    allocations = manual
      ? allocationAmounts(rows, values)
      : amountCents > 0
        ? suggestPaymentAllocations(rows, amountCents)
        : [];
  } catch (error) {
    allocationIssue = (error as Error).message;
  }

  if (account.isPending || settings.isPending)
    return <p>Cargando la cuenta y los medios de pago…</p>;
  if (account.error || settings.error)
    return (
      <div role="alert" className="space-y-3">
        <p>
          No se pudo preparar el cobro. Reintentá para obtener el saldo
          actualizado.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            void account.refetch();
            void settings.refetch();
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  if (!rows.length && !review)
    return (
      <p>Este cliente está al día. No tiene deuda pendiente para cobrar.</p>
    );
  const shownAllocations = review?.payload.allocations ?? allocations;

  function reviewPayment() {
    if (allocationIssue) throw new Error(allocationIssue);
    if (amountCents <= 0 || amountCents > balance)
      throw new Error(
        "Ingresá un pago mayor a cero que no supere la deuda pendiente.",
      );
    if (
      allocations.reduce((sum, item) => sum + item.amountCents, 0) !==
      amountCents
    )
      throw new Error(
        "La suma de los importes por cuota debe coincidir con el importe del pago.",
      );
    if (!selectedMethod) throw new Error("Seleccioná cómo pagó el cliente.");
    const received = selectedMethod.cashHandling
      ? calculateChange && cash.trim()
        ? readMoney(cash)
        : amountCents
      : undefined;
    if (received !== undefined && received < amountCents)
      throw new Error("El efectivo recibido debe cubrir el importe del pago.");
    if (!date || date > today())
      throw new Error("Ingresá la fecha del pago, sin superar el día de hoy.");
    setReview({
      previousBalance: balance,
      installments: rows,
      payload: {
        customerId,
        date,
        paymentMethodId: method,
        amountCents,
        allocations,
        ...(received !== undefined
          ? { cashReceivedAmountCents: received }
          : {}),
      },
    });
  }

  return (
    <form
      className="space-y-5"
      onChange={() => setIssue(null)}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        if (review) {
          const savedReview = review;
          submit(
            async (): Promise<RecordedPayment> => ({
              entry: await repo.collect({
                ...savedReview.payload,
                operationId: operationFor(savedReview.payload),
              }),
              previousBalance: savedReview.previousBalance,
            }),
          );
        } else {
          try {
            reviewPayment();
          } catch (error) {
            setIssue((error as Error).message);
          }
        }
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-4">
        <span className="text-sm text-muted-foreground">
          {review ? "Deuda antes de este pago" : "Deuda pendiente del cliente"}
        </span>
        <strong className="text-xl tabular-nums">
          {money(review?.previousBalance ?? balance)}
        </strong>
      </div>
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        {!review ? (
          <>
            <Amount
              label="Importe del pago"
              value={amount}
              onChange={setAmount}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAmount((balance / 100).toFixed(2).replace(".", ","));
                setManual(false);
              }}
            >
              Cobrar toda la deuda
            </Button>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Medio de pago">
                <select
                  required
                  className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                  value={method}
                  onChange={(event) => {
                    setMethod(event.target.value);
                    setCash("");
                    setCalculateChange(false);
                  }}
                >
                  <option value="">Seleccionar medio</option>
                  {methods.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <DateField value={date} onChange={setDate} />
            </div>
            {!methods.length ? (
              <p role="alert" className="text-sm text-destructive">
                No hay medios habilitados. Activá “Admite cobranzas directas” en
                Configuración → Medios de pago.
              </p>
            ) : null}
            {selectedMethod?.cashHandling ? (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Switch
                    checked={calculateChange}
                    onCheckedChange={(checked) => {
                      setCalculateChange(checked);
                      setCash("");
                      setIssue(null);
                    }}
                  />
                  Calcular vuelto
                </label>
                {calculateChange ? (
                  <Amount
                    label="Efectivo recibido (opcional)"
                    value={cash}
                    onChange={setCash}
                    placeholder={amount || "0,00"}
                  />
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {calculateChange
                    ? "Indicá cuánto te entregó el cliente para calcular el vuelto. Si lo dejás vacío, se toma el importe del pago."
                    : "Se considera que recibiste el mismo importe del pago. Activá esta opción si el cliente entrega más efectivo."}
                </p>
              </div>
            ) : null}
            <section
              aria-label="Aplicación del pago"
              className="space-y-3 border-t border-border pt-4"
            >
              <h3 className="font-semibold">A qué deuda se aplica</h3>
              <p className="text-sm text-muted-foreground">
                {manual
                  ? "Indicá cuánto aplicar a cada cuota. La suma debe coincidir con el importe del pago."
                  : "Se propone pagar primero las cuotas con vencimiento más antiguo. Podés cambiar la distribución antes de confirmar."}
              </p>
              {manual
                ? rows.map((row) => (
                    <div
                      key={row.id}
                      className="grid gap-2 border-b border-border pb-3 sm:grid-cols-2"
                    >
                      <p className="text-sm">
                        {row.title} · Cuota {row.number}
                        <br />
                        Vence {formatDateAR(`${row.dueDate}T12:00:00Z`)} ·
                        Pendiente {money(row.remainingAmountCents)}
                      </p>
                      <Amount
                        label={`Importe cuota ${row.number} de ${row.title}`}
                        value={values[row.id] ?? ""}
                        onChange={(value) =>
                          setValues((previous) => ({
                            ...previous,
                            [row.id]: value,
                          }))
                        }
                      />
                    </div>
                  ))
                : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!manual)
                    setValues(
                      Object.fromEntries(
                        allocations.map((item) => [
                          item.installmentId,
                          (item.amountCents / 100).toFixed(2).replace(".", ","),
                        ]),
                      ),
                    );
                  setManual(!manual);
                }}
              >
                {manual
                  ? "Usar distribución sugerida"
                  : "Elegir cuotas manualmente"}
              </Button>
            </section>
          </>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt>Importe del pago</dt>
            <dd className="text-right font-semibold">
              {money(review.payload.amountCents)}
            </dd>
            <dt>Medio de pago</dt>
            <dd className="text-right">{selectedMethod?.name}</dd>
            <dt>Fecha del pago</dt>
            <dd className="text-right">
              {formatDateAR(`${review.payload.date}T12:00:00Z`)}
            </dd>
            {review.payload.cashReceivedAmountCents !== undefined &&
            review.payload.cashReceivedAmountCents >
              review.payload.amountCents ? (
              <>
                <dt>Efectivo recibido</dt>
                <dd className="text-right">
                  {money(review.payload.cashReceivedAmountCents)}
                </dd>
                <dt>Vuelto</dt>
                <dd className="text-right">
                  {money(
                    review.payload.cashReceivedAmountCents -
                      review.payload.amountCents,
                  )}
                </dd>
              </>
            ) : null}
          </dl>
        )}
        {!manual || review ? (
          <ul
            aria-label="Cuotas incluidas en el pago"
            className="space-y-2 text-sm"
          >
            {shownAllocations.map((allocation) => {
              const row = (review?.installments ?? rows).find(
                (item) => item.id === allocation.installmentId,
              );
              return (
                <li
                  key={allocation.installmentId}
                  className="flex flex-wrap justify-between gap-2 border-b border-border pb-2"
                >
                  <span>
                    {row?.title} · Cuota {row?.number}
                    <br />
                    <span className="text-muted-foreground">
                      Vence{" "}
                      {row ? formatDateAR(`${row.dueDate}T12:00:00Z`) : "—"}
                    </span>
                  </span>
                  <strong className="tabular-nums">
                    {money(allocation.amountCents)}
                  </strong>
                </li>
              );
            })}
          </ul>
        ) : null}
        {review ? (
          <p className="text-base">
            Después de este pago quedarán{" "}
            <strong>
              {money(review.previousBalance - review.payload.amountCents)}
            </strong>{" "}
            de deuda.
          </p>
        ) : null}
        {issue || allocationIssue ? (
          <p role="alert" className="text-sm text-destructive">
            {issue ?? allocationIssue}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {review ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setReview(null)}
            >
              Volver a editar
            </Button>
          ) : null}
          <Button disabled={pending || account.isFetching || !methods.length}>
            {pending
              ? "Guardando pago…"
              : review
                ? "Confirmar pago"
                : "Revisar pago"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
