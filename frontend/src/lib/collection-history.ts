import type { FinancialEntry } from "./collections";
import { money } from "./collections-form";
import { formatDateAR } from "./formatters";
import { normalizeHistorySearch, paginateHistory } from "./account-history";

export type CollectionHistoryFilters = {
  search: string;
  date: string;
  method: string;
};

export function getCollectionHistoryView(
  entries: FinancialEntry[],
  filters: CollectionHistoryFilters,
  requestedPage: number,
) {
  const terms = normalizeHistorySearch(filters.search.trim())
    .split(/\s+/)
    .filter(Boolean);
  const matching = entries
    .filter((entry) => {
      const date = entry.date.slice(0, 10);
      if (filters.date && date !== filters.date) return false;
      if (filters.method && entry.paymentMethodName !== filters.method)
        return false;
      if (!terms.length) return true;
      const searchable = normalizeHistorySearch(
        [
          date,
          formatDateAR(`${date}T12:00:00Z`),
          entry.paymentMethodName ?? "",
          money(entry.amountCents),
          String(entry.amountCents / 100),
          entry.reversedAt ? "revertido" : "",
          ...(entry.references ?? []).flatMap((reference) => [
            reference.title,
            reference.saleNumber ?? "",
            reference.kind === "Upfront" ? "anticipo" : "",
            reference.kind === "OpeningBalance" ? "deuda anterior" : "",
            ...reference.installments.map(
              (installment) => `cuota ${installment.number}`,
            ),
          ]),
        ].join(" "),
      );
      return terms.every((term) => searchable.includes(term));
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return paginateHistory(matching, requestedPage);
}
