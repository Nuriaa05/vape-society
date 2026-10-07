import type { Product } from "./contracts";

export function getSaleableProducts<T extends Pick<Product, "archived">>(
  products: T[],
): T[] {
  return products.filter((product) => !product.archived);
}

export function filterProductsForList(
  products: Product[],
  {
    query,
    category,
    showArchived,
  }: {
    query: string;
    category: string;
    showArchived: boolean;
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
    return matchesArchived && matchesCategory && matchesQuery;
  });
}
