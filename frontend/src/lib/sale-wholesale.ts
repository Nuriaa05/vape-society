import type { PricingLine } from "./price-lists";
export function getResolvedItemPrice(
  lines: PricingLine[] | undefined,
  type: "Product" | "Combo",
  id: string,
): { price: number; habitualPrice: number } | null {
  const line = lines?.find(
    (item) => item.itemType === type && item.itemId === id,
  );
  return line
    ? {
        price: line.appliedPriceAmountCents / 100,
        habitualPrice: line.basePriceAmountCents / 100,
      }
    : null;
}
export function hasCurrentPricing(query: {
  data?: { fingerprint: string };
  isFetching: boolean;
  isPlaceholderData: boolean;
  isError: boolean;
}): boolean {
  return (
    Boolean(query.data?.fingerprint) &&
    !query.isFetching &&
    !query.isPlaceholderData &&
    !query.isError
  );
}
