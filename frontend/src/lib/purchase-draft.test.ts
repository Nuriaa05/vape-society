import { describe, expect, it } from "vitest";

import {
  createEmptyPurchaseDraft,
  discardPurchaseDraft,
} from "./purchase-draft";

describe("purchase draft helpers", () => {
  it("starts purchases with an empty draft instead of preloading demo items", () => {
    expect(createEmptyPurchaseDraft()).toEqual({ supplierId: "", items: [] });
  });

  it("discarding a purchase draft leaves it empty", () => {
    expect(discardPurchaseDraft()).toEqual({ supplierId: "", items: [] });
  });
});
