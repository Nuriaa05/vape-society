import { useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { printReceipt } from "@/lib/collection-receipt";
import { money } from "@/lib/collections-form";
import { collectionsRepository as repo } from "@/lib/repositories/collections-repository";
import type { Customer } from "@/lib/collections";
import type { RecordedPayment } from "./collection-payment-form";

export function CollectionPaymentResult({
  customer,
  payment,
  account,
  close,
}: {
  customer: Customer;
  payment: RecordedPayment;
  account: () => void;
  close: () => void;
}) {
  const balance = useQuery({
    queryKey: ["collections", "account", customer.id],
    queryFn: () => repo.account(customer.id),
  });
  return (
    <div className="space-y-5">
      <p role="status" className="text-lg">
        Registraste un pago de{" "}
        <strong>{money(payment.entry.amountCents)}</strong> de {customer.name}.
      </p>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt>Deuda antes de este pago</dt>
          <dd>{money(payment.previousBalance)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-border pt-3 text-lg">
          <dt>Saldo pendiente actual</dt>
          <dd className="font-semibold">
            {balance.isFetching
              ? "Actualizando…"
              : balance.error
                ? "Sin confirmar"
                : balance.data
                  ? money(balance.data.balanceAmountCents)
                  : "Consultando…"}
          </dd>
        </div>
      </dl>
      {!balance.isFetching &&
      !balance.error &&
      balance.data?.balanceAmountCents === 0 ? (
        <p>El cliente está al día.</p>
      ) : null}
      {balance.error ? (
        <div role="alert">
          <p>El pago se guardó, pero no pudimos actualizar el saldo.</p>
          <Button variant="outline" onClick={() => void balance.refetch()}>
            Actualizar saldo
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button onClick={account}>Volver a la cuenta</Button>
        <Button
          variant="outline"
          onClick={() => void printReceipt(payment.entry.id, false)}
        >
          Imprimir comprobante
        </Button>
        <Button variant="ghost" onClick={close}>
          Volver a clientes
        </Button>
      </div>
    </div>
  );
}
