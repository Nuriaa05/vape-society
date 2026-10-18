import { Input } from "@/components/ui/input";
import { Field } from "@/components/collections-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PurchaseFinance } from "@/lib/supplier-credit";
import { formatDateInputAR } from "@/lib/formatters";

export function PurchaseFinanceFields({
  value,
  onChange,
}: {
  value: PurchaseFinance;
  onChange: (value: PurchaseFinance) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Condición de pago">
        <Select
          value={
            value.paymentCondition === "SinSeguimiento"
              ? ""
              : value.paymentCondition
          }
          onValueChange={(paymentCondition: "Pagada" | "Credito") =>
            onChange({ ...value, paymentCondition })
          }
        >
          <SelectTrigger aria-label="Condición de pago">
            <SelectValue placeholder="Elegí una condición" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Pagada">Pagada</SelectItem>
            <SelectItem value="Credito">A crédito</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {value.paymentCondition === "Credito" ? (
        <>
          <Field label="Vencimiento del pago">
            <Input
              type="date"
              value={value.dueDate ?? ""}
              onChange={(e) => onChange({ ...value, dueDate: e.target.value })}
            />
          </Field>
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            Queda por pagar el total. Registrá el pago completo en Proveedores →
            Ver cuenta.
          </p>
        </>
      ) : value.paymentCondition === "Pagada" ? (
        <>
          <Field label="Fecha de pago">
            <Input
              type="date"
              max={formatDateInputAR()}
              value={value.paymentDate ?? ""}
              onChange={(e) =>
                onChange({ ...value, paymentDate: e.target.value })
              }
            />
          </Field>
        </>
      ) : null}
    </div>
  );
}
