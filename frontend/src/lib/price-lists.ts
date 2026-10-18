import { parsePesosToAmountCents } from "./money";
export type PriceItemType = "Product" | "Combo";
export type PriceListTier = {
  minimumQty: number;
  prices: Array<{
    itemType: PriceItemType;
    itemId: string;
    priceAmountCents: number;
  }>;
};
export type PriceList = {
  id: string;
  name: string;
  isGeneral: boolean;
  active: boolean;
  tiers: PriceListTier[];
};
export type PricingLine = {
  itemType: PriceItemType;
  itemId: string;
  qty: number;
  basePriceAmountCents: number;
  appliedPriceAmountCents: number;
  origin: "Catalog" | "List";
  effectiveMinimumQty: number | null;
  components: Array<{ productId: string; qtyPerCombo: number }>;
};
export type PricingSnapshot = {
  listId: string;
  listName: string;
  countedUnits: number;
  globalMinimumQty: number | null;
  lines: PricingLine[];
  fingerprint: string;
};
export type PricingPreview = PricingSnapshot & { catalogPrices: PricingLine[] };
export type TierDraft = { minimumQty: string; cells: Record<string, string> };
export function effectiveDraftPrice(
  tiers: TierDraft[],
  itemKey: string,
  habitual: number,
  quantity: number,
): number | null {
  if (!Number.isSafeInteger(quantity) || quantity < 1) return null;
  const seen = new Set<number>();
  let price = habitual;
  try {
    for (const tier of [...tiers].sort(
      (a, b) => Number(a.minimumQty) - Number(b.minimumQty),
    )) {
      const minimum = Number(tier.minimumQty);
      if (!Number.isSafeInteger(minimum) || minimum < 1 || seen.has(minimum))
        return null;
      seen.add(minimum);
      const value = tier.cells[itemKey]?.trim();
      if (minimum <= quantity && value) {
        const cents = parsePesosToAmountCents(value);
        if (!Number.isSafeInteger(cents) || cents < 0) return null;
        price = cents / 100;
      }
    }
    return price;
  } catch {
    return null;
  }
}
export function serializePriceListTiers(tiers: TierDraft[]): PriceListTier[] {
  const seen = new Set<number>();
  return tiers
    .map((tier) => {
      const minimumQty = Number(tier.minimumQty);
      if (
        !Number.isSafeInteger(minimumQty) ||
        minimumQty < 1 ||
        seen.has(minimumQty)
      )
        throw new Error("Las escalas deben ser enteros positivos sin repetir.");
      seen.add(minimumQty);
      return {
        minimumQty,
        prices: Object.entries(tier.cells)
          .filter(([, value]) => value.trim() !== "")
          .map(([key, value]) => {
            const separator = key.indexOf(":");
            const itemType = key.slice(0, separator) as PriceItemType;
            const itemId = key.slice(separator + 1);
            const priceAmountCents = parsePesosToAmountCents(value);
            if (!Number.isSafeInteger(priceAmountCents) || priceAmountCents < 0)
              throw new Error("Ingresá precios válidos en pesos.");
            return { itemType, itemId, priceAmountCents };
          }),
      };
    })
    .sort((a, b) => a.minimumQty - b.minimumQty);
}
export function pricingContextLabel(
  snapshot?: Pick<
    PricingSnapshot,
    "listName" | "countedUnits" | "globalMinimumQty"
  > | null,
  plainLanguage = false,
): string {
  return snapshot
    ? `${snapshot.listName} · ${snapshot.countedUnits} unidades · ${snapshot.globalMinimumQty === null ? (plainLanguage ? "Precio habitual" : "Sin escala alcanzada") : `${plainLanguage ? "Precio desde" : "Desde"} ${snapshot.globalMinimumQty}`}`
    : "Lista no registrada";
}
