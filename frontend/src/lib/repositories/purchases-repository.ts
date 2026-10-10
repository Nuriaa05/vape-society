import { apiClient, ApiError } from "@/lib/api-client";
import type { Purchase, PurchaseStatus } from "@/lib/contracts";
import { TZ } from "@/lib/formatters";
import { amountCentsToPesos, pesosToAmountCents } from "@/lib/money";

type ApiPurchase = {
  id: string;
  supplierId: string;
  supplier: {
    id: string;
    name: string;
  };
  date: string;
  status: PurchaseStatus;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    name: string;
    qty: number;
    unitCostAmountCents: number;
    lineTotalAmountCents: number;
  }>;
  totalAmountCents: number;
  cancelReason: string | null;
  cancelledAt: string | null;
};

export type SavePurchaseInput = {
  id?: string;
  supplierId: string;
  date: string;
  status?: PurchaseStatus;
  items: Array<{ productId: string; qty: number; cost: number }>;
};

function toPurchase(purchase: ApiPurchase): Purchase {
  return {
    id: purchase.id,
    supplierId: purchase.supplierId,
    date: purchase.date.slice(0, 10),
    items: purchase.items.map((item) => ({
      productId: item.productId,
      name: item.name || item.productName,
      qty: item.qty,
      cost: amountCentsToPesos(item.unitCostAmountCents),
    })),
    total: amountCentsToPesos(purchase.totalAmountCents),
    status: purchase.status,
    cancelReason: purchase.cancelReason ?? undefined,
  };
}

function toPayload(purchase: SavePurchaseInput) {
  return {
    supplierId: purchase.supplierId,
    date: purchase.date,
    status: purchase.status ?? "Pendiente",
    items: purchase.items.map((item) => ({
      productId: item.productId,
      qty: item.qty,
      unitCostAmountCents: pesosToAmountCents(item.cost),
    })),
  };
}

export const purchasesRepository = {
  async findAll(): Promise<Purchase[]> {
    const purchases = await apiClient.get<ApiPurchase[]>("/purchases");
    return purchases.map(toPurchase);
  },

  async findById(id: string): Promise<Purchase | undefined> {
    try {
      return toPurchase(await apiClient.get<ApiPurchase>(`/purchases/${id}`));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return undefined;
      }
      throw error;
    }
  },

  findBySupplierId(source: Purchase[], supplierId: string): Purchase[] {
    return source.filter((purchase) => purchase.supplierId === supplierId);
  },

  findByMonth(source: Purchase[], date: Date = new Date()): Purchase[] {
    const parts = new Intl.DateTimeFormat("es-AR", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(date);
    const byType = new Map(parts.map((part) => [part.type, part.value]));
    const month = byType.get("month")?.padStart(2, "0");
    const monthPrefix = `${byType.get("year")}-${month}-`;

    return source.filter((purchase) => purchase.date.startsWith(monthPrefix));
  },

  countBySupplier(source: Purchase[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const purchase of source) {
      counts[purchase.supplierId] = (counts[purchase.supplierId] ?? 0) + 1;
    }
    return counts;
  },

  getActiveTotal(source: Purchase[]): number {
    return source
      .filter((purchase) => purchase.status !== "Anulada")
      .reduce((sum, purchase) => sum + purchase.total, 0);
  },

  getActiveCount(source: Purchase[]): number {
    return source.filter((purchase) => purchase.status !== "Anulada").length;
  },

  async create(purchase: SavePurchaseInput): Promise<Purchase> {
    return toPurchase(
      await apiClient.post<ApiPurchase>("/purchases", toPayload(purchase)),
    );
  },

  async update(
    purchase: SavePurchaseInput & { id: string },
  ): Promise<Purchase> {
    const { status, ...payload } = toPayload(purchase);
    void status;
    return toPurchase(
      await apiClient.patch<ApiPurchase>(`/purchases/${purchase.id}`, payload),
    );
  },

  async register(id: string): Promise<Purchase> {
    return toPurchase(
      await apiClient.post<ApiPurchase>(`/purchases/${id}/register`),
    );
  },

  async cancel(id: string, reason?: string): Promise<Purchase> {
    return toPurchase(
      await apiClient.post<ApiPurchase>(`/purchases/${id}/cancel`, {
        reason: reason?.trim() || null,
      }),
    );
  },

  async deleteDraft(id: string): Promise<void> {
    await apiClient.delete(`/purchases/${id}`);
  },
};
