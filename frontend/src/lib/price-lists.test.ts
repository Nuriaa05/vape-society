import { describe, expect, it } from "vitest";
import { serializePriceListTiers, pricingContextLabel } from "./price-lists";
import { ApiError } from "./api-client";
import { getSaleCreationErrorMessage } from "./sale-cart";

describe("wholesale editor and historical context", () => {
  it("converts pesos to cents and omits blank cells while retaining zero", () => {
    expect(
      serializePriceListTiers([
        {
          minimumQty: "3",
          cells: {
            "Product:p1": "1.200,50",
            "Combo:c1": "",
            "Product:p2": "0",
          },
        },
      ]),
    ).toEqual([
      {
        minimumQty: 3,
        prices: [
          { itemType: "Product", itemId: "p1", priceAmountCents: 120050 },
          { itemType: "Product", itemId: "p2", priceAmountCents: 0 },
        ],
      },
    ]);
  });
  it("rejects duplicate and fractional scales", () => {
    expect(() =>
      serializePriceListTiers([
        { minimumQty: "2", cells: {} },
        { minimumQty: "2", cells: {} },
      ]),
    ).toThrow();
    expect(() =>
      serializePriceListTiers([{ minimumQty: "1.5", cells: {} }]),
    ).toThrow();
  });
  it("does not infer historical list for legacy sales", () => {
    expect(pricingContextLabel(null)).toBe("Lista no registrada");
    expect(
      pricingContextLabel({
        listName: "Especial",
        countedUnits: 8,
        globalMinimumQty: 5,
      }),
    ).toContain("Especial · 8 unidades · Desde 5");
  });
  it("explains changed prices instead of reporting a stock conflict", () => {
    expect(
      getSaleCreationErrorMessage(
        new ApiError("Los precios cambiaron", 409, { code: "PRICE_CHANGED" }),
      ),
    ).toContain("Revisá el nuevo total");
  });
});
