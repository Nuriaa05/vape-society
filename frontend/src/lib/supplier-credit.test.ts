import { describe, expect, it } from "vitest";
import {
  purchaseFinanceError,
  emptyPurchaseFinance,
  stockClassificationInput,
} from "./supplier-credit";

describe("supplier finance validation", () => {
  it("registers a paid purchase using only its payment date", () => {
    const finance = {
      paymentCondition: "Pagada" as const,
      paymentDate: "2026-10-10",
    };
    expect(purchaseFinanceError(finance, true, "2026-10-15")).toBeNull();
    expect(emptyPurchaseFinance().paymentMethod).toBeNull();
    expect(emptyPurchaseFinance().paymentReference).toBeNull();
    expect(
      purchaseFinanceError({ ...finance, paymentDate: "" }, true),
    ).toContain("fecha de pago");
  });
  it("allows incomplete draft terms but requires one credit due date on registration", () => {
    const finance = {
      ...emptyPurchaseFinance(),
      paymentCondition: "Credito" as const,
    };
    expect(purchaseFinanceError(finance, false)).toBeNull();
    expect(purchaseFinanceError(finance, true)).toContain("vencimiento");
    expect(
      purchaseFinanceError({ ...finance, dueDate: "2026-11-01" }, true),
    ).toBeNull();
  });
  it("requires valid paid terms and rejects future payment dates", () => {
    const finance = {
      ...emptyPurchaseFinance(),
      paymentDate: "2026-10-10",
      paymentMethod: "Transferencia" as const,
    };
    expect(purchaseFinanceError(finance, true, "2026-10-15")).toBeNull();
    expect(
      purchaseFinanceError(
        { ...finance, paymentDate: "2026-10-16" },
        true,
        "2026-10-15",
      ),
    ).toContain("futura");
  });
  it("converts pesos precisely and refuses fractional units, overclassification and unlinked credit", () => {
    const values = {
      productId: "p",
      qty: 2,
      classification: "Pagada" as const,
      cost: "1.234,56",
      payableId: "",
      reason: "Inventario inicial",
    };
    expect(stockClassificationInput(values, 3)).toMatchObject({
      unitCostAmountCents: 123456,
      qty: 2,
    });
    expect(() =>
      stockClassificationInput({ ...values, qty: 1.5 }, 3),
    ).toThrow();
    expect(() => stockClassificationInput(values, 1)).toThrow();
    expect(() =>
      stockClassificationInput({ ...values, classification: "Credito" }, 3),
    ).toThrow("deuda");
  });
});
