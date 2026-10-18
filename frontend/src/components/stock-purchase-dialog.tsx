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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, Amount } from "@/components/collections-controls";
import { PurchaseFinanceFields } from "@/components/purchase-finance-fields";
import { purchasesRepository, suppliersRepository } from "@/lib/repositories";
import type { SavePurchaseInput } from "@/lib/repositories/purchases-repository";
import {
  emptyPurchaseFinance,
  purchaseFinanceError,
} from "@/lib/supplier-credit";
import { formatPurchaseCostInput } from "@/lib/purchase-draft";
import {
  createFinancialOperationResolver,
  money,
  today,
} from "@/lib/collections-form";
import { amountCentsToPesos, parsePesosToAmountCents } from "@/lib/money";
import { getPurchaseSupplierOptions } from "@/lib/purchase-suppliers";
import { getMutationErrorMessage } from "@/lib/mutation-errors";
import { invalidateInventoryQueries } from "@/lib/inventory-cache";
import type { Product } from "@/lib/contracts";

export function StockPurchaseDialog({
  products,
  initialProductId,
  initialQty = 1,
  close,
}: {
  products: Product[];
  initialProductId: string | null;
  initialQty?: number;
  close: () => void;
}) {
  const client = useQueryClient();
  const initial = products.find((product) => product.id === initialProductId);
  const [productId, setProductId] = useState(initialProductId ?? "");
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [qty, setQty] = useState(initialQty);
  const [cost, setCost] = useState(
    initial ? formatPurchaseCostInput(initial.cost) : "",
  );
  const [date, setDate] = useState(today);
  const [finance, setFinance] = useState(emptyPurchaseFinance);
  const [error, setError] = useState("");
  const [operationFor] = useState(() => createFinancialOperationResolver());
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersRepository.findAll(),
  });
  const supplierOptions = getPurchaseSupplierOptions(suppliers.data ?? []);
  const supplier = supplierOptions.find((item) => item.id === supplierId);
  const product = products.find(
    (item) => item.id === productId && !item.archived,
  );
  const validQty = Number.isSafeInteger(qty) && qty > 0;
  const financeError = purchaseFinanceError(finance, true);
  let unitCost: number | null = null;
  try {
    unitCost = parsePesosToAmountCents(cost);
  } catch {
    /* The field can be incomplete while editing. */
  }
  const validCost =
    unitCost !== null &&
    Number.isSafeInteger(unitCost) &&
    unitCost >= 0 &&
    Number.isSafeInteger(unitCost * qty);
  const mutation = useMutation({
    mutationFn: (payload: SavePurchaseInput) =>
      purchasesRepository.create({
        ...payload,
        operationId: operationFor(payload),
      }),
    onSuccess: () => {
      invalidateInventoryQueries(client);
      void client.invalidateQueries({ queryKey: ["purchases"] });
      void client.invalidateQueries({ queryKey: ["supplier-payables"] });
      void client.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Compra registrada. Stock actualizado.");
      close();
    },
    onError: (cause) =>
      setError(
        getMutationErrorMessage(
          cause,
          "No se pudo registrar la compra. Podés reintentar sin duplicar el ingreso.",
        ),
      ),
  });
  const canSave =
    !!product &&
    !!supplier &&
    validQty &&
    validCost &&
    !financeError &&
    !!date &&
    !suppliers.isLoading &&
    !suppliers.error;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) close();
      }}
    >
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aumentar stock</DialogTitle>
          <DialogDescription>
            Se registrará una compra y se sumarán las unidades al inventario.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !canSave ||
              !product ||
              !supplier ||
              unitCost === null ||
              mutation.isPending
            )
              return;
            setError("");
            mutation.mutate({
              supplierId: supplier.id,
              date,
              ...finance,
              status: "Registrada",
              items: [
                {
                  productId: product.id,
                  qty,
                  cost: amountCentsToPesos(unitCost),
                },
              ],
            });
          }}
        >
          <fieldset disabled={mutation.isPending} className="space-y-4">
            <Field label="Producto">
              <Select
                value={productId}
                disabled={!!initialProductId}
                onValueChange={(id) => {
                  setProductId(id);
                  const selected = products.find((item) => item.id === id);
                  setSupplierId(selected?.supplierId ?? "");
                  setCost(
                    selected ? formatPurchaseCostInput(selected.cost) : "",
                  );
                }}
              >
                <SelectTrigger aria-label="Producto">
                  <SelectValue placeholder="Elegí un producto" />
                </SelectTrigger>
                <SelectContent>
                  {products
                    .filter((item) => !item.archived)
                    .map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            {!products.some((item) => !item.archived) ? (
              <p className="text-sm text-muted-foreground">
                Primero{" "}
                <Link
                  to="/productos"
                  className="text-primary underline underline-offset-4"
                >
                  creá un producto
                </Link>
                .
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Proveedor">
                <Select
                  value={supplier?.id ?? ""}
                  onValueChange={setSupplierId}
                >
                  <SelectTrigger aria-label="Proveedor">
                    <SelectValue placeholder="Elegí un proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {supplierOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Fecha de compra">
                <Input
                  required
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </Field>
            </div>
            {suppliers.isLoading ? (
              <p role="status" className="text-sm text-muted-foreground">
                Cargando proveedores...
              </p>
            ) : suppliers.error ? (
              <p role="alert" className="text-sm text-destructive">
                No se pudieron cargar los proveedores.{" "}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void suppliers.refetch()}
                >
                  Reintentar
                </Button>
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unidades a ingresar">
                <Input
                  required
                  type="number"
                  min={1}
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
            <PurchaseFinanceFields value={finance} onChange={setFinance} />
            <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span>Total de la compra</span>
                <strong className="tabular-nums">
                  {validCost && validQty ? money(unitCost! * qty) : "—"}
                </strong>
              </div>
              {product ? (
                <p className="mt-2 text-muted-foreground">
                  Stock: {product.stock} →{" "}
                  {validQty ? product.stock + qty : "—"} unidades
                </p>
              ) : null}
            </div>
          </fieldset>
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
              onClick={close}
            >
              Cancelar
            </Button>
            <Button disabled={!canSave || mutation.isPending}>
              {mutation.isPending ? "Guardando..." : "Registrar compra"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
