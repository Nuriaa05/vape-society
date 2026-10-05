import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildBrowserReceiptHtml,
  getPrinterSelectionValue,
  printReceiptBySaleId,
  saveReceiptPdfBySaleId,
  toPrinterSettingsPayload,
} from "./desktop-printer";

describe("desktop printer frontend helpers", () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    globalThis.fetch = originalFetch;
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

  it("keeps system dialog selected even when a recommended printer exists", () => {
    expect(
      getPrinterSelectionValue(
        { mode: "system-dialog", deviceName: null, paperWidthMm: 58 },
        [{ name: "TP-POS58-USB", displayName: "TP-POS58", recommended: true }],
      ),
    ).toBe("system-dialog");
  });

  it("keeps the selected device visible when the dialog is preconfigured", () => {
    expect(
      getPrinterSelectionValue(
        { mode: "system-dialog", deviceName: "TP-POS58-USB", paperWidthMm: 58 },
        [{ name: "TP-POS58-USB", displayName: "TP-POS58", recommended: true }],
      ),
    ).toBe("TP-POS58-USB");
  });

  it("serializes UI selections to explicit printer settings", () => {
    expect(toPrinterSettingsPayload("system-dialog")).toEqual({
      mode: "system-dialog",
      deviceName: null,
      paperWidthMm: 58,
    });
    expect(toPrinterSettingsPayload("TP-POS58-USB")).toEqual({
      mode: "system-dialog",
      deviceName: "TP-POS58-USB",
      paperWidthMm: 58,
    });
  });

  it("prints through the desktop bridge with saleId and source only", async () => {
    const printSaleReceipt = vi.fn().mockResolvedValue({ ok: true });

    await printReceiptBySaleId({
      saleId: "sale-1",
      source: "history",
      printerBridge: { printSaleReceipt },
    });

    expect(printSaleReceipt).toHaveBeenCalledWith({
      saleId: "sale-1",
      source: "history",
    });
  });

  it("saves the receipt PDF through the desktop bridge", async () => {
    const saveSaleReceiptPdf = vi.fn().mockResolvedValue({
      ok: true,
      filePath: "C:\\tmp\\comprobante-000001.pdf",
    });

    const result = await saveReceiptPdfBySaleId({
      saleId: "sale-1",
      source: "history",
      printerBridge: {
        printSaleReceipt: vi.fn(),
        saveSaleReceiptPdf,
      },
    });

    expect(saveSaleReceiptPdf).toHaveBeenCalledWith({
      saleId: "sale-1",
      source: "history",
    });
    expect(result).toEqual({
      ok: true,
      filePath: "C:\\tmp\\comprobante-000001.pdf",
    });
  });

  it("requires the desktop bridge to save a receipt PDF", async () => {
    await expect(
      saveReceiptPdfBySaleId({
        saleId: "sale-1",
        source: "history",
      }),
    ).rejects.toThrow("Guardar PDF está disponible en la aplicación desktop.");
  });

  it("prints a controlled receipt instead of the current app page when the desktop bridge is unavailable", async () => {
    const write = vi.fn();
    const closeDocument = vi.fn();
    const focus = vi.fn();
    const print = vi.fn();
    const closeWindow = vi.fn();
    const currentPagePrint = vi.fn();
    const open = vi.fn(() => ({
      document: {
        write,
        close: closeDocument,
      },
      focus,
      print,
      close: closeWindow,
    })) as unknown as typeof window.open;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        print: currentPagePrint,
        open,
      },
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          business: {
            name: "Lozano Congelados",
            address: "Av. Cabildo 2450",
            cuit: "30-12345678-9",
            phone: "",
          },
          receipt: {
            header: "LOZANO",
            footer: "Gracias por su compra",
          },
          sale: {
            id: "sale-1",
            number: "000009",
            date: "2026-06-30T06:58:00.000Z",
            deliveryStatus: "Entregado",
            payment: "Efectivo",
            couponCode: "VERANO10",
            surchargeBasisPoints: 250,
          },
          items: [
            {
              itemType: "Product",
              name: "Burga",
              qty: 1,
              lineTotalAmountCents: 1000000,
            },
          ],
          totals: {
            subtotalAmountCents: 1000000,
            discountAmountCents: 100000,
            netAmountCents: 900000,
            surchargeAmountCents: 22500,
            totalAmountCents: 922500,
            cashReceivedAmountCents: 1000000,
            changeAmountCents: 77500,
          },
          legend: "Comprobante interno",
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          comboTicketMode: "ComboLine",
        }),
      );

    await printReceiptBySaleId({
      saleId: "sale-1",
      source: "new-sale",
    });

    expect(currentPagePrint).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith("", "_blank", "width=360,height=720");
    expect(write).toHaveBeenCalledOnce();
    const html = String(write.mock.calls[0]?.[0]);
    expect(html).toContain("LOZANO");
    expect(html).toContain("000009");
    expect(html).toContain("1x Burga");
    expect(html).toContain("Subtotal");
    expect(html).toContain("Cupón VERANO10");
    expect(html).toContain("Recargo 2,5%");
    expect(html).toContain("Recibido");
    expect(html).toContain("Vuelto");
    const compactCurrencyHtml = html.replace(/\u00a0/g, "");
    expect(compactCurrencyHtml).toContain("$10.000");
    expect(compactCurrencyHtml).toContain("-$1.000");
    expect(compactCurrencyHtml).toContain("$225");
    expect(compactCurrencyHtml).toContain("$9.225");
    expect(compactCurrencyHtml).toContain("$775");
    expect(html).toContain(
      'Comprobante interno</div><div class="receipt-final-rule"',
    );
    expect(html).toMatch(
      /class="receipt-final-rule" aria-hidden="true">-{8,}<\/div><div class="receipt-bottom-feed"/,
    );
    expect(html).toContain('class="receipt-bottom-feed"');
    expect(html).toContain(".receipt-bottom-feed { height: 10mm;");
    expect(html).not.toContain("Nueva venta");
    expect(html).not.toContain("localhost:8080/nueva-venta");
    expect(print).toHaveBeenCalledOnce();
    expect(closeWindow).toHaveBeenCalledOnce();
  });

  it("omits received cash and change from electronic receipts", () => {
    const html = buildBrowserReceiptHtml(
      {
        business: { name: "Lozano", address: "", cuit: "", phone: "" },
        receipt: { header: "Lozano", footer: "" },
        sale: {
          id: "sale-card",
          number: "000010",
          date: "2026-06-30T06:58:00.000Z",
          deliveryStatus: "Entregado",
          payment: "Tarjeta Debito",
          couponCode: null,
          surchargeBasisPoints: 250,
        },
        items: [],
        totals: {
          subtotalAmountCents: 1000000,
          discountAmountCents: 0,
          netAmountCents: 1000000,
          surchargeAmountCents: 25000,
          totalAmountCents: 1025000,
          cashReceivedAmountCents: null,
          changeAmountCents: null,
        },
        legend: "Comprobante interno",
      },
      "ComboLine",
    );

    expect(html).not.toContain("Recibido");
    expect(html).not.toContain("Vuelto");
  });
});

function mockJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as Response;
}
