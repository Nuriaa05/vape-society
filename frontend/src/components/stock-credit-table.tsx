import { useRef, useState } from "react";
import type { Product } from "@/lib/contracts";
import { stockRepository } from "@/lib/repositories";
import { money } from "@/lib/collections-form";
import { StatusBadge } from "./app-shell";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  ArrowUp,
  Eye,
  MoreHorizontal,
  Settings2,
  SlidersHorizontal,
  Tags,
} from "lucide-react";

export function StockCreditTable({
  products,
  classify,
  increase,
  adjust,
  minimum,
}: {
  products: Product[];
  classify: (product: Product) => void;
  increase: (id: string) => void;
  adjust: (id: string) => void;
  minimum: (product: Product) => void;
}) {
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const detailProduct = products.find(
    (product) => product.id === detailProductId,
  );

  return (
    <div className="max-h-[640px] overflow-auto">
      <table className="w-full min-w-[800px] text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-card">
          <tr>
            <th className="app-table-heading text-left font-medium">
              Producto
            </th>
            {["Propio", "A crédito", "Total físico", "Disponible"].map(
              (label) => (
                <th
                  key={label}
                  className="app-table-heading text-right font-medium"
                >
                  {label}
                </th>
              ),
            )}
            <th className="app-table-heading text-center font-medium">
              Estado
            </th>
            <th className="app-table-heading text-center font-medium">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const status = stockRepository.getStatus(product);
            return (
              <tr
                key={product.id}
                className="border-b border-border/60 last:border-0 hover:bg-muted/30"
              >
                <td className="px-5 py-3">
                  <div className="font-medium">{product.name}</div>
                  {(product.unclassifiedQty ?? 0) > 0 ? (
                    <p className="mt-1 text-xs text-warning-foreground">
                      {product.unclassifiedQty} con pago sin indicar
                    </p>
                  ) : null}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <div className="font-medium">{product.paidQty ?? 0}</div>
                  <div className="text-xs text-muted-foreground">
                    {money(product.paidValueCents ?? 0)}
                  </div>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <div className="font-medium">{product.creditQty ?? 0}</div>
                  <div className="text-xs text-muted-foreground">
                    {money(product.creditValueCents ?? 0)}
                  </div>
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <div className="font-semibold">{product.stock}</div>
                  <div className="text-xs text-muted-foreground">
                    {money(product.totalValueCents ?? 0)}
                  </div>
                </td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums">
                  {stockRepository.getAvailableStock(product)}
                </td>
                <td className="px-5 py-3 text-center">
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </td>
                <td className="px-5 py-3 text-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Acciones"
                        onPointerDown={(event) => {
                          detailTriggerRef.current = event.currentTarget;
                        }}
                        onFocus={(event) => {
                          detailTriggerRef.current = event.currentTarget;
                        }}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onSelect={() => setDetailProductId(product.id)}
                        >
                          <Eye />
                          Ver detalle
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={product.archived}
                          onSelect={() => increase(product.id)}
                        >
                          <ArrowUp />
                          Aumentar stock
                        </DropdownMenuItem>
                        {(product.unclassifiedQty ?? 0) > 0 ? (
                          <DropdownMenuItem onSelect={() => classify(product)}>
                            <Tags aria-hidden="true" />
                            Clasificar
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem onSelect={() => adjust(product.id)}>
                          <Settings2 />
                          Ajustar stock
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => minimum(product)}>
                          <SlidersHorizontal />
                          Editar stock mínimo
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
          {products.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="px-5 py-8 text-center text-muted-foreground"
              >
                No hay productos que coincidan con la búsqueda.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <Dialog
        open={detailProduct !== undefined}
        onOpenChange={(open) => {
          if (!open) setDetailProductId(null);
        }}
      >
        {detailProduct ? (
          <DialogContent
            className="max-w-md"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              detailTriggerRef.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>Detalle de stock</DialogTitle>
              <DialogDescription className="break-words">
                {detailProduct.name}
              </DialogDescription>
            </DialogHeader>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">Código</dt>
                <dd className="break-all font-mono">{detailProduct.barcode}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">
                  Reservado para entregas
                </dt>
                <dd className="font-medium tabular-nums">
                  {detailProduct.reservedStock ?? 0}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">Stock mínimo</dt>
                <dd className="font-medium tabular-nums">
                  {detailProduct.minStock}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">Pago sin indicar</dt>
                <dd className="font-medium tabular-nums">
                  {detailProduct.unclassifiedQty ?? 0} unidades ·{" "}
                  {money(detailProduct.unclassifiedValueCents ?? 0)}
                </dd>
              </div>
            </dl>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cerrar</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
