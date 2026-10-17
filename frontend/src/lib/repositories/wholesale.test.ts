import { afterEach, describe, expect, it, vi } from "vitest";
import { salesRepository } from "./sales-repository";
import { priceListsRepository } from "./price-lists-repository";
import { collectionsRepository } from "./collections-repository";
import {
  buildBrowserReceiptHtml,
  type SaleReceiptResponse,
} from "../desktop-printer";
const snapshot = {
  listId: "custom",
  listName: "Original <lista>",
  countedUnits: 6,
  globalMinimumQty: 5,
  fingerprint: "hash",
  lines: [],
};
describe("wholesale API and immutable receipt", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(["custom-list", null])(
    "assigns %s without sending personal or financial fields",
    async (priceListId) => {
      const customer = {
        id: "c1",
        name: "Cliente existente",
        phone: "3624000999",
        notes: "Conservar datos",
        priceListId,
      };
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json(customer)),
      );
      const result = await collectionsRepository.assignPriceList(
        "c1",
        priceListId,
      );
      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(new URL(String(url)).pathname).toBe("/api/customers/c1");
      expect(options?.method).toBe("PATCH");
      expect(JSON.parse(String(options?.body))).toEqual({ priceListId });
      expect(result).toEqual(customer);
    },
  );
  it("sends empty cart and lookup only catalog rows with customer to preview", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ ...snapshot, catalogPrices: [] })),
    );
    await priceListsRepository.preview({
      customerId: "c1",
      items: [],
      catalogItems: [{ itemType: "Combo", itemId: "combo1" }],
    });
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual(
      {
        customerId: "c1",
        items: [],
        catalogItems: [{ itemType: "Combo", itemId: "combo1" }],
      },
    );
  });
  it("keeps the original snapshot and expected quote fingerprint during creation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          id: "s1",
          number: "1",
          date: "2026-10-16",
          items: [],
          totalAmountCents: 1200,
          pricingSnapshot: snapshot,
          deliveryStatus: "Pendiente",
          status: "Confirmada",
          payment: "Efectivo",
        }),
      ),
    );
    const sale = await salesRepository.create({
      customerId: "c1",
      expectedPricingFingerprint: "full-quote",
      items: [],
      deliveryStatus: "Pendiente",
    });
    expect(sale.pricingSnapshot).toEqual(snapshot);
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))
        .expectedPricingFingerprint,
    ).toBe("full-quote");
  });
  it("prints historical list and scale, escapes names and keeps authoritative charged total", () => {
    const receipt = {
      business: { name: "Society", address: "", cuit: "", phone: "" },
      receipt: { header: "", footer: "" },
      sale: {
        id: "s",
        number: "1",
        date: "2026-10-16T12:00:00Z",
        deliveryStatus: "Pendiente",
        payment: "Efectivo",
        pricingSnapshot: snapshot,
        couponCode: null,
        surchargeBasisPoints: 0,
      },
      items: [{ name: "Combo", qty: 1, lineTotalAmountCents: 1200 }],
      totals: {
        subtotalAmountCents: 1200,
        discountAmountCents: 0,
        netAmountCents: 1200,
        surchargeAmountCents: 0,
        totalAmountCents: 1200,
        cashReceivedAmountCents: null,
        changeAmountCents: null,
      },
      legend: "",
    } as SaleReceiptResponse;
    const html = buildBrowserReceiptHtml(receipt, "ComboLine");
    expect(html).toContain("Original &lt;lista&gt; · 6 unidades · Desde 5");
    expect(html).toContain("TOTAL");
    const legacy = buildBrowserReceiptHtml(
      { ...receipt, sale: { ...receipt.sale, pricingSnapshot: null } },
      "ComboLine",
    );
    expect(legacy).toContain("Lista no registrada");
  });
});
