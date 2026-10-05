import { apiClient, ApiError } from "@/lib/api-client";
import { type Category, type Product } from "@/lib/contracts";
import { amountCentsToPesos, pesosToAmountCents } from "@/lib/money";

export type ApiProduct = {
  id: string;
  barcode: string | null;
  name: string;
  category: { id: string; name: string };
  supplier: { id: string; name: string } | null;
  costAmountCents: number;
  priceAmountCents: number;
  marginPct: number;
  physicalStock: number;
  minStock: number;
  saleEnabled?: boolean;
  archived: boolean;
};

export type ProductSaveInput = Omit<Product, "id" | "itemType"> & {
  id?: string;
};

export function toProduct(product: ApiProduct): Product {
  return {
    itemType: "Product",
    id: product.id,
    barcode: product.barcode ?? "",
    name: product.name,
    categoryId: product.category.id,
    category: product.category.name as Category,
    supplierId: product.supplier?.id ?? "",
    cost: amountCentsToPesos(product.costAmountCents),
    marginPct: product.marginPct,
    price: amountCentsToPesos(product.priceAmountCents),
    stock: product.physicalStock,
    minStock: product.minStock,
    archived: product.archived,
    saleEnabled: product.saleEnabled ?? true,
  };
}

function toProductPayload(product: ProductSaveInput) {
  return {
    barcode: product.barcode.trim() || null,
    name: product.name,
    categoryId: product.categoryId ?? product.category,
    supplierId: product.supplierId || null,
    costAmountCents: pesosToAmountCents(product.cost),
    priceAmountCents: pesosToAmountCents(product.price),
    marginPct: product.marginPct,
    physicalStock: product.stock,
    minStock: product.minStock,
  };
}

function toProductUpdatePayload(product: ProductSaveInput) {
  const { physicalStock, ...payload } = toProductPayload(product);
  void physicalStock;
  return payload;
}

export const productsRepository = {
  async findAll(includeArchived = true): Promise<Product[]> {
    const products = await apiClient.get<ApiProduct[]>("/products", {
      includeArchived,
    });
    return products.map(toProduct);
  },

  async findActive(): Promise<Product[]> {
    const products = await apiClient.get<ApiProduct[]>("/products");
    return products.map(toProduct);
  },

  async findById(id: string): Promise<Product | undefined> {
    try {
      return toProduct(await apiClient.get<ApiProduct>(`/products/${id}`));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return undefined;
      }
      throw error;
    }
  },

  async findByBarcode(barcode: string): Promise<Product | undefined> {
    try {
      return toProduct(
        await apiClient.get<ApiProduct>(
          `/products/barcode/${encodeURIComponent(barcode)}`,
        ),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return undefined;
      }
      throw error;
    }
  },

  async findByName(query: string, limit?: number): Promise<Product[]> {
    const products = await apiClient.get<ApiProduct[]>("/products", {
      q: query,
      limit,
    });
    return products.map(toProduct);
  },

  async findLowStock(): Promise<Product[]> {
    return this.findInventoryAlerts();
  },

  async findOutOfStock(): Promise<Product[]> {
    const products = await this.findAll();
    return products.filter((product) => product.stock <= 0);
  },

  async findInventoryAlerts(limit?: number): Promise<Product[]> {
    const products = await apiClient.get<ApiProduct[]>("/products/alerts", {
      limit,
    });
    return products.map(toProduct);
  },

  async save(product: ProductSaveInput): Promise<Product> {
    const payload = product.id
      ? toProductUpdatePayload(product)
      : toProductPayload(product);
    const saved = product.id
      ? await apiClient.patch<ApiProduct>(`/products/${product.id}`, payload)
      : await apiClient.post<ApiProduct>("/products", payload);

    return toProduct(saved);
  },

  async archive(id: string): Promise<Product> {
    return this.setArchived(id, true);
  },

  async setArchived(id: string, archived: boolean): Promise<Product> {
    return toProduct(
      await apiClient.patch<ApiProduct>(`/products/${id}/archive`, {
        archived,
      }),
    );
  },

  async updateMinStock(id: string, minStock: number): Promise<Product> {
    return toProduct(
      await apiClient.patch<ApiProduct>(`/products/${id}`, { minStock }),
    );
  },
};
