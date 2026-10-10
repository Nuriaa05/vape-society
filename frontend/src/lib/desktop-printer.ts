import { getApiBaseUrl } from "@/lib/api-client";
import { basisPointsToPercentInput } from "@/lib/payment-pricing";
import {
  buildReceiptHeaderLines,
  RECEIPT_FINAL_RULE,
} from "@/lib/receipt-view";

export type PrinterMode = "system-dialog" | "silent";
export type PrintSource = "new-sale" | "history";

export type PrinterSettings = {
  mode: PrinterMode;
  deviceName: string | null;
  paperWidthMm: 58;
};

export type PrinterSummary = {
  name: string;
  displayName?: string;
  recommended?: boolean;
};

export type PrinterBridge = {
  printSaleReceipt: (request: {
    saleId: string;
    source: PrintSource;
  }) => Promise<{ ok: true }>;
  saveSaleReceiptPdf?: (request: {
    saleId: string;
    source: PrintSource;
  }) => Promise<SaveReceiptPdfResult>;
};

export type SaveReceiptPdfResult =
  | {
      ok: true;
      filePath: string;
    }
  | {
      ok: false;
      canceled: true;
    };

type SaleReceiptItem = {
  itemType?: "Product" | "Combo";
  productName?: string;
  name: string;
  qty: number;
  lineTotalAmountCents: number;
  components?: Array<{
    productName?: string;
    name?: string;
    qty: number;
  }>;
};

export type SaleReceiptResponse = {
  business: {
    name: string;
    address: string;
    cuit: string;
    phone: string;
  };
  receipt: {
    header: string;
    footer: string;
  };
  sale: {
    id: string;
    number: string;
    date: string;
    deliveryStatus: string;
    payment: string;
    couponCode: string | null;
    surchargeBasisPoints: number;
  };
  items: SaleReceiptItem[];
  totals: {
    subtotalAmountCents: number;
    discountAmountCents: number;
    netAmountCents: number;
    surchargeAmountCents: number;
    totalAmountCents: number;
    cashReceivedAmountCents: number | null;
    changeAmountCents: number | null;
  };
  legend: string;
};

type ApiSettingsResponse = {
  comboTicketMode?: "ComboLine" | "ComboWithComponents";
};

export const SYSTEM_DIALOG_SELECTION = "system-dialog";

export function getPrinterSelectionValue(
  settings: PrinterSettings | undefined,
  _printers: PrinterSummary[],
): string {
  if (!settings) {
    return SYSTEM_DIALOG_SELECTION;
  }

  return settings.deviceName?.trim() || SYSTEM_DIALOG_SELECTION;
}

export function toPrinterSettingsPayload(selection: string): PrinterSettings {
  if (selection === SYSTEM_DIALOG_SELECTION || !selection.trim()) {
    return {
      mode: "system-dialog",
      deviceName: null,
      paperWidthMm: 58,
    };
  }

  return {
    mode: "system-dialog",
    deviceName: selection.trim(),
    paperWidthMm: 58,
  };
}

export async function printReceiptBySaleId({
  saleId,
  source,
  printerBridge,
}: {
  saleId: string;
  source: PrintSource;
  printerBridge?: PrinterBridge;
}): Promise<void> {
  if (!saleId.trim()) {
    throw new Error("No hay comprobante para imprimir.");
  }

  if (printerBridge) {
    await printerBridge.printSaleReceipt({ saleId: saleId.trim(), source });
    return;
  }

  await printReceiptInBrowser(saleId.trim());
}

export async function saveReceiptPdfBySaleId({
  saleId,
  source,
  printerBridge,
}: {
  saleId: string;
  source: PrintSource;
  printerBridge?: PrinterBridge;
}): Promise<SaveReceiptPdfResult> {
  if (!saleId.trim()) {
    throw new Error("No hay comprobante para guardar.");
  }

  if (!printerBridge?.saveSaleReceiptPdf) {
    throw new Error("Guardar PDF está disponible en la aplicación desktop.");
  }

  return printerBridge.saveSaleReceiptPdf({ saleId: saleId.trim(), source });
}

async function printReceiptInBrowser(saleId: string): Promise<void> {
  const apiBaseUrl = getApiBaseUrl();
  const [receipt, settings] = await Promise.all([
    fetchJson<SaleReceiptResponse>(
      `${apiBaseUrl}/sales/${encodeURIComponent(saleId)}/receipt`,
    ),
    fetchJson<ApiSettingsResponse>(`${apiBaseUrl}/settings`).catch(
      (): ApiSettingsResponse => ({}),
    ),
  ]);
  const printWindow = window.open("", "_blank", "width=360,height=720");

  if (!printWindow) {
    throw new Error("No se pudo abrir la vista de impresión del comprobante.");
  }

  printWindow.document.write(
    buildBrowserReceiptHtml(receipt, settings.comboTicketMode ?? "ComboLine"),
  );
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al consultar ${url}`);
  }

  return response.json() as Promise<T>;
}

export function buildBrowserReceiptHtml(
  receipt: SaleReceiptResponse,
  comboTicketMode: "ComboLine" | "ComboWithComponents",
): string {
  const lines = [
    ...buildReceiptHeaderLines(receipt).map(
      (line, index) =>
        `<div class="${index === 0 ? "center strong" : "center"}">${escapeHtml(line)}</div>`,
    ),
    `<hr />`,
    row("Comp.", receipt.sale.number),
    row("Fecha", formatTicketDate(receipt.sale.date)),
    row("Entrega", receipt.sale.deliveryStatus),
    `<hr />`,
    ...receipt.items.flatMap((item) => renderItemLines(item, comboTicketMode)),
    `<hr />`,
    ...renderPricingLines(receipt),
    row(
      "TOTAL",
      formatAmountCentsAsARS(receipt.totals.totalAmountCents),
      "strong",
    ),
    row("Pago", receipt.sale.payment),
    ...renderCashLines(receipt),
    `<div class="center footer">${escapeHtml(receipt.receipt.footer)}</div>`,
    `<div class="center legend">${escapeHtml(receipt.legend)}</div>`,
    `<div class="receipt-final-rule" aria-hidden="true">${RECEIPT_FINAL_RULE}</div>`,
    `<div class="receipt-bottom-feed" aria-hidden="true">&nbsp;</div>`,
  ].filter(Boolean);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Comprobante ${escapeHtml(receipt.sale.number)}</title>
    <style>
      @page { size: 58mm auto; margin: 0; }
      html, body { margin: 0; padding: 0; }
      body { width: 42mm; margin: 0 auto; padding-top: 12mm; padding-bottom: 0; box-sizing: border-box; font-family: Consolas, monospace; font-size: 9px; color: #111; }
      hr { border: 0; border-top: 1px dashed #999; margin: 5px 0; }
      .center { text-align: center; }
      .row { display: flex; justify-content: space-between; gap: 5px; }
      .row span:first-child { min-width: 0; overflow: hidden; }
      .row span:last-child { text-align: right; white-space: nowrap; }
      .strong { font-weight: 700; }
      .component { padding-left: 8px; color: #444; }
      .footer { margin-top: 7px; }
      .legend { margin-top: 4px; font-size: 9px; color: #444; }
      .receipt-final-rule { margin-top: 5px; text-align: center; color: #999; }
      .receipt-bottom-feed { height: 10mm; line-height: 10mm; display: block; font-size: 0; }
    </style>
  </head>
  <body>${lines.join("")}</body>
</html>`;
}

function renderPricingLines(receipt: SaleReceiptResponse): string[] {
  const lines: string[] = [];

  if (
    receipt.totals.discountAmountCents > 0 ||
    receipt.totals.surchargeAmountCents > 0
  ) {
    lines.push(
      row(
        "Subtotal",
        formatAmountCentsAsARS(receipt.totals.subtotalAmountCents),
      ),
    );
  }

  if (receipt.totals.discountAmountCents > 0) {
    lines.push(
      row(
        receipt.sale.couponCode
          ? `Cupón ${receipt.sale.couponCode}`
          : "Descuento",
        formatAmountCentsAsARS(-receipt.totals.discountAmountCents),
      ),
    );
  }

  if (receipt.totals.surchargeAmountCents > 0) {
    lines.push(
      row(
        `Recargo ${basisPointsToPercentInput(receipt.sale.surchargeBasisPoints)}%`,
        formatAmountCentsAsARS(receipt.totals.surchargeAmountCents),
      ),
    );
  }

  return lines;
}

function renderCashLines(receipt: SaleReceiptResponse): string[] {
  const { cashReceivedAmountCents, changeAmountCents } = receipt.totals;
  if (cashReceivedAmountCents === null || changeAmountCents === null) {
    return [];
  }

  return [
    row("Recibido", formatAmountCentsAsARS(cashReceivedAmountCents)),
    row("Vuelto", formatAmountCentsAsARS(changeAmountCents)),
  ];
}

function renderItemLines(
  item: SaleReceiptItem,
  comboTicketMode: "ComboLine" | "ComboWithComponents",
): string[] {
  const name = item.name || item.productName || "Item";
  const lines = [
    row(
      `${item.qty}x ${name}`,
      formatAmountCentsAsARS(item.lineTotalAmountCents),
    ),
  ];

  if (item.itemType === "Combo" && comboTicketMode === "ComboWithComponents") {
    lines.push(
      ...(item.components ?? []).map(
        (component) =>
          `<div class="component">${escapeHtml(`${component.qty}x ${component.productName ?? component.name ?? "Producto"}`)}</div>`,
      ),
    );
  }

  return lines;
}

function row(label: string, value: string, className = ""): string {
  return `<div class="row ${className}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

function formatTicketDate(value: string): string {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return `${byType.get("day")}/${byType.get("month")}/${byType.get("year")} ${byType.get("hour")}:${byType.get("minute")}`;
}

function formatAmountCentsAsARS(amountCents: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
