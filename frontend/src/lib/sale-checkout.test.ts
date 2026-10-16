import { describe, expect, it } from "vitest";

import {
  buildSaleQuoteKey,
  parseOptionalCashInput,
  resolveSaleOperationId,
} from "./sale-checkout";

describe("sale checkout helpers", () => {
  it("parses optional cash input using Argentine peso rules", () => {
    expect(parseOptionalCashInput("")).toBeUndefined();
    expect(parseOptionalCashInput("   ")).toBeUndefined();
    expect(parseOptionalCashInput("10.000")).toBe(1_000_000);
  });

  it("builds a stable key from normalized quote inputs", () => {
    const lines = [
      { itemType: "Combo" as const, itemId: "combo-2", qty: 1 },
      { itemType: "Product" as const, itemId: "product-1", qty: 2 },
    ];
    const key = buildSaleQuoteKey({
      lines,
      paymentMethodId: "pm1",
      couponCode: " verano10 ",
      cashReceivedInput: "10.000",
      deliveryStatus: "Entregado",
      allowNegativeStock: false,
    });
    const reorderedKey = buildSaleQuoteKey({
      lines: [...lines].reverse(),
      paymentMethodId: "pm1",
      couponCode: "VERANO10",
      cashReceivedInput: "10000",
      deliveryStatus: "Entregado",
      allowNegativeStock: false,
    });

    expect(key).toContain("VERANO10");
    expect(key).toContain(1_000_000);
    expect(key).toEqual(reorderedKey);
  });
});

it("invalidates quotes when customer, financing, upfront or manual card schedule changes", () => {
  const base = {
    lines: [{ itemType: "Product" as const, itemId: "p", qty: 1 }],
    paymentMethodId: "",
    couponCode: "",
    cashReceivedInput: "",
    deliveryStatus: "Entregado" as const,
    allowNegativeStock: false,
    paymentTerms: "DirectInstallments" as const,
    customerId: "c1",
    directPlan: {
      installmentCount: 3,
      firstDueDate: "2026-10-31",
      upfrontAmountCents: 100,
    },
  };
  const key = buildSaleQuoteKey(base);
  expect(buildSaleQuoteKey({ ...base, customerId: "c2" })).not.toEqual(key);
  expect(
    buildSaleQuoteKey({
      ...base,
      directPlan: { ...base.directPlan, upfrontAmountCents: 200 },
    }),
  ).not.toEqual(key);
  expect(
    buildSaleQuoteKey({
      ...base,
      directPlan: { ...base.directPlan, firstDueDate: "2026-11-01" },
    }),
  ).not.toEqual(key);
  expect(
    buildSaleQuoteKey({
      ...base,
      cardPlan: {
        installmentCount: 6,
        processor: "Visa",
        settlements: [
          { dueDate: "2026-12-01", grossAmountCents: 1000, feeAmountCents: 80 },
        ],
      },
    }),
  ).not.toEqual(key);
});

it("reuses the persisted operation for retries and rotates only after the submitted payload changes", () => {
  const createId = () => "next-operation";
  expect(
    resolveSaleOperationId("", "payload", "draft-operation", createId),
  ).toBe("draft-operation");
  expect(
    resolveSaleOperationId("payload", "payload", "draft-operation", createId),
  ).toBe("draft-operation");
  expect(
    resolveSaleOperationId(
      "payload",
      "changed-payload",
      "draft-operation",
      createId,
    ),
  ).toBe("next-operation");
});
