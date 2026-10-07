import { describe, expect, it } from "vitest";

import type { Product } from "./contracts";
import {
  filterProductsForList,
  getSaleableProducts,
} from "./product-visibility";

const baseProduct: Product = {
  itemType: "Product",
  id: "product-1",
  barcode: "7790001000001",
  name: "Producto activo",
  categoryId: "cat-1",
  category: "Categoría general",
  supplierId: "supplier-1",
  cost: 1000,
  marginPct: 40,
  price: 1400,
  stock: 10,
  minStock: 2,
  archived: false,
};

function product(
  overrides: Partial<Product> & { saleEnabled?: boolean },
): Product {
  return { ...baseProduct, ...overrides };
}

describe("product visibility helpers", () => {
  const products = [
    product({ id: "active", saleEnabled: true }),
    product({
      id: "legacy-disabled",
      name: "Producto anterior",
      barcode: "ABC123",
      saleEnabled: false,
    }),
    product({ id: "legacy", name: "Otro producto" }),
    product({ id: "archived", name: "Producto archivado", archived: true }),
    product({ id: "other-category", category: "Otra categoría" }),
  ];

  it("lists active products regardless of the legacy sale flag", () => {
    expect(
      filterProductsForList(products, {
        query: "",
        category: "Todas",
        showArchived: false,
      }).map((item) => item.id),
    ).toEqual(["active", "legacy-disabled", "legacy", "other-category"]);
  });

  it.each([" anterior ", " abc123 "])(
    "finds legacy active products by name or barcode with query %s",
    (query) => {
      expect(
        filterProductsForList(products, {
          query,
          category: "Categoría general",
          showArchived: false,
        }).map((item) => item.id),
      ).toEqual(["legacy-disabled"]);
    },
  );

  it("includes archived products only when requested and respects the category", () => {
    expect(
      filterProductsForList(products, {
        query: "",
        category: "Categoría general",
        showArchived: true,
      }).map((item) => item.id),
    ).toEqual(["active", "legacy-disabled", "legacy", "archived"]);
  });

  it("offers every active product for sale and excludes archived products", () => {
    expect(getSaleableProducts(products).map((item) => item.id)).toEqual([
      "active",
      "legacy-disabled",
      "legacy",
      "other-category",
    ]);
  });
});
