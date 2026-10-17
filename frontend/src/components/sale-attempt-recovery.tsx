import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CreateSaleInput } from "@/lib/repositories/sales-repository";
export function SaleAttemptRecovery({
  payload,
  pending,
  error,
  onRecover,
}: {
  payload: CreateSaleInput;
  pending: boolean;
  error: string | null;
  onRecover: (payload: CreateSaleInput) => Promise<unknown>;
}) {
  return (
    <Card className="app-card-body">
      <h2 className="font-semibold app-card-title">
        Venta pendiente de respuesta
      </h2>
      <p className="mt-3 text-sm text-muted-foreground">
        Primero comprobá la operación anterior para evitar duplicados. Se
        enviará la misma venta con sus importes originales, aunque los precios,
        el stock o las condiciones actuales hayan cambiado. Podrás iniciar o
        corregir otra venta cuando se resuelva este intento.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        className="mt-4 w-full"
        disabled={pending}
        onClick={() => onRecover(payload)}
      >
        {pending ? "Recuperando venta..." : "Recuperar venta pendiente"}
      </Button>
    </Card>
  );
}
