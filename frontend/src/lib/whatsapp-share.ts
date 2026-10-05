import type { Sale, SaleCatalogItem } from "@/lib/contracts";
import { formatARS } from "@/lib/formatters";

export type SharingBridge = {
  openWhatsApp: (request: { text: string }) => Promise<{ ok: true }>;
};

type ClipboardLike = {
  writeText: (text: string) => Promise<void>;
};

type OrderLine = {
  name: string;
  qty: number;
  lineTotal: number;
};

export function buildCartWhatsAppMessage(
  lines: Array<{ product: SaleCatalogItem; qty: number }>,
): string {
  return buildWhatsAppOrderMessage(
    lines.map((line) => ({
      name: line.product.name,
      qty: line.qty,
      lineTotal: line.product.price * line.qty,
    })),
  );
}

export function buildSaleWhatsAppMessage(sale: Sale): string {
  return buildWhatsAppOrderMessage(
    sale.items.map((item) => ({
      name: item.name,
      qty: item.qty,
      lineTotal: item.price * item.qty,
    })),
  );
}

export function buildWhatsAppOrderMessage(lines: OrderLine[]): string {
  const normalizedLines = lines.map((line) => ({
    name: line.name.trim() || "Item",
    qty: Math.max(1, Math.trunc(line.qty)),
    lineTotal: line.lineTotal,
  }));
  const subtotal = normalizedLines.reduce(
    (sum, line) => sum + line.lineTotal,
    0,
  );
  const detail = normalizedLines.map((line) => {
    const prefix = line.qty > 1 ? `${line.qty}x ` : "";

    return `${prefix}${line.name} ${formatARS(line.lineTotal)}`;
  });

  return [...detail, "", `Subtotal: ${formatARS(subtotal)}`].join("\n");
}

export function buildWhatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function shareOrderOnWhatsApp(
  text: string,
  options: { sharingBridge?: SharingBridge } = {},
): Promise<void> {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error("No hay detalle de pedido para compartir.");
  }

  if (options.sharingBridge) {
    await options.sharingBridge.openWhatsApp({ text: trimmed });
    return;
  }

  const opened = window.open(
    buildWhatsAppShareUrl(trimmed),
    "_blank",
    "noopener,noreferrer",
  );

  if (!opened) {
    throw new Error("No se pudo abrir WhatsApp.");
  }
}

export async function copyOrderText(
  text: string,
  options: { clipboard?: ClipboardLike } = {},
): Promise<void> {
  const trimmed = text.trim();

  if (!trimmed) {
    throw new Error("No hay detalle de pedido para copiar.");
  }

  const clipboard =
    options.clipboard ??
    (typeof navigator === "undefined" ? undefined : navigator.clipboard);

  if (!clipboard?.writeText) {
    throw new Error("No se pudo acceder al portapapeles.");
  }

  await clipboard.writeText(trimmed);
}
