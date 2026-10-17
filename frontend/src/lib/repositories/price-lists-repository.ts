import { apiClient } from "@/lib/api-client";
import type {
  PriceList,
  PriceListTier,
  PricingPreview,
  PriceItemType,
} from "@/lib/price-lists";
export const priceListsRepository = {
  findAll: (includeInactive = false) =>
    apiClient.get<PriceList[]>("/price-lists", { includeInactive }),
  findById: (id: string) => apiClient.get<PriceList>(`/price-lists/${id}`),
  create: (input: { name: string; tiers: PriceListTier[] }) =>
    apiClient.post<PriceList>("/price-lists", input),
  update: (
    id: string,
    input: { name?: string; active?: boolean; tiers?: PriceListTier[] },
  ) => apiClient.patch<PriceList>(`/price-lists/${id}`, input),
  duplicate: (id: string, name: string) =>
    apiClient.post<PriceList>(`/price-lists/${id}/duplicate`, { name }),
  preview: (input: {
    customerId?: string;
    items: Array<{ itemType: PriceItemType; itemId: string; qty: number }>;
    catalogItems?: Array<{ itemType: PriceItemType; itemId: string }>;
  }) => apiClient.post<PricingPreview>("/price-lists/preview", input),
};
