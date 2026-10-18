import { describe, expect, it } from "vitest";
import { filterSupplierPayables } from "./supplier-account-view";
import type { SupplierPayable } from "./supplier-credit";

const rows = [
  {
    id: "pending",
    title: "Compra perfumes",
    status: "Pendiente",
    balanceCents: 1000,
    refundPendingCents: 0,
    dueDate: "2026-11-02",
  },
  {
    id: "paid",
    title: "Compra perfumes",
    status: "Pagada",
    balanceCents: 0,
    refundPendingCents: 0,
    dueDate: "2026-10-01",
  },
  {
    id: "refund",
    title: "Compra anulada",
    status: "Anulada",
    balanceCents: 0,
    refundPendingCents: 500,
    dueDate: "2026-10-01",
  },
] as SupplierPayable[];

describe("supplier account view", () => {
  it("prioritizes unpaid debts without hiding money the supplier must return", () => {
    expect(
      filterSupplierPayables(rows, "pending", "", "").map((row) => row.id),
    ).toEqual(["pending", "refund"]);
  });
  it("lets the user find settled history and combine date and text filters", () => {
    expect(
      filterSupplierPayables(rows, "all", "2026-10", "PERFUMES").map(
        (row) => row.id,
      ),
    ).toEqual(["paid"]);
    expect(
      filterSupplierPayables(rows, "Pagada", "", "").map((row) => row.id),
    ).toEqual(["paid"]);
    expect(
      filterSupplierPayables(rows, "pending", "2026-11", "anulada"),
    ).toEqual([]);
  });
});
