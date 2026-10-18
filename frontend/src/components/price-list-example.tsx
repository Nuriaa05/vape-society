import { Disclosure } from "@/components/ui/disclosure";
import { useState } from "react";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Field } from "./collections-controls";
import { Label } from "./ui/label";
import { effectiveDraftPrice, type TierDraft } from "@/lib/price-lists";
import { formatARS } from "@/lib/formatters";

export function PriceListExample({
  tiers,
  rows,
  listName,
}: {
  tiers: TierDraft[];
  rows: Array<{
    id: string;
    name: string;
    price: number;
    itemType: "Product" | "Combo";
  }>;
  listName: string;
}) {
  const products = rows.filter((row) => row.itemType === "Product");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const product = products.find((row) => row.id === productId) ?? products[0];
  const price = product
    ? effectiveDraftPrice(
        tiers,
        `Product:${product.id}`,
        product.price,
        Number(quantity),
      )
    : null;
  if (!product) return null;
  return (
    <Disclosure title="Probar estos precios">
      <div className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price-example-product">Producto del ejemplo</Label>
            <Select value={product.id} onValueChange={setProductId}>
              <SelectTrigger id="price-example-product">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {products.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field label="Unidades totales de la venta">
            <Input
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
        </div>
        <div role="status" className="rounded-md bg-muted/40 p-4">
          {price === null ? (
            <p className="text-sm">
              Revisá las cantidades y los precios ingresados.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{product.name}</span>
                <strong>{formatARS(price)} por unidad</strong>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Lista {listName} · {quantity} unidades en total, mezcladas o del
                mismo producto.
              </p>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Es una vista previa de tus cambios. No guarda precios ni registra una
          venta.
        </p>
      </div>
    </Disclosure>
  );
}
