import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Amount, Field } from "@/components/collections-controls";
import {
  createFinancialOperationResolver,
  money,
  readMoney,
} from "@/lib/collections-form";
import type { CardSettlementRow } from "@/lib/collections";
import { collectionsRepository } from "@/lib/repositories/collections-repository";

type DraftRow = { id: string; dueDate: string; gross: string; fee: string };
const draftRow = (gross: number): DraftRow => ({
  id: crypto.randomUUID(),
  dueDate: "",
  gross: String(gross / 100).replace(".", ","),
  fee: "0",
});

export function CardScheduleForm({
  row,
  submit,
  pending,
}: {
  row: CardSettlementRow;
  submit: (action: () => Promise<unknown>) => void;
  pending: boolean;
}) {
  const [operationFor] = useState(() => createFinancialOperationResolver());
  const [rows, setRows] = useState(() => [draftRow(row.grossAmountCents)]);
  const update = (id: string, patch: Partial<DraftRow>) =>
    setRows((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  let programmed = 0;
  try {
    programmed = rows.reduce((sum, item) => sum + readMoney(item.gross), 0);
  } catch {
    /* Validate on submit. */
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        submit(async () => {
          const settlements = rows.map((item) => ({
            dueDate: item.dueDate,
            grossAmountCents: readMoney(item.gross),
            feeAmountCents: readMoney(item.fee),
          }));
          if (
            !settlements.length ||
            settlements.some(
              (item) =>
                !item.dueDate ||
                item.grossAmountCents <= 0 ||
                item.feeAmountCents > item.grossAmountCents,
            )
          )
            throw new Error(
              "Completá la fecha, el bruto y la comisión de cada acreditación.",
            );
          if (
            settlements.reduce(
              (sum, item) => sum + item.grossAmountCents,
              0,
            ) !== row.grossAmountCents
          )
            throw new Error(
              "La suma de los brutos debe coincidir con el total de la venta.",
            );
          const payload = { settlements };
          return collectionsRepository.scheduleCardSale(row.saleId, {
            ...payload,
            operationId: operationFor(payload),
          });
        });
      }}
    >
      <fieldset disabled={pending} className="space-y-4">
        <p>
          Venta {row.saleNumber} · {row.processor} · Total{" "}
          {money(row.grossAmountCents)}
        </p>
        <p className="text-sm text-muted-foreground">
          Indicá los depósitos que esperás recibir. Guardar este calendario no
          registra dinero ingresado. Una vez confirmado, queda fijo.
        </p>
        {rows.map((item, index) => (
          <div
            key={item.id}
            className="space-y-3 rounded-md border border-border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Acreditación {index + 1}</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  setRows((current) =>
                    current.filter((value) => value.id !== item.id),
                  )
                }
              >
                Quitar acreditación
              </Button>
            </div>
            <Field label={`Acreditación ${index + 1}: fecha`}>
              <Input
                type="date"
                required
                disabled={pending}
                value={item.dueDate}
                onChange={(event) =>
                  update(item.id, { dueDate: event.target.value })
                }
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Amount
                label="Bruto ($)"
                value={item.gross}
                onChange={(gross) => update(item.id, { gross })}
              />
              <Amount
                label="Comisión ($)"
                value={item.fee}
                onChange={(fee) => update(item.id, { fee })}
              />
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            setRows((current) => [
              ...current,
              draftRow(Math.max(0, row.grossAmountCents - programmed)),
            ])
          }
        >
          Agregar acreditación esperada
        </Button>
        <p className="text-sm">
          Bruto programado: {money(programmed)} de {money(row.grossAmountCents)}
        </p>
        <Button className="w-full" disabled={pending || !rows.length}>
          {pending ? "Guardando..." : "Guardar acreditaciones esperadas"}
        </Button>
      </fieldset>
    </form>
  );
}
