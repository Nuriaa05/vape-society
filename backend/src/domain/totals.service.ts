import { Injectable } from "@nestjs/common";

export type PricedSaleItem = {
  productId?: string | null;
  qty: number;
  unitPriceAmountCents: number;
};

export type SaleCouponAdjustment = {
  discountType: "Percentage" | "FixedAmount";
  discountBasisPoints?: number | null;
  discountAmountCents?: number | null;
};

export type SalePricingAdjustments = {
  coupon?: SaleCouponAdjustment | null;
  surchargeBasisPoints?: number;
  cashReceivedAmountCents?: number | null;
};

export type SaleTotals = {
  subtotalAmountCents: number;
  discountAmountCents: number;
  netAmountCents: number;
  surchargeAmountCents: number;
  totalAmountCents: number;
  cashReceivedAmountCents: number | null;
  changeAmountCents: number | null;
  cashShortfallAmountCents: number;
};

@Injectable()
export class TotalsService {
  calculateSaleTotals(
    items: PricedSaleItem[],
    adjustments: SalePricingAdjustments = {},
  ): SaleTotals {
    const subtotalAmountCents = items.reduce(
      (sum, item) => sum + item.qty * item.unitPriceAmountCents,
      0,
    );
    const coupon = adjustments.coupon;
    const requestedDiscountAmountCents =
      coupon?.discountType === "Percentage"
        ? Math.round(
            (subtotalAmountCents * (coupon.discountBasisPoints ?? 0)) / 10_000,
          )
        : (coupon?.discountAmountCents ?? 0);
    const discountAmountCents = Math.min(
      subtotalAmountCents,
      Math.max(0, requestedDiscountAmountCents),
    );
    const netAmountCents = subtotalAmountCents - discountAmountCents;
    const surchargeAmountCents = Math.round(
      (netAmountCents * (adjustments.surchargeBasisPoints ?? 0)) / 10_000,
    );
    const totalAmountCents = netAmountCents + surchargeAmountCents;
    const cashReceivedAmountCents =
      adjustments.cashReceivedAmountCents ?? null;
    const hasEnoughCash =
      cashReceivedAmountCents !== null &&
      cashReceivedAmountCents >= totalAmountCents;

    return {
      subtotalAmountCents,
      discountAmountCents,
      netAmountCents,
      surchargeAmountCents,
      totalAmountCents,
      cashReceivedAmountCents,
      changeAmountCents: hasEnoughCash
        ? cashReceivedAmountCents - totalAmountCents
        : null,
      cashShortfallAmountCents:
        cashReceivedAmountCents !== null && !hasEnoughCash
          ? totalAmountCents - cashReceivedAmountCents
          : 0,
    };
  }
}
