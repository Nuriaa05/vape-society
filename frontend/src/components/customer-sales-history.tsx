import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { AccountHistoryPager } from "@/components/account-history-pager";
import { Disclosure } from "@/components/ui/disclosure";
import type { CustomerSale } from "@/lib/collections";
import { money } from "@/lib/collections-form";
import { getCustomerSalesHistoryView } from "@/lib/customer-sales-history";
import { formatDateAR } from "@/lib/formatters";

export function CustomerSalesHistory({ sales }: { sales: CustomerSale[] }) {
  const [page, setPage] = useState(0);
  const view = getCustomerSalesHistoryView(sales, "", page);
  return (
    <Disclosure
      className="min-w-0"
      title={
        <>
          <ShoppingBag
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="font-semibold">Ventas asociadas</span>
          <span className="text-xs font-normal text-muted-foreground">
            {sales.length} {sales.length === 1 ? "registro" : "registros"}
          </span>
        </>
      }
    >
      <div className="space-y-3">
        <div className="overflow-x-auto">
          <table
            aria-label="Ventas asociadas"
            className="w-full min-w-[22rem] text-sm"
          >
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-3 text-left font-medium">
                  Fecha
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Venta
                </th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((sale) => (
                <tr
                  key={sale.id}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                >
                  <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums">
                    {sale.date ? formatDateAR(sale.date) : "—"}
                  </td>
                  <td className="px-3 py-2.5 font-medium">
                    {sale.number ?? sale.id}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pl-3 text-right font-semibold tabular-nums">
                    {sale.totalAmountCents === undefined
                      ? "—"
                      : money(sale.totalAmountCents)}
                  </td>
                </tr>
              ))}
              {!view.rows.length ? (
                <tr>
                  <td
                    colSpan={3}
                    className="py-6 text-center text-muted-foreground"
                  >
                    Sin ventas asociadas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <AccountHistoryPager kind="ventas" view={view} onPageChange={setPage} />
      </div>
    </Disclosure>
  );
}
