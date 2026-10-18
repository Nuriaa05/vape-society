import { describe, expect, it } from "vitest";
import {
  serializePriceListTiers,
  pricingContextLabel,
  effectiveDraftPrice,
} from "./price-lists";
import { ApiError } from "./api-client";
import { getSaleCreationErrorMessage } from "./sale-cart";

describe("wholesale editor and historical context", () => {
  it("shows the effective price for mixed quantities regardless of column order", () => {
    const tiers = [
      { minimumQty: "12", cells: { "Product:p1": "" } },
      { minimumQty: "6", cells: { "Product:p1": "900" } },
    ];
    expect(effectiveDraftPrice(tiers, "Product:p1", 1000, 5)).toBe(1000);
    expect(effectiveDraftPrice(tiers, "Product:p1", 1000, 12)).toBe(900);
    expect(effectiveDraftPrice(tiers, "Product:p1", 1000, 6)).toBe(900);
  });
  it("retains a zero price and rejects invalid example amounts", () => {
    expect(
      effectiveDraftPrice(
        [{ minimumQty: "6", cells: { "Product:p1": "0" } }],
        "Product:p1",
        1000,
        6,
      ),
    ).toBe(0);
    expect(
      effectiveDraftPrice(
        [{ minimumQty: "6", cells: { "Product:p1": "abc" } }],
        "Product:p1",
        1000,
        6,
      ),
    ).toBeNull();
    expect(effectiveDraftPrice([], "Product:p1", 1000, 0)).toBeNull();
    expect(
      effectiveDraftPrice(
        [
          { minimumQty: "6", cells: {} },
          { minimumQty: "6", cells: {} },
        ],
        "Product:p1",
        1000,
        6,
      ),
    ).toBeNull();
  });
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
