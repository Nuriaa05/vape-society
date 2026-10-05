export function calculateSalePriceFromMargin(
  cost: number,
  marginPct: number,
): number {
  if (!Number.isFinite(cost) || !Number.isFinite(marginPct) || cost <= 0) {
    return 0;
  }

  return Math.round((cost * (1 + marginPct / 100)) / 10) * 10;
}

export function calculateMarginPctFromSalePrice(
  cost: number,
  salePrice: number,
): number {
  if (!Number.isFinite(cost) || !Number.isFinite(salePrice) || cost <= 0) {
    return 0;
  }

  return Math.round(((salePrice - cost) / cost) * 100);
}
