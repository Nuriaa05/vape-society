import type { SupplierPayable } from "./supplier-credit";

export function filterSupplierPayables(
  rows: SupplierPayable[],
  status: string,
  month: string,
  search: string,
) {
  const text = search.trim().toLocaleLowerCase("es-AR");
  return rows.filter(
    (row) =>
      (status === "all" ||
        (status === "pending"
          ? row.balanceCents > 0 || row.refundPendingCents > 0
          : row.status === status)) &&
      (!month || row.dueDate.startsWith(month)) &&
      row.title.toLocaleLowerCase("es-AR").includes(text),
  );
}
