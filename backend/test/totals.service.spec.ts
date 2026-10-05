import { TotalsService } from "../src/domain/totals.service";

describe("TotalsService", () => {
  const service = new TotalsService();
  const items = [{ qty: 1, unitPriceAmountCents: 1_000_000 }];

  it("applies a percentage coupon before the payment surcharge", () => {
    expect(
      service.calculateSaleTotals(items, {
        coupon: {
          discountType: "Percentage",
          discountBasisPoints: 1_000,
        },
        surchargeBasisPoints: 250,
      }),
    ).toMatchObject({
      subtotalAmountCents: 1_000_000,
      discountAmountCents: 100_000,
      netAmountCents: 900_000,
      surchargeAmountCents: 22_500,
      totalAmountCents: 922_500,
    });
  });

  it("caps a fixed coupon at the subtotal", () => {
    expect(
      service.calculateSaleTotals(items, {
        coupon: {
          discountType: "FixedAmount",
          discountAmountCents: 2_000_000,
        },
        surchargeBasisPoints: 250,
      }),
    ).toMatchObject({
      discountAmountCents: 1_000_000,
      netAmountCents: 0,
      surchargeAmountCents: 0,
      totalAmountCents: 0,
    });
  });

  it("calculates cash change and shortfall in integer cents", () => {
    expect(
      service.calculateSaleTotals(
        [{ qty: 1, unitPriceAmountCents: 750_000 }],
        { cashReceivedAmountCents: 1_000_000 },
      ),
    ).toMatchObject({
      totalAmountCents: 750_000,
      changeAmountCents: 250_000,
      cashShortfallAmountCents: 0,
    });

    expect(
      service.calculateSaleTotals(
        [{ qty: 1, unitPriceAmountCents: 750_000 }],
        { cashReceivedAmountCents: 700_000 },
      ),
    ).toMatchObject({
      changeAmountCents: null,
      cashShortfallAmountCents: 50_000,
    });
  });
});
