import { describe, expect, it } from "vitest";
import {
  resolveWholesaleSaleAttempt,
  releaseWholesaleSaleAttempt,
} from "./sale-wholesale-attempt";
const payload = {
  customerId: "c1",
  items: [{ itemType: "Combo" as const, itemId: "combo", qty: 3 }],
  deliveryStatus: "Pendiente" as const,
  expectedPricingFingerprint: "quote-original",
};
describe("sale operation after uncertain response", () => {
  it("retries the exact original payload after a new quote instead of creating another sale", () => {
    const original = resolveWholesaleSaleAttempt(
      { operationId: "operation-1", operationFingerprint: "" },
      payload,
      () => "new-operation",
    );
    const retry = resolveWholesaleSaleAttempt(
      original,
      {
        ...payload,
        expectedPricingFingerprint: "new-quote-after-price-change",
      },
      () => "duplicate-operation",
    );
    expect(retry.operationId).toBe("operation-1");
    expect(retry.payload).toEqual({ ...payload, operationId: "operation-1" });
  });
  it("normalizes key and cart ordering without changing the attempted payload", () => {
    const initial = {
      ...payload,
      customerName: "María",
      items: [
        { itemType: "Product" as const, itemId: "p1", qty: 2 },
        ...payload.items,
      ],
    };
    const previous = {
      operationId: "op1",
      operationFingerprint: JSON.stringify(initial),
    };
    const next = {
      items: [...initial.items].reverse(),
      customerName: "María",
      customerId: payload.customerId,
      deliveryStatus: payload.deliveryStatus,
      expectedPricingFingerprint: "new",
    };
    expect(
      resolveWholesaleSaleAttempt(previous, next, () => "op2").operationId,
    ).toBe("op1");
  });
  it("requires resolving the previous operation before accepting changed commercial intent", () => {
    const original = resolveWholesaleSaleAttempt(
      { operationId: "op1", operationFingerprint: JSON.stringify(payload) },
      { ...payload, customerId: "c2" },
      () => "op2",
    );
    expect(original.operationId).toBe("op1");
    expect(original.payload.customerId).toBe("c1");
  });
  it("releases the original attempt after an explicit PRICE_CHANGED rejection", () => {
    const previous = {
      operationId: "op1",
      operationFingerprint: JSON.stringify(payload),
    };
    const cleared = releaseWholesaleSaleAttempt(() => "op2");
    expect(cleared).toEqual({ operationId: "op2", operationFingerprint: "" });
    const next = resolveWholesaleSaleAttempt(cleared, {
      ...payload,
      expectedPricingFingerprint: "quote-reviewed",
    });
    expect(next.payload.expectedPricingFingerprint).toBe("quote-reviewed");
    expect(next.operationId).not.toBe(previous.operationId);
  });
});
