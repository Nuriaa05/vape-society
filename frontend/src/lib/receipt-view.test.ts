import { describe, expect, it } from "vitest";

import {
  RECEIPT_FINAL_RULE,
  buildReceiptHeaderLines,
  getReceiptFooter,
} from "./receipt-view";

describe("receipt view helpers", () => {
  it("renders only the local name and contact details, ignoring saved additional text", () => {
    expect(
      buildReceiptHeaderLines({
        business: {
          name: "Mi Local",
          address: "San Martín 123",
          cuit: "20-11111111-1",
          phone: "11-2222-3333",
        },
        receipt: {
          header: "Pods y accesorios",
          footer: "Gracias por elegirnos",
        },
      }),
    ).toEqual([
      "Mi Local",
      "San Martín 123",
      "CUIT 20-11111111-1",
      "Tel. 11-2222-3333",
    ]);
  });

  it("updates the local name even when an obsolete header is saved", () => {
    const settings = {
      business: { name: "Vape Society", address: "", cuit: "", phone: "" },
      receipt: { header: "Gracias por elegirnos", footer: "" },
    };

    expect(buildReceiptHeaderLines(settings)).toEqual(["Vape Society"]);
    expect(
      buildReceiptHeaderLines({
        ...settings,
        business: { ...settings.business, name: "Vape Society Centro" },
      }),
    ).toEqual(["Vape Society Centro"]);
  });

  it.each(["Vape Society", "  VAPE SOCIETY  "])(
    "does not repeat the local name from a legacy header: %s",
    (header) => {
      expect(
        buildReceiptHeaderLines({
          business: { name: "Vape Society", address: "", cuit: "", phone: "" },
          receipt: { header, footer: "" },
        }),
      ).toEqual(["Vape Society"]);
    },
  );

  it.each(["", "   "])(
    "keeps the automatic name with an empty legacy header: %j",
    (header) => {
      expect(
        buildReceiptHeaderLines({
          business: { name: "Vape Society", address: "", cuit: "", phone: "" },
          receipt: { header, footer: "" },
        }),
      ).toEqual(["Vape Society"]);
    },
  );

  it("uses the configured receipt footer when present", () => {
    expect(getReceiptFooter({ header: "", footer: "Vuelva pronto" })).toBe(
      "Vuelva pronto",
    );
  });

  it("exposes the final divider shown before the bottom feed", () => {
    expect(RECEIPT_FINAL_RULE).toBe("--------------------");
  });
});
