import { Disclosure } from "@/components/ui/disclosure";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatDateAR } from "@/lib/formatters";
import { filterSupplierPayables } from "@/lib/supplier-account-view";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, DateField, Amount } from "@/components/collections-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/app-shell";
import { supplierPayablesRepository as repo } from "@/lib/repositories/supplier-payables-repository";
import {
  createFinancialOperationResolver,
  today,
  money,
  readMoney,
} from "@/lib/collections-form";
import { getMutationErrorMessage } from "@/lib/mutation-errors";
import { invalidateInventoryQueries } from "@/lib/inventory-cache";
import type { Supplier } from "@/lib/contracts";
import type {
  SupplierPayable,
  SupplierFinancialEntry,
  SupplierPaymentMethod,
} from "@/lib/supplier-credit";

type AccountAction =
  | { kind: "opening" }
  | { kind: "pay" | "refund" | "cancel"; payable: SupplierPayable }
  | { kind: "reversePayment" | "reverseRefund"; entry: SupplierFinancialEntry };

export function SupplierAccountDialog({
  supplier,
  close,
  opening,
}: {
  supplier: Supplier;
  close: () => void;
  opening?: { title: string; created: (payable: SupplierPayable) => void };
}) {
  const client = useQueryClient();
  const [action, setAction] = useState<AccountAction | null>(
    opening ? { kind: "opening" } : null,
  );
  const [status, setStatus] = useState("pending");
  const [month, setMonth] = useState("");
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState("");
  const query = useQuery({
    queryKey: ["supplier-payables", "account", supplier.id],
    queryFn: () => repo.account(supplier.id),
  });
  const mutation = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["supplier-payables"] });
      void client.invalidateQueries({ queryKey: ["purchases"] });
      invalidateInventoryQueries(client);
      setSaved(
        action?.kind === "pay"
          ? "Pago registrado. La deuda y el stock pagado se actualizaron."
          : action?.kind === "refund"
            ? "Reintegro recibido y registrado."
            : "Movimiento guardado.",
      );
      setAction(null);
      toast.success("Movimiento guardado.");
      if (opening && action?.kind === "opening")
        opening.created(result as SupplierPayable);
    },
    onError: (error) =>
      toast.error(
        getMutationErrorMessage(error, "No se pudo guardar el movimiento."),
      ),
  });
  const account = query.data;
  const rows = filterSupplierPayables(
    account?.payables ?? [],
    status,
    month,
    search,
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) close();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {opening ? "Deuda anterior con" : "Cuenta de"} {supplier.name}
          </DialogTitle>
          <DialogDescription>
            {opening
              ? "Este importe se guarda en la cuenta del proveedor."
              : "Compras a crédito y pagos. Cada deuda se paga por su saldo completo."}
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <p>Cargando cuenta...</p>
        ) : query.error ? (
          <p className="text-destructive">
            No se pudo cargar la cuenta.{" "}
            <Button variant="outline" onClick={() => void query.refetch()}>
              Reintentar
            </Button>
          </p>
        ) : account ? (
          <>
            {!opening ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <AccountTotal
                  label="Deuda pendiente"
                  value={account.balanceCents}
                />
                <AccountTotal label="Vencida" value={account.overdueCents} />
                {account.refundPendingCents > 0 ? (
                  <AccountTotal
                    label="Reintegros por recibir"
                    value={account.refundPendingCents}
                  />
                ) : null}
              </div>
            ) : null}
            {action ? (
              <div
                className={opening ? "" : "rounded-md border border-border p-4"}
              >
                <SupplierAccountForm
                  key={
                    action.kind +
                    ("payable" in action
                      ? action.payable.id
                      : "entry" in action
                        ? action.entry.id
                        : "")
                  }
                  action={action}
                  supplierId={supplier.id}
                  initialTitle={opening?.title}
                  pending={mutation.isPending}
                  close={() => (opening ? close() : setAction(null))}
                  submit={(run) => mutation.mutate(run)}
                />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {supplier.active ? (
                  <Button asChild>
                    <Link to="/compras" search={{ proveedor: supplier.id }}>
                      Registrar compra
                    </Link>
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => {
                    setSaved("");
                    setAction({ kind: "opening" });
                  }}
                >
                  Cargar deuda anterior
                </Button>
              </div>
            )}
            {saved ? (
              <p role="status" className="rounded-md bg-muted p-3 text-sm">
                {saved}
              </p>
            ) : null}
            {!action ? (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
                  <Button
                    size="sm"
                    variant={status === "pending" ? "default" : "outline"}
                    onClick={() => {
                      setStatus("pending");
                      setSearch("");
                      setMonth("");
                    }}
                  >
                    Pendientes
                  </Button>
                  <Button
                    size="sm"
                    variant={status !== "pending" ? "default" : "outline"}
                    onClick={() => {
                      setStatus("all");
                      setSearch("");
                      setMonth("");
                    }}
                  >
                    Ver historial completo
                  </Button>
                </div>
                <Disclosure title="Buscar y filtrar deudas">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Buscar deuda">
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Detalle de la deuda"
                      />
                    </Field>
                    <Field label="Estado de la deuda">
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger aria-label="Estado de la deuda">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">
                            Pendientes de resolver
                          </SelectItem>
                          <SelectItem value="all">Todas</SelectItem>
                          {["Pendiente", "Vencida", "Pagada", "Anulada"].map(
                            (s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Mes de vencimiento">
                      <Input
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                      />
                    </Field>
                  </div>
                </Disclosure>
                <div className="space-y-3">
                  {rows.length ? (
                    rows.map((payable) => (
                      <SupplierObligation
                        key={payable.id}
                        payable={payable}
                        disabled={mutation.isPending || action !== null}
                        act={(nextAction) => {
                          setSaved("");
                          setAction(nextAction);
                        }}
                      />
                    ))
                  ) : (
                    <p className="py-4 text-sm text-muted-foreground">
                      {status === "pending" && !search && !month
                        ? "No hay deudas ni reintegros pendientes. Podés consultar los pagos en el historial."
                        : "No hay deudas para estos filtros."}
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AccountTotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{money(value)}</p>
    </div>
  );
}

function SupplierObligation({
  payable: p,
  disabled,
  act,
}: {
  payable: SupplierPayable;
  disabled: boolean;
  act: (action: AccountAction) => void;
}) {
  return (
    <section className="rounded-md border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{p.title}</h3>
          <p className="text-xs text-muted-foreground">
            {p.purchaseId ? "Compra registrada" : "Deuda anterior"} · Vence{" "}
            {formatDateAR(`${p.dueDate}T12:00:00`)}
          </p>
        </div>
        <StatusBadge
          tone={
            p.status === "Pagada"
              ? "success"
              : p.status === "Vencida"
                ? "destructive"
                : p.status === "Anulada"
                  ? "muted"
                  : "warning"
          }
        >
          {p.status}
        </StatusBadge>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          Total: <strong>{money(p.amountCents)}</strong>
        </span>
        <span>
          Por pagar: <strong>{money(p.balanceCents)}</strong>
        </span>
        {p.refundPendingCents > 0 ? (
          <span>
            Reintegro por recibir:{" "}
            <strong>{money(p.refundPendingCents)}</strong>
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {p.balanceCents > 0 && p.status !== "Anulada" ? (
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => act({ kind: "pay", payable: p })}
          >
            Registrar pago
          </Button>
        ) : null}
        {p.refundPendingCents > 0 ? (
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => act({ kind: "refund", payable: p })}
          >
            Recibir reintegro
          </Button>
        ) : null}
        {!p.purchaseId && p.status !== "Anulada" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => act({ kind: "cancel", payable: p })}
          >
            Anular deuda anterior
          </Button>
        ) : null}
      </div>
      {p.payments.length || p.refunds.length ? (
        <Disclosure
          title={
            <>Pagos y reintegros ({p.payments.length + p.refunds.length})</>
          }
        >
          <ul className="mt-2 space-y-2">
            {[
              ...p.payments.map((entry) => ({ entry, refund: false })),
              ...p.refunds.map((entry) => ({ entry, refund: true })),
            ].map(({ entry, refund }) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2"
              >
                <div>
                  <p>
                    {refund ? "Reintegro recibido" : "Pago"}:{" "}
                    {money(entry.amountCents)} · {entry.date} · {entry.method}
                  </p>
                  {entry.reference ? (
                    <p className="text-xs text-muted-foreground">
                      Referencia: {entry.reference}
                    </p>
                  ) : null}
                  {entry.reversedAt ? (
                    <p className="text-xs text-destructive">
                      Revertido: {entry.reversalReason}
                    </p>
                  ) : null}
                </div>
                {!entry.reversedAt && (refund || p.status !== "Anulada") ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      act({
                        kind: refund ? "reverseRefund" : "reversePayment",
                        entry,
                      })
                    }
                  >
                    Revertir {refund ? "reintegro" : "pago"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
      {p.status === "Anulada" &&
      p.payments.some((payment) => !payment.reversedAt) ? (
        <p className="text-xs text-muted-foreground">
          Los pagos de una deuda anulada se conservan. Registrá el reintegro
          cuando el proveedor devuelva el dinero.
        </p>
      ) : null}
    </section>
  );
}

function SupplierAccountForm({
  action,
  supplierId,
  initialTitle = "",
  pending,
  submit,
  close,
}: {
  action: AccountAction;
  supplierId: string;
  initialTitle?: string;
  pending: boolean;
  submit: (run: () => Promise<unknown>) => void;
  close: () => void;
}) {
  const [operationFor] = useState(() => createFinancialOperationResolver());
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<SupplierPaymentMethod>("Efectivo");
  const [reference, setReference] = useState("");
  const [title, setTitle] = useState(initialTitle);
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const isPayment = action.kind === "pay" || action.kind === "refund";
  const labels = {
    opening: "Cargar deuda anterior",
    pay: "Registrar pago completo",
    refund: "Recibir reintegro completo",
    cancel: "Anular deuda anterior",
    reversePayment: "Revertir pago",
    reverseRefund: "Revertir reintegro",
  };
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (isPayment && !review) {
          setReview(true);
          return;
        }
        submit(async () => {
          if (action.kind === "opening") {
            const amountCents = readMoney(amount);
            if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
              throw new Error("Ingresá una deuda mayor a cero en pesos.");
            const payload = {
              supplierId,
              title: title.trim(),
              amountCents,
              dueDate,
            };
            return repo.opening({
              ...payload,
              operationId: operationFor(payload),
            });
          }
          if (action.kind === "pay" || action.kind === "refund") {
            const payload = {
              date,
              method,
              reference: reference.trim() || undefined,
            };
            return repo[action.kind](action.payable.id, {
              ...payload,
              operationId: operationFor({
                ...payload,
                payableId: action.payable.id,
                kind: action.kind,
              }),
            });
          }
          if (action.kind === "cancel")
            return repo.cancel(action.payable.id, reason.trim());
          if ("entry" in action)
            return repo[action.kind](action.entry.id, reason.trim());
        });
      }}
    >
      {!initialTitle ? (
        <h3 className="font-semibold">{labels[action.kind]}</h3>
      ) : null}
      {review && isPayment && "payable" in action ? (
        <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {action.payable.title}
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {money(
              action.kind === "pay"
                ? action.payable.balanceCents
                : action.payable.refundPendingCents,
            )}
          </p>
          <p className="text-sm">
            {formatDateAR(`${date}T12:00:00`)} · {method}
          </p>
          {reference.trim() ? (
            <p className="break-words text-sm">Referencia: {reference}</p>
          ) : null}
          <p className="text-sm">
            {action.kind === "pay"
              ? "Confirmá solo si ya pagaste al proveedor. Se salda esta deuda y las unidades restantes pasan a stock pagado."
              : "Confirmá solo si ya recibiste este dinero del proveedor."}
          </p>
        </div>
      ) : action.kind === "opening" ? (
        <>
          <p className="text-sm text-muted-foreground">
            {initialTitle
              ? "Cargá todo lo que ya le debías, aunque hayas vendido parte de la mercadería. No agrega unidades al stock."
              : "Para dinero que ya debías antes de usar el sistema. No agrega una compra ni unidades al stock."}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Detalle de la deuda">
              <Input
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Amount
              label={
                initialTitle
                  ? "Deuda total con el proveedor"
                  : "Importe total en pesos"
              }
              value={amount}
              onChange={setAmount}
            />
            <Field label="Vencimiento">
              <Input
                required
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
          </div>
        </>
      ) : isPayment ? (
        <>
          <p className="text-sm">
            Importe:{" "}
            <strong>
              {money(
                "payable" in action
                  ? action.kind === "pay"
                    ? action.payable.balanceCents
                    : action.payable.refundPendingCents
                  : 0,
              )}
            </strong>
            .{" "}
            {action.kind === "refund"
              ? "Confirmá que recibiste este dinero del proveedor."
              : "Confirmá que abonaste el total al proveedor."}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DateField value={date} onChange={setDate} />
            <Field label="Medio">
              <Select
                value={method}
                onValueChange={(value: SupplierPaymentMethod) =>
                  setMethod(value)
                }
              >
                <SelectTrigger aria-label="Medio">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Efectivo", "Transferencia", "QR"].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Referencia (opcional)">
              <Input
                maxLength={200}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            El movimiento original se conserva en el historial.{" "}
            {action.kind === "reversePayment"
              ? "La deuda se reabre y la mercadería restante vuelve a clasificarse a crédito."
              : action.kind === "reverseRefund"
                ? "El reintegro vuelve a quedar pendiente de recibir."
                : "Si hay pagos, quedará pendiente recibir el reintegro. Primero deben revertirse las clasificaciones de stock vinculadas."}
          </p>
          <Field label="Motivo">
            <Textarea
              required
              minLength={3}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => (review ? setReview(false) : close())}
        >
          {review ? "Volver a editar" : "Cancelar"}
        </Button>
        <Button
          disabled={
            pending ||
            (action.kind === "opening" &&
              (!title.trim() || !amount.trim() || !dueDate)) ||
            (!isPayment &&
              action.kind !== "opening" &&
              reason.trim().length < 3)
          }
        >
          {pending
            ? "Guardando..."
            : isPayment && !review
              ? "Revisar movimiento"
              : labels[action.kind]}
        </Button>
      </div>
    </form>
  );
}
