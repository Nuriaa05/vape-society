import { describe, expect, it } from "vitest";

import { buildSaleQuoteKey, parseOptionalCashInput } from "./sale-checkout";

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
