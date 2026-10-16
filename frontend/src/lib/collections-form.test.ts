import { describe, expect, it } from "vitest";
import {
  allocationAmounts,
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
