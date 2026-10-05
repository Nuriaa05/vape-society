import { apiClient } from "@/lib/api-client";
import type { Combo } from "@/lib/contracts";
import { amountCentsToPesos, pesosToAmountCents } from "@/lib/money";

type ApiCombo = {
  id: string;
  barcode: string | null;
  name: string;
  priceAmountCents: number;
  productsTotalAmountCents: number;
  discountAmountCents: number;
  archived: boolean;
  items: Array<{
    productId: string;
    productName: string;
    barcode: string | null;
    qty: number;
  }>;
};

export type ComboSaveInput = {
  id?: string;
  name: string;
  barcode?: string;
  price: number;
  items: Array<{ productId: string; qty: number }>;
};

export function toCombo(combo: ApiCombo): Combo {
  return {
    itemType: "Combo",
    id: combo.id,
    barcode: combo.barcode ?? "",
    name: combo.name,
    price: amountCentsToPesos(combo.priceAmountCents),
    productsTotal: amountCentsToPesos(combo.productsTotalAmountCents),
    discount: amountCentsToPesos(combo.discountAmountCents),
    archived: combo.archived,
    items: combo.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      barcode: item.barcode ?? "",
      qty: item.qty,
    })),
  };
}

function toPayload(combo: ComboSaveInput) {
  return {
    name: combo.name.trim(),
    barcode: combo.barcode?.trim() || null,
    priceAmountCents: pesosToAmountCents(combo.price),
    items: combo.items.map((item) => ({
      productId: item.productId,
      qty: item.qty,
    })),
  };
}

export const combosRepository = {
  async findAll(includeArchived = true): Promise<Combo[]> {
    const combos = await apiClient.get<ApiCombo[]>("/combos", {
      includeArchived,
    });
    return combos.map(toCombo);
  },

  async findActive(): Promise<Combo[]> {
    const combos = await apiClient.get<ApiCombo[]>("/combos");
    return combos.map(toCombo);
  },

  async save(combo: ComboSaveInput): Promise<Combo> {
    const payload = toPayload(combo);
    const saved = combo.id
      ? await apiClient.patch<ApiCombo>(`/combos/${combo.id}`, payload)
      : await apiClient.post<ApiCombo>("/combos", payload);

    return toCombo(saved);
  },

  async setArchived(id: string, archived: boolean): Promise<Combo> {
    return toCombo(
      await apiClient.patch<ApiCombo>(`/combos/${id}/archive`, { archived }),
    );
  },
};
