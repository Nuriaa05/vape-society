export type PurchaseDraftItem = {
  productId: string;
  qty: number;
  cost: string;
};

export type PurchaseDraft = {
  supplierId: string;
  items: PurchaseDraftItem[];
};

export function createEmptyPurchaseDraft(): PurchaseDraft {
  return {
    supplierId: "",
    items: [],
  };
}

export const discardPurchaseDraft = createEmptyPurchaseDraft;

export function formatPurchaseCostInput(cost: number): string {
  return new Intl.NumberFormat("es-AR", {
    useGrouping: false,
    maximumFractionDigits: 2,
  }).format(cost);
}
