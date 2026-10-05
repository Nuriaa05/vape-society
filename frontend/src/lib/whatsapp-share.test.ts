import { afterEach, describe, expect, it, vi } from "vitest";

import type { Combo, Product, Sale } from "@/lib/contracts";
import {
  buildCartWhatsAppMessage,
  buildSaleWhatsAppMessage,
  buildWhatsAppShareUrl,
  copyOrderText,
  shareOrderOnWhatsApp,
} from "./whatsapp-share";

const product = (overrides: Partial<Product> = {}): Product => ({
  itemType: "Product",
  id: "product-1",
  barcode: "",
  name: "Milanesas 1kg",
  category: "Milanesas",
  supplierId: "supplier-1",
  cost: 3000,
  marginPct: 50,
  price: 4500,
  stock: 10,
  minStock: 1,
  ...overrides,
});

const combo = (overrides: Partial<Combo> = {}): Combo => ({
  itemType: "Combo",
  id: "combo-1",
  barcode: "",
  name: "Combo familiar",
  price: 12000,
  productsTotal: 14500,
  discount: 2500,
  archived: false,
  items: [
    {
      productId: "product-1",
      productName: "Milanesas 1kg",
      barcode: "",
      qty: 1,
    },
  ],
  ...overrides,
});

describe("WhatsApp order sharing", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
    vi.restoreAllMocks();
  });

  it("builds a simple cart message with products and subtotal only", () => {
    const message = buildCartWhatsAppMessage([
      { product: product({ name: "Milanesas 1kg", price: 4500 }), qty: 1 },
      {
        product: product({ id: "product-2", name: "Soja 1kg", price: 3000 }),
        qty: 1,
      },
      {
        product: product({
          id: "product-3",
          name: "Pizza congelada",
          price: 7000,
        }),
        qty: 1,
      },
    ]);

    expect(message).toBe(
      [
        "Milanesas 1kg $4.500",
        "Soja 1kg $3.000",
        "Pizza congelada $7.000",
        "",
        "Subtotal: $14.500",
      ].join("\n"),
    );
  });

  it("prefixes quantities greater than one and totals each line", () => {
    expect(
      buildCartWhatsAppMessage([
        { product: product({ name: "Milanesas 1kg", price: 4500 }), qty: 2 },
      ]),
    ).toBe(["2x Milanesas 1kg $9.000", "", "Subtotal: $9.000"].join("\n"));
  });

  it("shares combos as a single line without component details", () => {
    const message = buildCartWhatsAppMessage([
      { product: combo({ name: "Combo familiar", price: 12000 }), qty: 1 },
    ]);

    expect(message).toBe(
      ["Combo familiar $12.000", "", "Subtotal: $12.000"].join("\n"),
    );
    expect(message).not.toContain("Milanesas");
  });

  it("builds the same simple message from persisted sales", () => {
    const sale: Sale = {
      id: "sale-1",
      number: "000123",
      date: "2026-06-30T12:00:00.000Z",
      items: [
        {
          itemType: "Product",
          productId: "product-1",
          name: "Milanesas 1kg",
          qty: 1,
          price: 4500,
        },
        {
          itemType: "Combo",
          productId: null,
          comboId: "combo-1",
          name: "Combo familiar",
          qty: 2,
          price: 12000,
          components: [
            {
              productId: "product-1",
              productName: "Milanesas 1kg",
              barcode: "",
              qty: 1,
            },
          ],
        },
      ],
      total: 28500,
      payment: "Efectivo",
      delivery: "Entregado",
      status: "Confirmada",
    };

    const message = buildSaleWhatsAppMessage(sale);

    expect(message).toBe(
      [
        "Milanesas 1kg $4.500",
        "2x Combo familiar $24.000",
        "",
        "Subtotal: $28.500",
      ].join("\n"),
    );
    expect(message).not.toContain("000123");
    expect(message).not.toContain("Efectivo");
    expect(message).not.toContain("Entregado");
    expect(message).not.toContain("30/06");
  });

  it("opens WhatsApp through the desktop bridge with text only", async () => {
    const openWhatsApp = vi.fn().mockResolvedValue({ ok: true });

    await shareOrderOnWhatsApp("Milanesas 1kg $4.500", {
      sharingBridge: { openWhatsApp },
    });

    expect(openWhatsApp).toHaveBeenCalledWith({ text: "Milanesas 1kg $4.500" });
  });

  it("falls back to wa.me in browser development", async () => {
    const open = vi.fn(() => ({ closed: false }));
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { open },
    });

    await shareOrderOnWhatsApp("Milanesas 1kg $4.500");

    expect(open).toHaveBeenCalledWith(
      buildWhatsAppShareUrl("Milanesas 1kg $4.500"),
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("copies the order text to the provided clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await copyOrderText("Milanesas 1kg $4.500", {
      clipboard: { writeText },
    });

    expect(writeText).toHaveBeenCalledWith("Milanesas 1kg $4.500");
  });

  it("requires clipboard support to copy the order text", async () => {
    await expect(copyOrderText("Milanesas 1kg $4.500")).rejects.toThrow(
      "No se pudo acceder al portapapeles.",
    );
  });
});
