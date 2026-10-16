import { describe, expect, it } from "vitest";
import {
  allocationAmounts,
  suggestPaymentAllocations,
  createFinancialOperationResolver,
  readMoney,
} from "./collections-form";
import type { InstallmentRow } from "./collections";
const row = (
  id: string,
  planId: string,
  remainingAmountCents: number,
): InstallmentRow => ({
  id,
  planId,
  remainingAmountCents,
  number: 1,
  dueDate: "2026-12-01",
  amountCents: 10000,
  paidAmountCents: 0,
  status: "Pendiente",
  customerId: "customer",
  customerName: "Cliente",
  title: planId,
  saleId: null,
});
describe("explicit installment allocations", () => {
  it("suggests oldest due balances first across plans, skipping cancelled and paid installments", () => {
    const rows = [
      { ...row("later", "sale", 20000), dueDate: "2026-12-01" },
      { ...row("old", "opening", 3333), dueDate: "2020-01-01" },
      { ...row("partial", "sale", 6667), dueDate: "2020-02-01" },
      {
        ...row("cancelled", "cancelled", 10000),
        status: "Anulada" as const,
        dueDate: "2019-01-01",
      },
      row("paid", "opening", 0),
    ];
    expect(suggestPaymentAllocations(rows, 10001)).toEqual([
      { installmentId: "old", amountCents: 3333 },
      { installmentId: "partial", amountCents: 6667 },
      { installmentId: "later", amountCents: 1 },
    ]);
    expect(rows[0].id).toBe("later");
  });
  it("rejects a suggested payment outside the remaining debt or with invalid cents", () => {
    const rows = [row("one", "sale", 10000)];
    for (const amount of [0, -1, 10001, 1.5, NaN]) {
      expect(() => suggestPaymentAllocations(rows, amount)).toThrow();
    }
    expect(suggestPaymentAllocations(rows, 10000)).toEqual([
      { installmentId: "one", amountCents: 10000 },
    ]);
  });
  it("retains the retry key when money is reformatted but the submitted payment is unchanged", () => {
    let next = 0;
    const operationFor = createFinancialOperationResolver(
      () => `operation-${++next}`,
    );
    const payment = (raw: string) => ({
      customerId: "c",
      amountCents: readMoney(raw),
    });
    expect(operationFor(payment("100"))).toBe("operation-1");
    expect(operationFor(payment("100,00"))).toBe("operation-1");
    expect(operationFor(payment("200"))).toBe("operation-2");
  });
  it("permits partial early payments across plans without assigning unspecified installments", () => {
    expect(
      allocationAmounts(
        [
          row("one", "sale", 10000),
          row("two", "opening", 20000),
          row("three", "other", 5000),
        ],
        { one: "25,50", two: "100" },
      ),
    ).toEqual([
      { installmentId: "one", amountCents: 2550 },
      { installmentId: "two", amountCents: 10000 },
    ]);
  });
  it("rejects overpayment", () => {
    expect(() =>
      allocationAmounts([row("one", "sale", 10000)], { one: "100,01" }),
    ).toThrow();
  });
  it("rejects malformed and negative money", () => {
    expect(() => readMoney("12,345")).toThrow();
    expect(() => readMoney("-1")).toThrow();
    expect(readMoney("")).toBe(0);
  });
});
