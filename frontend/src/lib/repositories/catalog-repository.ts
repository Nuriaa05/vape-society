import { apiClient, ApiError } from "@/lib/api-client";
import type { Combo, Product } from "@/lib/contracts";
import { toCombo } from "@/lib/repositories/combos-repository";
import { toProduct } from "@/lib/repositories/products-repository";

type CatalogBarcodeResponse =
  | { itemType: "Product"; item: Parameters<typeof toProduct>[0] }
  | { itemType: "Combo"; item: Parameters<typeof toCombo>[0] };

export const catalogRepository = {
  async findByBarcode(
    barcode: string,
  ): Promise<
    | { itemType: "Product"; item: Product }
    | { itemType: "Combo"; item: Combo }
    | undefined
  > {
    try {
      const response = await apiClient.get<CatalogBarcodeResponse>(
        `/catalog/barcode/${encodeURIComponent(barcode.trim())}`,
      );

      return response.itemType === "Product"
        ? { itemType: "Product", item: toProduct(response.item) }
        : { itemType: "Combo", item: toCombo(response.item) };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return undefined;
      }

      throw error;
    }
  },
};
