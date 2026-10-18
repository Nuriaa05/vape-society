import { Disclosure } from "@/components/ui/disclosure";
import type { Product } from "@/lib/contracts";
import { stockRepository } from "@/lib/repositories";
import { money } from "@/lib/collections-form";
import { StatusBadge } from "./app-shell";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { MoreHorizontal, Settings2, SlidersHorizontal } from "lucide-react";

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
  return (
    <div className="max-h-[640px] overflow-auto">
      <table className="w-full min-w-[800px] text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-card">
          <tr>
            <th className="app-table-heading text-left font-medium">
              Producto
            </th>
            {["Pagado", "A crédito", "Total físico", "Disponible"].map(
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
                  <Disclosure className="mt-2 min-w-44" title="Ver detalle">
                    <div className="mt-2 space-y-1">
                      <p className="font-mono">{product.barcode}</p>
                      <p>
                        Reservado para entregas: {product.reservedStock ?? 0}
                      </p>
                      <p>Stock mínimo: {product.minStock}</p>
                      <p>
                        Pago sin indicar: {product.unclassifiedQty ?? 0} ·{" "}
                        {money(product.unclassifiedValueCents ?? 0)}
                      </p>
                    </div>
                  </Disclosure>
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
                      <Button size="icon" variant="ghost" aria-label="Acciones">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={product.archived}
                        onSelect={() => increase(product.id)}
                      >
                        Aumentar stock
                      </DropdownMenuItem>
                      {(product.unclassifiedQty ?? 0) > 0 ? (
                        <DropdownMenuItem onSelect={() => classify(product)}>
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
    </div>
  );
}
