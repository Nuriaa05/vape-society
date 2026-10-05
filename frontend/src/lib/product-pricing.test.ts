import { describe, expect, it } from "vitest";

import {
  calculateMarginPctFromSalePrice,
  calculateSalePriceFromMargin,
} from "@/lib/product-pricing";

describe("product pricing helpers", () => {
  it("calculates sale price from cost and margin using the current rounded display rule", () => {
    expect(calculateSalePriceFromMargin(1500, 55)).toBe(2330);
  });

  it("recalculates margin when sale price is edited manually", () => {
    expect(calculateMarginPctFromSalePrice(1500, 2330)).toBe(55);
    expect(calculateMarginPctFromSalePrice(1500, 3000)).toBe(100);
  });
});
