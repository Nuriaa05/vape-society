import { useState } from "react";
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
import { Field, Amount } from "@/components/collections-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supplierPayablesRepository } from "@/lib/repositories/supplier-payables-repository";
import { stockRepository } from "@/lib/repositories/stock-repository";
import {
  createFinancialOperationResolver,
  money,
} from "@/lib/collections-form";
import { formatPurchaseCostInput } from "@/lib/purchase-draft";
import { stockClassificationInput } from "@/lib/supplier-credit";
import { invalidateInventoryQueries } from "@/lib/inventory-cache";
import { getMutationErrorMessage } from "@/lib/mutation-errors";
import type { Product } from "@/lib/contracts";

export function StockClassificationDialog({
  product,
  close,
}: {
  product: Product;
  close: () => void;
}) {
  const client = useQueryClient();
  const [qty, setQty] = useState(1);
  const [classification, setClassification] = useState<"Pagada" | "Credito">(
    "Pagada",
  );
  const [cost, setCost] = useState(() => formatPurchaseCostInput(product.cost));
  const [payableId, setPayableId] = useState("");
  const [reason, setReason] = useState("");
  const [operationFor] = useState(() => createFinancialOperationResolver());
  const payables = useQuery({
    queryKey: ["supplier-payables", "all"],
    queryFn: () => supplierPayablesRepository.all(),
    enabled: classification === "Credito",
  });
  const options = (payables.data ?? []).filter(
    (p) => !p.purchaseId && p.balanceCents > 0 && p.status !== "Anulada",
  );
  const mutation = useMutation({
    mutationFn: async () => {
      const payload = stockClassificationInput(
        { productId: product.id, qty, classification, cost, payableId, reason },
        product.unclassifiedQty ?? 0,
      );
      return stockRepository.classify({
        ...payload,
        operationId: operationFor(payload),
      });
    },
    onSuccess: () => {
      invalidateInventoryQueries(client);
      void client.invalidateQueries({ queryKey: ["supplier-payables"] });
      toast.success("Stock clasificado.");
      close();
    },
    onError: (error) =>
      toast.error(
        getMutationErrorMessage(error, "No se pudo clasificar el stock."),
      ),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) close();
      }}
    >
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Clasificar stock existente</DialogTitle>
          <DialogDescription>
            Clasificá unidades sin seguimiento de {product.name}. El stock
            físico no cambia y la operación queda auditada.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <p className="text-sm">
            Sin clasificar:{" "}
            <strong>{product.unclassifiedQty ?? 0} unidades</strong>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Cantidad a clasificar">
              <Input
                required
                type="number"
                min={1}
                max={product.unclassifiedQty ?? 0}
                step={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
            </Field>
            <Amount
              label="Costo de adquisición por unidad (pesos)"
              value={cost}
              onChange={setCost}
            />
          </div>
          <Field label="Clasificación">
            <Select
              value={classification}
              onValueChange={(value: "Pagada" | "Credito") =>
                setClassification(value)
              }
            >
              <SelectTrigger aria-label="Clasificación">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pagada">Pagada</SelectItem>
                <SelectItem value="Credito">A crédito</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {classification === "Credito" ? (
            <>
              <Field label="Deuda que financia este stock">
                <Select value={payableId} onValueChange={setPayableId}>
                  <SelectTrigger aria-label="Deuda que financia este stock">
                    <SelectValue placeholder="Elegí una deuda pendiente" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.supplierName} · {p.title} · {money(p.balanceCents)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {payables.isLoading ? (
                <p className="text-xs text-muted-foreground">
                  Cargando deudas...
                </p>
              ) : payables.error ? (
                <p className="text-xs text-destructive">
                  No se pudieron cargar las deudas.{" "}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void payables.refetch()}
                  >
                    Reintentar
                  </Button>
                </p>
              ) : options.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay deudas pendientes. Cargá una deuda inicial desde
                  Proveedores → Cuenta y volvé a clasificar.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                No crea otra deuda. Al pagar la obligación, sus unidades
                restantes pasan a pagadas.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Usá esta opción para mercadería que ya pagaste. No registra un
              pago nuevo.
            </p>
          )}
          <Field label="Motivo">
            <Textarea
              required
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Clasificación del inventario inicial"
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={close}
            >
              Cancelar
            </Button>
            <Button
              disabled={
                mutation.isPending ||
                !cost.trim() ||
                !reason.trim() ||
                (classification === "Credito" &&
                  (!payableId || payables.isLoading || !!payables.error))
              }
            >
              {mutation.isPending ? "Clasificando..." : "Clasificar stock"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
