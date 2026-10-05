import { describe, expect, it } from "vitest";

import {
  RECEIPT_FINAL_RULE,
  buildReceiptHeaderLines,
  getReceiptFooter,
} from "./receipt-view";

describe("receipt view helpers", () => {
  it("renders receipt header from settings instead of fixed demo text", () => {
    expect(
      buildReceiptHeaderLines({
        business: {
          name: "Mi Local",
          address: "San Martín 123",
          cuit: "20-11111111-1",
          phone: "11-2222-3333",
        },
        receipt: {
          header: "CONGELADOS DEL BARRIO",
          footer: "Gracias por elegirnos",
        },
      }),
    ).toEqual([
      "CONGELADOS DEL BARRIO",
      "San Martín 123",
      "CUIT 20-11111111-1",
      "Tel. 11-2222-3333",
    ]);
  });

  it("uses the configured receipt footer when present", () => {
    expect(getReceiptFooter({ header: "", footer: "Vuelva pronto" })).toBe(
      "Vuelva pronto",
    );
  });

  it("exposes the final divider shown before the bottom feed", () => {
    expect(RECEIPT_FINAL_RULE).toBe("--------------------");
  });
});
