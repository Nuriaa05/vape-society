import { describe, expect, it } from "vitest";
import {
  createFinanceMoneyDraft,
  editFinanceMoneyDraft,
  removeFinanceSettlement,
} from "./sale-finance-input";
import { resolveSaleOperationId } from "./sale-checkout";
import { canConfirmQuotedSale } from "./sale-cart";

describe("finance amount editing regressions", () => {
  it("keeps the committed operation after an unchanged amount edit or blur", () => {
    const previous = { upfrontAmountCents: 12345 };
    const displayed = createFinanceMoneyDraft(previous.upfrontAmountCents);
    const edited = editFinanceMoneyDraft(displayed.raw);
    expect(edited.valid).toBe(true);
    if (!edited.valid) throw new Error("Expected a valid unchanged input");
    const fingerprint = JSON.stringify(previous);
    const afterEdit = JSON.stringify({ upfrontAmountCents: edited.cents });
    expect(
      resolveSaleOperationId(
        fingerprint,
        afterEdit,
        "committed-operation",
        () => "duplicate-operation",
      ),
    ).toBe("committed-operation");
    expect(
      resolveSaleOperationId(
        fingerprint,
        JSON.stringify({ upfrontAmountCents: edited.cents + 1 }),
        "committed-operation",
        () => "changed-operation",
      ),
    ).toBe("changed-operation");
  });

  it("retains the second settlement identity and visible cents when the first is removed", () => {
    const first = {
      dueDate: "2026-11-01",
      grossAmountCents: 10000,
      feeAmountCents: 100,
    };
    const second = {
      dueDate: "2026-12-01",
      grossAmountCents: 20000,
      feeAmountCents: 250,
    };
    const remaining = removeFinanceSettlement(
      [first, second],
      ["row-a", "row-b"],
      0,
    );
    expect(remaining.keys).toEqual(["row-b"]);
    expect(remaining.settlements).toEqual([second]);
    expect(
      createFinanceMoneyDraft(remaining.settlements[0].grossAmountCents).raw,
    ).toBe("200");
    expect(
      createFinanceMoneyDraft(remaining.settlements[0].feeAmountCents).raw,
    ).toBe("2,5");
  });

  it.each(["abc", "100,999", "-10", "9007199254740993"])(
    "blocks a previously valid quote while raw input is invalid: %s",
    (raw) => {
      const edited = editFinanceMoneyDraft(raw);
      expect(edited).toEqual({ raw, valid: false });
      expect(
        canConfirmQuotedSale({
          hasLines: true,
          hasPaymentMethod: true,
          quotePending: false,
          quoteError: false,
          quoteAvailable: edited.valid,
          cashShortfall: 0,
        }),
      ).toBe(false);
      const corrected = editFinanceMoneyDraft("100,99");
      expect(corrected).toEqual({ raw: "100,99", valid: true, cents: 10099 });
      expect(
        canConfirmQuotedSale({
          hasLines: true,
          hasPaymentMethod: true,
          quotePending: false,
          quoteError: false,
          quoteAvailable: corrected.valid,
          cashShortfall: 0,
        }),
      ).toBe(true);
    },
  );
});
