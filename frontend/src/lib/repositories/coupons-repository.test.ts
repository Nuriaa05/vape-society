import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { couponsRepository } from "./coupons-repository";
import { salesRepository } from "./sales-repository";

const originalFetch = globalThis.fetch;

function jsonResponse(value: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("coupon and sale-pricing repositories", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("converts fixed coupon amounts between visible pesos and API cents", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const apiCoupon = {
      id: "coupon-1",
      code: "FIJO2500",
      discountType: "FixedAmount",
      discountBasisPoints: null,
      discountAmountCents: 250_050,
      enabled: true,
    };
    fetchMock
      .mockImplementationOnce(() => jsonResponse([apiCoupon]))
      .mockImplementationOnce(() => jsonResponse(apiCoupon, 201))
      .mockImplementationOnce(() => jsonResponse(apiCoupon));

    await expect(couponsRepository.findAll()).resolves.toEqual([
      expect.objectContaining({
        code: "FIJO2500",
        discountAmount: 2_500.5,
      }),
    ]);
    await couponsRepository.create({
      code: "FIJO2500",
      discountType: "FixedAmount",
      discountAmount: "$2.500,50",
      enabled: true,
    });
    await couponsRepository.update("coupon-1", {
      discountAmount: "$2.500,50",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:3002/api/coupons",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      code: "FIJO2500",
      discountType: "FixedAmount",
      discountAmountCents: 250_050,
      enabled: true,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:3002/api/coupons/coupon-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ discountAmountCents: 250_050 }),
      }),
    );
  });

  it("maps authoritative sale quotes without exposing raw cents", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementationOnce(() =>
      jsonResponse({
        couponId: "coupon-1",
        couponCode: "VERANO10",
        couponType: "Percentage",
        couponBasisPoints: 1_000,
        couponValueAmountCents: null,
        subtotalAmountCents: 1_000_000,
        discountAmountCents: 100_000,
        netAmountCents: 900_000,
        surchargeBasisPoints: 250,
        surchargeAmountCents: 22_500,
        totalAmountCents: 922_500,
        cashReceivedAmountCents: null,
        changeAmountCents: null,
        cashShortfallAmountCents: 0,
      }),
    );

    await expect(
      salesRepository.quote({
        paymentMethodId: "pm5",
        deliveryStatus: "Entregado",
        couponCode: "VERANO10",
        items: [{ itemType: "Product", itemId: "p1", qty: 1 }],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        subtotal: 10_000,
        discount: 1_000,
        net: 9_000,
        surchargeBasisPoints: 250,
        surcharge: 225,
        total: 9_225,
        couponCode: "VERANO10",
        cashReceived: null,
        change: null,
        cashShortfall: 0,
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3002/api/sales/quote",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          paymentMethodId: "pm5",
          deliveryStatus: "Entregado",
          couponCode: "VERANO10",
          items: [{ itemType: "Product", itemId: "p1", qty: 1 }],
        }),
      }),
    );
  });
});
