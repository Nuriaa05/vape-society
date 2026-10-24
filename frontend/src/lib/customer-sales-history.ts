import type { CustomerSale } from "./collections";
import { normalizeHistorySearch, paginateHistory } from "./account-history";
import { money } from "./collections-form";
import { formatDateAR, formatDateInputAR } from "./formatters";

export function saleHistoryPaymentLabel(sale: CustomerSale) {
  switch (sale.paymentTerms) {
    case "Immediate":
      return "Pago inmediato";
    case "DirectInstallments":
      return "Cuotas directas";
    case "CardInstallments":
      return "Cuotas con tarjeta";
    default:
      return "Sin seguimiento financiero";
  }
}

export function saleHistoryStatus(sale: CustomerSale) {
  if (sale.status === "Anulada") return "Anulada";
  return sale.deliveryStatus || sale.status || "—";
}

export function getCustomerSalesHistoryView(
  sales: CustomerSale[],
  search: string,
  requestedPage: number,
) {
  const terms = normalizeHistorySearch(search.trim())
    .split(/\s+/)
    .filter(Boolean);
  const matching = sales
    .filter((sale) => {
      if (!terms.length) return true;
      const searchable = normalizeHistorySearch(
        [
          sale.number ?? sale.id,
          sale.date ? formatDateAR(sale.date) : "",
          sale.date ? formatDateInputAR(sale.date) : "",
          saleHistoryPaymentLabel(sale),
          saleHistoryStatus(sale),
          sale.totalAmountCents === undefined
            ? ""
            : money(sale.totalAmountCents),
          sale.totalAmountCents === undefined
            ? ""
            : String(sale.totalAmountCents / 100),
        ].join(" "),
      );
      return terms.every((term) => searchable.includes(term));
    })
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return paginateHistory(matching, requestedPage);
}
