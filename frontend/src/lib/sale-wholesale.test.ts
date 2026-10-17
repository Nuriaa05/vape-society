import { describe, expect, it } from "vitest";
import { getResolvedItemPrice, hasCurrentPricing } from "./sale-wholesale";
const line = {
  itemType: "Combo" as const,
  itemId: "c1",
  qty: 3,
  basePriceAmountCents: 10000,
  appliedPriceAmountCents: 8000,
  origin: "List" as const,
  effectiveMinimumQty: 5,
  components: [{ productId: "p1", qtyPerCombo: 2 }],
};
describe("backend resolved sale price display", () => {
  it("uses combo price once without recomputing thresholds or components", () => {
    expect(getResolvedItemPrice([line], "Combo", "c1")).toEqual({
      price: 80,
      habitualPrice: 100,
    });
    expect(getResolvedItemPrice([line], "Product", "c1")).toBeNull();
  });
  it("blocks stale, fetching, missing, and failed prices", () => {
    expect(
      hasCurrentPricing({
        data: { fingerprint: "a" },
        isFetching: false,
        isPlaceholderData: false,
        isError: false,
      }),
    ).toBe(true);
    for (const change of [
      { isFetching: true },
      { isPlaceholderData: true },
      { isError: true },
      { data: undefined },
    ])
      expect(
        hasCurrentPricing({
          data: { fingerprint: "a" },
          isFetching: false,
          isPlaceholderData: false,
          isError: false,
          ...change,
        }),
      ).toBe(false);
  });
});
