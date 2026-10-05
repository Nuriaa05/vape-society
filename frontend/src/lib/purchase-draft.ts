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
