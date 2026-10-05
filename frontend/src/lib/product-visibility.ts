import type { Product } from "./contracts";

export type ProductSaleFilter = "Todos" | "Vendibles" | "Solo stock";

export function isSaleEnabledProduct(
  product: Pick<Product, "saleEnabled">,
): boolean {
  return product.saleEnabled !== false;
}

export function getSaleableProducts<T extends Pick<Product, "saleEnabled">>(
  products: T[],
): T[] {
  return products.filter(isSaleEnabledProduct);
}

export function filterProductsForList(
  products: Product[],
  {
    query,
    category,
    showArchived,
    saleFilter,
  }: {
    query: string;
    category: string;
    showArchived: boolean;
    saleFilter: ProductSaleFilter;
  },
): Product[] {
  const normalizedQuery = query.trim().toLowerCase();

  return products.filter((product) => {
    const matchesArchived = showArchived || !product.archived;
    const matchesCategory =
      category === "Todas" || product.category === category;
    const matchesQuery =
      normalizedQuery.length === 0 ||
      product.name.toLowerCase().includes(normalizedQuery) ||
      product.barcode.toLowerCase().includes(normalizedQuery);
    const matchesSaleFilter =
      saleFilter === "Todos" ||
      (saleFilter === "Vendibles" && isSaleEnabledProduct(product)) ||
      (saleFilter === "Solo stock" && !isSaleEnabledProduct(product));

    return (
      matchesArchived && matchesCategory && matchesQuery && matchesSaleFilter
    );
  });
}
