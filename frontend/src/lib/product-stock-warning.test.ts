import { describe, expect, it } from "vitest";

import { requiresNegativeInitialStockConfirmation } from "./product-stock-warning";

describe("requiresNegativeInitialStockConfirmation", () => {
  it("requires confirmation only for a new product with negative stock", () => {
    expect(
      requiresNegativeInitialStockConfirmation({ isEdit: false, stock: -1 }),
    ).toBe(true);
    expect(
      requiresNegativeInitialStockConfirmation({ isEdit: false, stock: 0 }),
    ).toBe(false);
    expect(
      requiresNegativeInitialStockConfirmation({ isEdit: true, stock: -1 }),
    ).toBe(false);
  });
});
