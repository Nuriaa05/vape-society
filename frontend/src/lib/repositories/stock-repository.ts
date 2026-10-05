import { apiClient } from "@/lib/api-client";
import type { Category, Product, Sale, StockMovement } from "@/lib/contracts";
import { formatDateTimeAR } from "@/lib/formatters";
import { amountCentsToPesos } from "@/lib/money";

type ApiStockRow = {
  productId: string;
  barcode: string | null;
  productName: string;
  category: { id: string; name: string };
  supplier: { id: string; name: string } | null;
  costAmountCents: number;
  marginPct: number;
  priceAmountCents: number;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  minStock: number;
  archived: boolean;
};

type ApiStockMovement = {
  id: string;
  date: string;
  productId: string;
  productName: string;
  type: string;
  qty: number;
  sourceType: string;
  sourceId: string;
  note: string | null;
  reversalOf: string | null;
};

export type StockAdjustmentInput =
  | {
      productId: string;
      type: "Ingreso" | "Egreso";
      qty: number;
      reason?: string;
    }
  | {
      productId: string;
      type: "ConteoFisico";
      physicalStock: number;
      reason?: string;
    };

function toProduct(row: ApiStockRow): Product {
  return {
    itemType: "Product",
    id: row.productId,
    barcode: row.barcode ?? "",
    name: row.productName,
    categoryId: row.category.id,
    category: row.category.name as Category,
    supplierId: row.supplier?.id ?? "",
    cost: amountCentsToPesos(row.costAmountCents),
    marginPct: row.marginPct,
    price: amountCentsToPesos(row.priceAmountCents),
    stock: row.physicalStock,
    reservedStock: row.reservedStock,
    availableStock: row.availableStock,
    minStock: row.minStock,
    archived: row.archived,
  };
}

function toMovement(
  movement: ApiStockMovement,
  reversedIds: Set<string>,
): StockMovement {
  const type =
    movement.type === "Venta" ||
    movement.type === "Compra" ||
    movement.type === "Ajuste" ||
    movement.type === "Reverso"
      ? movement.type
      : "Ajuste";

  return {
    id: movement.id,
    date: formatDateTimeAR(movement.date),
    productId: movement.productId,
    productName: movement.productName,
    type,
    qty: movement.qty,
    note: movement.note ?? undefined,
    sourceType: movement.sourceType,
    sourceId: movement.sourceId,
    reversed: reversedIds.has(movement.id),
    reversalOf: movement.reversalOf ?? undefined,
  };
}

export const stockRepository = {
  async findAll(): Promise<StockMovement[]> {
    const movements =
      await apiClient.get<ApiStockMovement[]>("/stock/movements");
    const reversedIds = new Set(
      movements.flatMap((movement) =>
        movement.reversalOf ? [movement.reversalOf] : [],
      ),
    );

    return movements.map((movement) => toMovement(movement, reversedIds));
  },

  async getPhysicalStock(): Promise<Product[]> {
    const rows = await apiClient.get<ApiStockRow[]>("/stock");
    return rows.map(toProduct);
  },

  async createAdjustment(input: StockAdjustmentInput): Promise<StockMovement> {
    const movement = await apiClient.post<ApiStockMovement>(
      "/stock/adjustments",
      input,
    );
    return toMovement(movement, new Set());
  },

  async reverseMovement(id: string, reason?: string): Promise<StockMovement> {
    const movement = await apiClient.post<ApiStockMovement>(
      `/stock/movements/${id}/reverse`,
      { reason: reason?.trim() || null },
    );
    return toMovement(movement, new Set());
  },

  getReservedFor(productId: string, source: Sale[] = []): number {
    return source
      .filter(
        (sale) => sale.status === "Confirmada" && sale.delivery === "Pendiente",
      )
      .flatMap((sale) => sale.items)
      .filter((item) => item.productId === productId)
      .reduce((sum, item) => sum + item.qty, 0);
  },

  getAvailableStock(product: Product, source: Sale[] = []): number {
    if (typeof product.availableStock === "number") {
      return product.availableStock;
    }

    return Math.max(0, product.stock - this.getReservedFor(product.id, source));
  },

  getStockValue(products: Product[]): number {
    return products.reduce(
      (sum, product) => sum + product.cost * product.stock,
      0,
    );
  },

  getStatus(product: Product): {
    label: string;
    tone: "success" | "warning" | "destructive" | "muted";
  } {
    const availableStock = this.getAvailableStock(product);

    if (availableStock <= 0) {
      return { label: "Sin stock", tone: "destructive" };
    }

    if (availableStock <= product.minStock) {
      return { label: "Bajo stock", tone: "warning" };
    }

    return { label: "OK", tone: "success" };
  },
};
