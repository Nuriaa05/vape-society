import { describe, expect, it } from "vitest";

import type { Product } from "./contracts";
import {
  filterProductsForList,
  getSaleableProducts,
  type ProductSaleFilter,
} from "./product-visibility";

const baseProduct: Product = {
  itemType: "Product",
  id: "product-1",
  barcode: "7790001000001",
  name: "Producto vendible",
  categoryId: "cat-1",
  category: "Hamburguesas",
  supplierId: "supplier-1",
  cost: 1000,
  marginPct: 40,
  price: 1400,
  stock: 10,
  minStock: 2,
  archived: false,
  saleEnabled: true,
};

function product(overrides: Partial<Product>): Product {
  return { ...baseProduct, ...overrides };
}

describe("product visibility helpers", () => {
  const products = [
    product({ id: "saleable", name: "Milanesa", saleEnabled: true }),
    product({
      id: "stock-only",
      name: "Masa receta",
      barcode: "",
      saleEnabled: false,
    }),
    product({ id: "legacy", name: "Legacy", saleEnabled: undefined }),
  ];

  it.each([
    ["Vendibles", ["saleable", "legacy"]],
    ["Solo stock", ["stock-only"]],
  ] satisfies Array<[ProductSaleFilter, string[]]>)(
    "filters products by %s",
    (saleFilter, expectedIds) => {
      expect(
        filterProductsForList(products, {
          query: "",
          category: "Todas",
          showArchived: false,
          saleFilter,
        }).map((item) => item.id),
      ).toEqual(expectedIds);
    },
  );

  it("searches by name or barcode while respecting category and archived filters", () => {
    const result = filterProductsForList(
      [
        product({ id: "match-name", name: "Papas noisette" }),
        product({ id: "match-code", barcode: "ABC123", name: "Otro" }),
        product({ id: "archived", name: "Papas archivadas", archived: true }),
      ],
      {
        query: "papas",
        category: "Todas",
        showArchived: false,
        saleFilter: "Todos",
      },
    );

    expect(result.map((item) => item.id)).toEqual(["match-name"]);
  });

  it("excludes stock-only products from the sale catalog", () => {
    expect(getSaleableProducts(products).map((item) => item.id)).toEqual([
      "saleable",
      "legacy",
    ]);
  });
});
