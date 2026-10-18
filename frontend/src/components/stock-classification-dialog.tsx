import { useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Amount } from "@/components/collections-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SupplierAccountDialog } from "@/components/supplier-account";
import { supplierPayablesRepository } from "@/lib/repositories/supplier-payables-repository";
import { suppliersRepository } from "@/lib/repositories/suppliers-repository";
import { stockRepository } from "@/lib/repositories/stock-repository";
import {
  createFinancialOperationResolver,
  money,
} from "@/lib/collections-form";
import { formatPurchaseCostInput } from "@/lib/purchase-draft";
import {
  stockClassificationInput,
  type StockClassification,
} from "@/lib/supplier-credit";
import { invalidateInventoryQueries } from "@/lib/inventory-cache";
import { getMutationErrorMessage } from "@/lib/mutation-errors";
import { cn } from "@/lib/utils";
import type { Product, Supplier } from "@/lib/contracts";

export function StockClassificationDialog({
  product,
  close,
}: {
  product: Product;
  close: () => void;
}) {
  const client = useQueryClient();
  const available = product.unclassifiedQty ?? 0;
  const [qty, setQty] = useState(available);
  const [classification, setClassification] = useState<
    "Pagada" | "Credito" | null
  >(null);
  const [cost, setCost] = useState(() => formatPurchaseCostInput(product.cost));
  const [supplierId, setSupplierId] = useState(
    product.supplierId === "local" ? "" : product.supplierId,
  );
  const [payableId, setPayableId] = useState("");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<StockClassification | null>(null);
  const [error, setError] = useState("");
  const [openingSupplier, setOpeningSupplier] = useState<Supplier | null>(null);
  const [createdDebt, setCreatedDebt] = useState(false);
  const [operationFor] = useState(() => createFinancialOperationResolver());
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersRepository.findAll(),
    enabled: classification === "Credito",
  });
  const payables = useQuery({
    queryKey: ["supplier-payables", "all"],
    queryFn: () => supplierPayablesRepository.all(),
    enabled: classification === "Credito",
  });
  const supplier = suppliers.data?.find((item) => item.id === supplierId);
  const options = (payables.data ?? []).filter(
    (item) =>
      item.supplierId === supplierId &&
      !item.purchaseId &&
      item.balanceCents > 0 &&
      item.status !== "Anulada",
  );
  const payable =
    options.find((item) => item.id === payableId) ??
    (options.length === 1 ? options[0] : undefined);
  const loading = suppliers.isLoading || payables.isLoading;
  const loadError = suppliers.error || payables.error;
  const mutation = useMutation({
    mutationFn: async (payload: StockClassification) =>
      stockRepository.classify({
        ...payload,
        operationId: operationFor(payload),
      }),
    onSuccess: () => {
      invalidateInventoryQueries(client);
      void client.invalidateQueries({ queryKey: ["supplier-payables"] });
      toast.success(
        "Estado de pago actualizado. La cantidad de stock no cambió.",
      );
      close();
    },
    onError: (cause) =>
      setError(
        getMutationErrorMessage(
          cause,
          "No se pudo guardar el estado de pago. Revisá los datos e intentá de nuevo.",
        ),
      ),
  });

  if (openingSupplier)
    return (
      <SupplierAccountDialog
        supplier={openingSupplier}
        close={() => setOpeningSupplier(null)}
        opening={{
          title: `Mercadería anterior · ${product.name}`.slice(0, 200),
          created: (debt) => {
            client.setQueryData(
              ["supplier-payables", "all"],
              (old: typeof payables.data) => [
                ...(old ?? []).filter((item) => item.id !== debt.id),
                debt,
              ],
            );
            setPayableId(debt.id);
            setCreatedDebt(true);
            setOpeningSupplier(null);
          },
        }}
      />
    );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) close();
      }}
    >
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Estado de pago de la mercadería</DialogTitle>
          <DialogDescription>
            {product.name} · {available} unidades con pago sin indicar.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            if (review) {
              mutation.mutate(review);
              return;
            }
            if (!classification) return;
            try {
              const payload = stockClassificationInput(
                {
                  productId: product.id,
                  qty,
                  classification,
                  cost,
                  payableId: payable?.id ?? "",
                  reason:
                    reason.trim() ||
                    "Estado de pago indicado para mercadería ya existente",
                },
                available,
              );
              if (
                classification === "Credito" &&
                payable &&
                qty * payload.unitCostAmountCents > payable.balanceCents
              )
                throw new Error(
                  "El valor de estas unidades supera la deuda elegida. Revisá las unidades, el costo o la deuda.",
                );
              setReview(payload);
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Revisá los datos antes de continuar.",
              );
            }
          }}
        >
          {review ? (
            <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
              <p className="font-medium">
                {review.qty} unidades de {product.name}
              </p>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt>Quedan como</dt>
                  <dd className="font-semibold">
                    {review.classification === "Credito"
                      ? "A crédito"
                      : "Pagadas"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Valor al costo</dt>
                  <dd className="font-medium">
                    {money(review.qty * review.unitCostAmountCents)}
                  </dd>
                </div>
                {review.classification === "Credito" ? (
                  <>
                    <div className="flex justify-between gap-3">
                      <dt>Proveedor</dt>
                      <dd className="text-right font-medium">
                        {supplier?.name}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Se relacionan con esta deuda anterior
                      </dt>
                      <dd className="mt-1 font-medium">
                        {payable?.title} · {money(payable?.balanceCents ?? 0)}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
              <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                Tu stock sigue en {product.stock} unidades.{" "}
                {review.classification === "Credito"
                  ? "La deuda elegida conserva su importe."
                  : "No se registra un pago nuevo."}
              </p>
            </div>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">
                  ¿Mercadería pagada o a crédito?
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["Pagada", "Pagada"],
                      ["Credito", "A crédito"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border border-border p-4 text-sm font-medium transition-colors hover:bg-muted/40",
                        classification === value &&
                          "border-primary bg-primary/5",
                      )}
                    >
                      <input
                        type="radio"
                        name="stock-payment-status"
                        value={value}
                        checked={classification === value}
                        onChange={() => {
                          setClassification(value);
                          setError("");
                        }}
                        className="size-4 accent-primary"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {classification ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Unidades">
                      <Input
                        required
                        type="number"
                        min={1}
                        max={available}
                        step={1}
                        value={qty}
                        onChange={(event) => setQty(Number(event.target.value))}
                      />
                    </Field>
                    <Amount
                      label="Costo por unidad"
                      value={cost}
                      onChange={setCost}
                    />
                  </div>
                  {classification === "Credito" ? (
                    <div className="space-y-3">
                      <Field label="Proveedor al que le debés">
                        <Select
                          value={supplierId}
                          onValueChange={(value) => {
                            setSupplierId(value);
                            setPayableId("");
                          }}
                        >
                          <SelectTrigger aria-label="Proveedor al que le debés">
                            <SelectValue placeholder="Elegí el proveedor" />
                          </SelectTrigger>
                          <SelectContent>
                            {(suppliers.data ?? []).map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}
                                {!item.active ? " (inactivo)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      {loading ? (
                        <p
                          role="status"
                          className="text-sm text-muted-foreground"
                        >
                          Buscando deudas del proveedor...
                        </p>
                      ) : loadError ? (
                        <p role="alert" className="text-sm text-destructive">
                          No se pudieron consultar los proveedores o sus deudas.{" "}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void suppliers.refetch();
                              void payables.refetch();
                            }}
                          >
                            Reintentar
                          </Button>
                        </p>
                      ) : supplier ? (
                        <>
                          {options.length > 1 ? (
                            <Field label="¿A qué deuda pertenecen?">
                              <Select
                                value={payableId}
                                onValueChange={setPayableId}
                              >
                                <SelectTrigger aria-label="¿A qué deuda pertenecen?">
                                  <SelectValue placeholder="Elegí una deuda anterior" />
                                </SelectTrigger>
                                <SelectContent>
                                  {options.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      {item.title} · {money(item.balanceCents)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </Field>
                          ) : null}
                          {payable ? (
                            <div className="rounded-md bg-muted/40 p-3 text-sm">
                              <p className="text-muted-foreground">
                                Se relaciona con la deuda anterior
                              </p>
                              <p className="mt-1 font-medium">
                                {payable.title}
                              </p>
                              <p className="mt-1">
                                Total que le debés:{" "}
                                <strong>{money(payable.balanceCents)}</strong>
                              </p>
                            </div>
                          ) : options.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Todavía no hay una deuda anterior cargada con{" "}
                              {supplier.name}.
                            </p>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setOpeningSupplier(supplier)}
                          >
                            {options.length
                              ? "Cargar otra deuda anterior"
                              : "Cargar lo que le debo"}
                          </Button>
                          {createdDebt ? (
                            <p
                              role="status"
                              className="text-xs text-muted-foreground"
                            >
                              La deuda ya quedó guardada en Proveedores.
                            </p>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  <Disclosure title="Agregar una nota (opcional)">
                    <Field label="Nota">
                      <Textarea
                        maxLength={200}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </Field>
                  </Disclosure>
                </>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Para mercadería que ya está en Stock. Si acaba de ingresar,{" "}
                <Link
                  className="font-medium text-primary underline underline-offset-4"
                  to="/compras"
                  search={{
                    proveedor:
                      product.supplierId === "local"
                        ? undefined
                        : product.supplierId,
                  }}
                >
                  registrá una compra
                </Link>
                .
              </p>
            </>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-2 border-t border-border bg-card py-3">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => {
                if (review) {
                  setReview(null);
                  setError("");
                } else close();
              }}
            >
              {review ? "Volver a editar" : "Cancelar"}
            </Button>
            <Button
              disabled={
                mutation.isPending ||
                !classification ||
                !cost.trim() ||
                (classification === "Credito" &&
                  (!payable || loading || !!loadError))
              }
            >
              {mutation.isPending
                ? "Guardando..."
                : review
                  ? "Confirmar estado de pago"
                  : "Revisar cambio"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
