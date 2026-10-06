import { describe, expect, it } from "vitest";

import type { Combo, Product } from "@/lib/contracts";
import { ApiError } from "@/lib/api-client";
import {
  addOrIncrementLine,
  adjustLineQuantity,
  applyCouponCode,
  canConfirmQuotedSale,
  clearAppliedCoupon,
  filterSaleCatalogItems,
  getCartItemKey,
  getNegativeStockWarnings,
  getSaleCreationErrorMessage,
  normalizeCartQty,
  setLineQuantity,
} from "@/lib/sale-cart";

const product = (id: string): Product => ({
  itemType: "Product",
  id,
  barcode: `779${id}`,
  name: `Producto ${id}`,
  category: "Hamburguesas",
  supplierId: "s1",
  cost: 100,
  marginPct: 50,
  price: 150,
  stock: 10,
  minStock: 1,
});

const combo = (): Combo => ({
  itemType: "Combo",
  id: "combo-1",
  barcode: "7799990000018",
  name: "Combo Burger",
  price: 6000,
  productsTotal: 7180,
  discount: 1180,
  archived: false,
  items: [
    {
      productId: "p1",
      productName: "Producto p1",
      barcode: "779p1",
      qty: 1,
      stock: 2,
      availableStock: 2,
    },
    {
      productId: "p2",
      productName: "Producto p2",
      barcode: "779p2",
      qty: 2,
      stock: 3,
      availableStock: 3,
    },
  ],
});

describe("Nueva venta cart helpers", () => {
  it("increments an existing product instead of duplicating the line", () => {
    const first = product("p1");

    const lines = addOrIncrementLine([{ product: first, qty: 1 }], first);

    expect(lines).toEqual([{ product: first, qty: 2 }]);
  });

  it("increments an existing barcode instead of duplicating the line", () => {
    const first = product("p1");
    const sameBarcode = { ...product("p2"), barcode: first.barcode };

    const lines = addOrIncrementLine([{ product: first, qty: 1 }], sameBarcode);

    expect(lines).toEqual([{ product: first, qty: 2 }]);
  });

  it("does not merge different products that both have no barcode", () => {
    const first = { ...product("p1"), barcode: "" };
    const second = { ...product("p2"), barcode: "" };

    const lines = addOrIncrementLine([{ product: first, qty: 1 }], second);

    expect(lines).toEqual([
      { product: first, qty: 1 },
      { product: second, qty: 1 },
    ]);
  });

  it("collapses duplicate existing lines for the same barcode when incrementing", () => {
    const first = product("p1");
    const duplicate = { ...product("p2"), barcode: first.barcode };

    const lines = addOrIncrementLine(
      [
        { product: first, qty: 2 },
        { product: duplicate, qty: 1 },
      ],
      first,
    );

    expect(lines).toEqual([{ product: first, qty: 4 }]);
  });

  it("normalizes direct quantity edits to at least one unit", () => {
    const first = product("p1");

    expect(normalizeCartQty("3")).toBe(3);
    expect(normalizeCartQty("0")).toBe(1);
    expect(
      setLineQuantity([{ product: first, qty: 4 }], first.id, "0"),
    ).toEqual([{ product: first, qty: 1 }]);
  });

  it("adjusts a selected line by keyboard shortcut without going below one", () => {
    const first = product("p1");

    expect(
      adjustLineQuantity([{ product: first, qty: 2 }], first.id, 1),
    ).toEqual([{ product: first, qty: 3 }]);
    expect(
      adjustLineQuantity([{ product: first, qty: 1 }], first.id, -1),
    ).toEqual([{ product: first, qty: 1 }]);
  });

  it("detects when confirming the cart would leave stock negative", () => {
    const first = { ...product("p1"), stock: 0 };

    expect(getNegativeStockWarnings([{ product: first, qty: 3 }])).toEqual([
      {
        productId: "p1",
        productName: "Producto p1",
        requestedQty: 3,
        availableStock: 0,
        resultingStock: -3,
      },
    ]);
  });

  it("detects negative stock from combo components", () => {
    expect(getNegativeStockWarnings([{ product: combo(), qty: 2 }])).toEqual([
      {
        productId: "p2",
        productName: "Producto p2",
        requestedQty: 4,
        availableStock: 3,
        resultingStock: -1,
      },
    ]);
  });

  it("keeps product and combo lines separated even if ids overlap", () => {
    const firstProduct = product("combo-1");
    const firstCombo = { ...combo(), barcode: "" };

    expect(
      addOrIncrementLine([{ product: firstProduct, qty: 1 }], firstCombo),
    ).toEqual([
      { product: firstProduct, qty: 1 },
      { product: firstCombo, qty: 1 },
    ]);
  });

  it("edits only the selected product or combo line when ids overlap", () => {
    const firstProduct = { ...product("combo-1"), barcode: "" };
    const firstCombo = { ...combo(), barcode: "" };

    expect(
      setLineQuantity(
        [
          { product: firstProduct, qty: 1 },
          { product: firstCombo, qty: 1 },
        ],
        getCartItemKey(firstCombo),
        3,
      ),
    ).toEqual([
      { product: firstProduct, qty: 1 },
      { product: firstCombo, qty: 3 },
    ]);
  });

  it("returns a clear stock error message for sale conflicts", () => {
    expect(
      getSaleCreationErrorMessage(
        new ApiError("Stock disponible insuficiente.", 409),
      ),
    ).toBe("Stock disponible insuficiente.");
    expect(getSaleCreationErrorMessage(new ApiError("Conflict", 409))).toBe(
      "No hay stock disponible suficiente para completar esta venta.",
    );
  });

  it("applies and clears a normalized coupon code", () => {
    expect(applyCouponCode(" verano10 ")).toBe("VERANO10");
    expect(clearAppliedCoupon()).toBe("");
  });

  it("returns every matching catalog item instead of truncating the search", () => {
    const catalog = Array.from({ length: 8 }, (_, index) =>
      product(`coincidencia-${index + 1}`),
    );

    expect(filterSaleCatalogItems(catalog, "coincidencia")).toHaveLength(8);
    expect(filterSaleCatalogItems(catalog, "   ")).toEqual([]);
  });

  it("finds a product by barcode without dropping leading zeros", () => {
    const first = { ...product("p1"), barcode: "00123456" };
    const second = { ...product("p2"), barcode: "123456" };

    expect(filterSaleCatalogItems([first, second], " 00123456 ")).toEqual([
      first,
    ]);
    expect(filterSaleCatalogItems([first, second], "00123")).toEqual([first]);
  });

  it("searches products and combos by either name or barcode", () => {
    const first = { ...product("p1"), name: "Producto compartido" };
    const firstCombo = {
      ...combo(),
      name: "Combo compartido",
      barcode: "ABC-001",
    };
    const catalog = [first, firstCombo];

    expect(filterSaleCatalogItems(catalog, " COMPARTIDO ")).toEqual(catalog);
    expect(filterSaleCatalogItems(catalog, "abc-001")).toEqual([firstCombo]);
    expect(filterSaleCatalogItems(catalog, "sin coincidencias")).toEqual([]);
  });

  it("confirms only with a complete valid quote and sufficient cash", () => {
    const validState = {
      hasLines: true,
      hasPaymentMethod: true,
      quotePending: false,
      quoteError: false,
      quoteAvailable: true,
      cashShortfall: 0,
    };

    expect(canConfirmQuotedSale(validState)).toBe(true);
    expect(canConfirmQuotedSale({ ...validState, quotePending: true })).toBe(
      false,
    );
    expect(canConfirmQuotedSale({ ...validState, quoteError: true })).toBe(
      false,
    );
    expect(canConfirmQuotedSale({ ...validState, quoteAvailable: false })).toBe(
      false,
    );
    expect(canConfirmQuotedSale({ ...validState, cashShortfall: 1 })).toBe(
      false,
    );
    expect(canConfirmQuotedSale({ ...validState, hasLines: false })).toBe(
      false,
    );
    expect(
      canConfirmQuotedSale({ ...validState, hasPaymentMethod: false }),
    ).toBe(false);
  });
});
