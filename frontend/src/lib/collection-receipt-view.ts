import type { FinancialReceipt } from "./collections";
import { money } from "./collections-form";
import { formatDateAR, formatDateTimeAR } from "./formatters";
import {
  buildReceiptHeaderLines,
  INTERNAL_RECEIPT_LEGEND,
} from "./receipt-view";

type ReceiptOptions = {
  refund?: boolean;
  issuedAt?: string;
  balance?: { amountCents: number; asOf: string };
};
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
const dateOnly = (value: string) => formatDateAR(`${value}T12:00:00Z`);
const detail = (label: string, value: string) =>
  `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;

export function buildCollectionReceiptHtml(
  receipt: FinancialReceipt,
  {
    refund = false,
    issuedAt = new Date().toISOString(),
    balance,
  }: ReceiptOptions = {},
): string {
  const entry = refund ? receipt.refund : receipt.collection;
  if (!entry) throw new Error("No se encontró el movimiento del comprobante.");
  const title = refund
    ? "Comprobante interno de reintegro"
    : "Comprobante interno de cobro";
  const business = receipt.business ?? {
    name: "Comercio",
    address: "",
    cuit: "",
    phone: "",
  };
  const settings = receipt.receipt ?? { header: "", footer: "" };
  const header = buildReceiptHeaderLines({ business, receipt: settings });
  const legend = receipt.legend || INTERNAL_RECEIPT_LEGEND;
  const comparable = (value: string) =>
    value.toLocaleLowerCase("es").replace(/[\s.,·]/g, "");
  const footer =
    comparable(settings.footer) === comparable(legend)
      ? ""
      : settings.footer.trim();
  const cashChange = !refund && (entry.changeAmountCents ?? 0) > 0;
  const cancelled = (entry.cancellations ?? []).reduce(
    (sum, item) => sum + item.grossAmountCents,
    0,
  );
  const allocations = receipt.allocations ?? [];
  const state = entry.reversedAt
    ? `${refund ? "REINTEGRO" : "COBRO"} REVERTIDO`
    : "";

  return `<!doctype html>
<html lang="es-AR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; padding: 24px; background: #f4f4f5; color: #18181b; font: 14px/1.5 Arial, sans-serif; }
button { font: inherit; cursor: pointer; border: 1px solid #d4d4d8; border-radius: 6px; padding: 8px 12px; background: white; color: #18181b; }
button:focus-visible { outline: 2px solid #4338ca; outline-offset: 2px; }
button[aria-pressed="true"] { border-color: #18181b; background: #18181b; color: white; }
.toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; max-width: 210mm; margin: 0 auto 16px; }
.toolbar-group { display: flex; flex-wrap: wrap; gap: 6px; }
.print-button { background: #4338ca; border-color: #4338ca; color: white; }
.sheet { width: 210mm; max-width: 100%; margin: 0 auto; padding: 12mm; background: white; box-shadow: 0 4px 20px #0000000d; overflow-wrap: anywhere; }
.business-header { padding-bottom: 12px; border-bottom: 2px solid #18181b; }
.business-name { font-size: 24px; font-weight: 700; line-height: 1.2; margin-bottom: 6px; }
.business-details, .reference { font-size: 12px; }
.reference { margin-top: 6px; font-size: 10px; }
h1 { margin: 14px 0 12px; font-size: 21px; line-height: 1.25; }
h2 { margin: 0 0 10px; font-size: 14px; }
p { margin: 0; }
.meta { display: grid; gap: 4px; margin: 0 0 12px; }
.meta > div { display: flex; align-items: baseline; gap: 8px; }
dt { color: #52525b; font-size: 12px; }
dd { margin: 0; font-weight: 600; }
.amount { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid #d4d4d8; border-bottom: 1px solid #d4d4d8; margin-bottom: 12px; }
.amount strong { flex-shrink: 0; white-space: nowrap; font-size: 30px; line-height: 1.2; font-variant-numeric: tabular-nums; }
.details { margin-bottom: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { color: #52525b; font-size: 11px; font-weight: 400; text-align: left; padding: 0 8px 8px 0; border-bottom: 1px solid #d4d4d8; }
td { padding: 6px 8px 6px 0; border-bottom: 1px solid #e4e4e7; vertical-align: top; }
td:last-child, th:last-child { text-align: right; padding-right: 0; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cash { display: grid; gap: 4px; margin: 0 0 12px; }
.cash > div { display: flex; justify-content: space-between; gap: 16px; }
.cash dd { flex-shrink: 0; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
.balance { padding: 10px 0 0; border-top: 2px solid #18181b; }
.balance-row { display: flex; justify-content: space-between; gap: 12px; font-size: 16px; }
.balance strong { flex-shrink: 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
.balance-note, .issued { font-size: 11px; color: #52525b; margin-top: 4px; }
.reversed { border: 2px solid #18181b; padding: 12px; margin: 16px 0; }
.reversed strong { display: block; }
.reason { white-space: pre-line; margin: 0 0 12px; }
footer { margin-top: 12px; padding-top: 8px; border-top: 1px dashed #a1a1aa; text-align: center; font-size: 11px; }
.footer-text { white-space: pre-line; margin-bottom: 4px; }
.legend { color: #52525b; }
body[data-paper="ticket"] .sheet { width: 58mm; max-width: 100%; padding: 4mm; font-size: 11px; }
body[data-paper="ticket"] .business-header { text-align: center; padding-bottom: 6px; border-bottom-style: dashed; border-bottom-width: 1px; }
body[data-paper="ticket"] .business-name { font-size: 17px; }
body[data-paper="ticket"] .business-details { font-size: 10px; }
body[data-paper="ticket"] .reference { font-size: 9px; }
body[data-paper="ticket"] h1 { font-size: 14px; text-align: center; margin: 8px 0; }
body[data-paper="ticket"] h2 { font-size: 11px; }
body[data-paper="ticket"] .meta { gap: 3px; margin-bottom: 8px; }
body[data-paper="ticket"] .meta > div { gap: 4px; }
body[data-paper="ticket"] dt { font-size: 10px; }
body[data-paper="ticket"] .amount { gap: 6px; margin-bottom: 8px; padding: 8px 0; }
body[data-paper="ticket"] .amount strong { font-size: 22px; }
body[data-paper="ticket"] table { font-size: 10px; }
body[data-paper="ticket"] th { font-size: 9px; }
body[data-paper="ticket"] .details, body[data-paper="ticket"] .cash { margin-bottom: 8px; }
body[data-paper="ticket"] .cash > div { gap: 6px; }
body[data-paper="ticket"] .balance-row { font-size: 12px; }
body[data-paper="ticket"] .balance strong { font-size: 16px; }
body[data-paper="ticket"] .balance-note, body[data-paper="ticket"] .issued, body[data-paper="ticket"] footer { font-size: 9px; }
@media screen and (max-width: 640px) { body { padding: 12px; } .sheet { padding: 20px; } .amount strong { font-size: 26px; } }
@media print { body { padding: 0; margin: 0; background: white; } .toolbar { display: none; } .sheet { width: auto; max-width: none; padding: 0; margin: 0; box-shadow: none; } .amount, .balance, footer, tr, .reversed { break-inside: avoid; } thead { display: table-header-group; } }
</style>
<style id="paper-style">@page { size: A4 portrait; margin: 12mm; }</style>
</head><body data-paper="a4">
<nav class="toolbar" aria-label="Opciones de impresión">
<div class="toolbar-group" role="group" aria-label="Formato de papel"><button type="button" data-format="a4" aria-pressed="true">Hoja A4</button><button type="button" data-format="ticket" aria-pressed="false">Ticket 58 mm</button></div>
<div class="toolbar-group"><button type="button" class="print-button" id="print-receipt">Imprimir o guardar PDF</button><button type="button" id="close-receipt">Cerrar</button></div>
</nav>
<main class="sheet">
<header class="business-header"><div><div class="business-name">${escapeHtml(header[0])}</div><div class="business-details">${header
    .slice(1)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("")}</div></div></header>
<h1>${refund ? "Recibo de reintegro" : "Recibo de pago"}</h1>
${state ? `<section class="reversed"><strong>${state}</strong>${entry.reversalReason ? `<p>${escapeHtml(entry.reversalReason)}</p>` : ""}</section>` : ""}
<dl class="meta">${detail("Cliente", entry.customerName || "Consumidor final")}${detail("Fecha", dateOnly(entry.date))}${entry.paymentMethodName ? detail("Medio", entry.paymentMethodName) : ""}</dl>
<div class="amount"><span>${entry.reversedAt ? "Importe del movimiento revertido" : refund ? "Total reintegrado" : "Importe abonado"}</span><strong>${money(entry.amountCents)}</strong></div>
${entry.reason ? `<section class="reason"><h2>Motivo</h2><p>${escapeHtml(entry.reason)}</p></section>` : ""}
${allocations.length && !refund ? `<section class="details"><table><thead><tr><th scope="col">Deuda / cuota abonada</th><th scope="col">Importe</th></tr></thead><tbody>${allocations.map((item) => `<tr><td>${escapeHtml(item.installment.plan.title)} · Cuota ${item.installment.number}</td><td>${money(item.amountCents)}</td></tr>`).join("")}</tbody></table></section>` : ""}
${cashChange || refund ? `<dl class="cash">${cashChange ? detail("Efectivo recibido", money(entry.cashReceivedAmountCents!)) + detail("Vuelto", money(entry.changeAmountCents!)) : ""}${refund && typeof entry.cashOutAmountCents === "number" ? detail("Dinero entregado", money(entry.cashOutAmountCents)) : ""}${refund && cancelled > 0 ? detail("Acreditaciones pendientes canceladas", money(cancelled)) : ""}</dl>` : ""}
${entry.customerId ? `<section class="balance">${balance ? `<div class="balance-row"><span>Saldo actual</span><strong>${money(balance.amountCents)}</strong></div><p class="balance-note">Al ${formatDateTimeAR(balance.asOf)}</p>` : "<p>Saldo actual no disponible</p>"}</section>` : ""}
${!balance ? `<p class="issued">Emitido el ${formatDateTimeAR(issuedAt)}</p>` : ""}
<footer>${footer ? `<p class="footer-text">${escapeHtml(footer)}</p>` : ""}<p class="legend">${escapeHtml(legend)}</p><p class="reference">Ref. ${escapeHtml(entry.id)}</p></footer>
</main></body></html>`;
}
