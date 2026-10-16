import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SaleDraft } from "./sale-draft-context";
import type { PaymentMethodSetting } from "@/lib/contracts";
import { formatARS, formatDateAR } from "@/lib/formatters";
import {
  createFinanceMoneyDraft,
  editFinanceMoneyDraft,
} from "@/lib/sale-finance-input";
import type { SaleFinance } from "@/lib/collections";

export type FinanceDraft = Pick<
  SaleDraft,
  | "customerId"
  | "paymentTerms"
  | "directPlan"
  | "cardPlan"
  | "operationId"
  | "operationFingerprint"
>;

export function SaleFinanceFields({
  value,
  onChange,
  methods,
  preview,
  onValidityChange,
}: {
  value: FinanceDraft;
  onChange: (value: FinanceDraft) => void;
  methods: PaymentMethodSetting[];
  preview?: SaleFinance;
  onValidityChange: (valid: boolean) => void;
}) {
  const direct = value.directPlan;
  const card = value.cardPlan;
  const updateDirect = (patch: Partial<typeof direct>) =>
    onChange({ ...value, directPlan: { ...direct, ...patch } });
  const updateCard = (patch: Partial<typeof card>) =>
    onChange({ ...value, cardPlan: { ...card, ...patch } });
  const invalidMoneyFields = useRef(new Set<string>());
  const reportMoneyValidity = useCallback(
    (id: string, valid: boolean) => {
      if (valid) invalidMoneyFields.current.delete(id);
      else invalidMoneyFields.current.add(id);
      onValidityChange(invalidMoneyFields.current.size === 0);
    },
    [onValidityChange],
  );

  return (
    <div className="space-y-4">
      {value.paymentTerms === "DirectInstallments" ? (
        <section className="space-y-3" aria-label="Plan de cuotas directas">
          <div>
            <h3 className="text-sm font-medium">Plan de cuotas</h3>
            <p className="text-xs text-muted-foreground">
              Mensuales y fijas. El anticipo es opcional; el recargo se aplica
              una sola vez.
            </p>
          </div>
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <Field id="direct-count" label="Cantidad de cuotas">
              <Input
                id="direct-count"
                type="number"
                min="1"
                max="120"
                value={direct.installmentCount || ""}
                onChange={(event) =>
                  updateDirect({ installmentCount: Number(event.target.value) })
                }
              />
            </Field>
            <Field id="direct-date" label="Primer vencimiento">
              <Input
                id="direct-date"
                type="date"
                value={direct.firstDueDate}
                onChange={(event) =>
                  updateDirect({ firstDueDate: event.target.value })
                }
              />
            </Field>
            <Field id="direct-surcharge" label="Recargo de financiación (%)">
              <Input
                id="direct-surcharge"
                type="number"
                min="0"
                max="1000"
                step="0.01"
                value={(direct.surchargeBasisPoints ?? 0) / 100}
                onChange={(event) =>
                  updateDirect({
                    surchargeBasisPoints: Math.round(
                      Number(event.target.value) * 100,
                    ),
                  })
                }
              />
            </Field>
            <Field id="direct-upfront" label="Anticipo ($)">
              <FinanceMoneyInput
                id="direct-upfront"
                cents={direct.upfrontAmountCents ?? 0}
                onAmountChange={(cents) =>
                  updateDirect({
                    upfrontAmountCents: cents,
                    ...(cents === 0
                      ? {
                          upfrontPaymentMethodId: undefined,
                          upfrontCashReceivedAmountCents: undefined,
                        }
                      : {}),
                  })
                }
                onValidityChange={reportMoneyValidity}
              />
            </Field>
            {(direct.upfrontAmountCents ?? 0) > 0 ? (
              <>
                <Field id="upfront-method" label="Medio del anticipo">
                  <select
                    id="upfront-method"
                    className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
                    value={direct.upfrontPaymentMethodId ?? ""}
                    onChange={(event) =>
                      updateDirect({
                        upfrontPaymentMethodId: event.target.value,
                        upfrontCashReceivedAmountCents: undefined,
                      })
                    }
                  >
                    <option value="">Seleccionar</option>
                    {methods
                      .filter(
                        (method) => method.enabled && method.collectionEligible,
                      )
                      .map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.name}
                        </option>
                      ))}
                  </select>
                </Field>
                {methods.find(
                  (method) => method.id === direct.upfrontPaymentMethodId,
                )?.cashHandling ? (
                  <Field
                    id="upfront-cash"
                    label="Dinero recibido por anticipo ($)"
                  >
                    <FinanceMoneyInput
                      key={direct.upfrontPaymentMethodId}
                      id="upfront-cash"
                      cents={direct.upfrontCashReceivedAmountCents ?? 0}
                      onAmountChange={(cents) =>
                        updateDirect({ upfrontCashReceivedAmountCents: cents })
                      }
                      onValidityChange={reportMoneyValidity}
                    />
                  </Field>
                ) : null}
              </>
            ) : null}
          </div>
        </section>
      ) : null}
      {value.paymentTerms === "CardInstallments" ? (
        <section className="space-y-4" aria-label="Plan de tarjeta">
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <Field id="card-count" label="Cuotas del cliente">
              <Input
                id="card-count"
                type="number"
                min="1"
                max="120"
                value={card.installmentCount || ""}
                onChange={(event) =>
                  updateCard({ installmentCount: Number(event.target.value) })
                }
              />
            </Field>
            <Field id="card-processor" label="Procesador / adquirente">
              <Input
                id="card-processor"
                maxLength={100}
                value={card.processor}
                onChange={(event) =>
                  updateCard({ processor: event.target.value })
                }
                placeholder="Ej. Payway, Mercado Pago"
              />
            </Field>
            <Field id="card-reference" label="Referencia">
              <Input
                id="card-reference"
                maxLength={200}
                value={card.reference ?? ""}
                onChange={(event) =>
                  updateCard({ reference: event.target.value })
                }
                placeholder="Número de operación (opcional)"
              />
            </Field>
          </div>
          <p className="border-t border-border pt-4 text-xs text-muted-foreground">
            La acreditación esperada se completa después desde Clientes y
            cobranzas → Tarjetas. Esta venta no se registra como dinero recibido
            hasta que informes la acreditación real.
          </p>
        </section>
      ) : null}
      {preview?.paymentTerms === "DirectInstallments" ? (
        <section
          className="space-y-3 border-t border-border pt-4"
          aria-label="Calendario de cuotas"
        >
          <h3 className="text-sm font-medium">Calendario acordado</h3>
          <p className="text-xs text-muted-foreground">
            Anticipo: {formatARS(preview.upfrontAmountCents / 100)} · Saldo en
            cuotas: {formatARS(preview.financedAmountCents / 100)}
          </p>
          <div className="max-h-56 overflow-y-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Cuota</th>
                  <th className="px-3 py-2 text-left font-medium">
                    Vencimiento
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody>
                {preview.installments.map((item) => (
                  <tr key={item.number} className="border-t border-border">
                    <td className="px-3 py-2">{item.number}</td>
                    <td className="px-3 py-2">
                      {formatDateAR(`${item.dueDate}T12:00:00-03:00`)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatARS(item.amountCents / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Revisá las fechas antes de confirmar. Después, el calendario queda
            fijo.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function FinanceMoneyInput({
  id,
  cents,
  onAmountChange,
  onValidityChange,
}: {
  id: string;
  cents: number;
  onAmountChange: (cents: number) => void;
  onValidityChange: (id: string, valid: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => createFinanceMoneyDraft(cents));
  useEffect(() => () => onValidityChange(id, true), [id, onValidityChange]);
  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        inputMode="decimal"
        value={draft.raw}
        aria-invalid={!draft.valid}
        aria-describedby={!draft.valid ? `${id}-error` : undefined}
        onChange={(event) => {
          const next = editFinanceMoneyDraft(event.target.value);
          setDraft(next);
          onValidityChange(id, next.valid);
          if (next.valid) onAmountChange(next.cents);
        }}
      />
      {!draft.valid ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          Ingresá un importe válido con hasta 2 decimales para continuar.
        </p>
      ) : null}
    </div>
  );
}
