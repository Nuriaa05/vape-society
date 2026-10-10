import type { BusinessSettings, ReceiptSettings } from "@/lib/contracts";

export const INTERNAL_RECEIPT_LEGEND =
  "Comprobante interno · No válido como factura fiscal";
export const RECEIPT_FINAL_RULE = "--------------------";

type ReceiptViewSettings = {
  business: BusinessSettings;
  receipt: ReceiptSettings;
};

const clean = (value: string): string => value.trim();

export function buildReceiptHeaderLines({
  business,
}: ReceiptViewSettings): string[] {
  const businessName = clean(business.name) || "Nuevo comercio";
  const lines = [
    businessName,
    clean(business.address),
    clean(business.cuit) ? `CUIT ${clean(business.cuit)}` : "",
    clean(business.phone) ? `Tel. ${clean(business.phone)}` : "",
  ].filter(Boolean);

  return lines;
}

export function getReceiptFooter(receipt: ReceiptSettings): string {
  return clean(receipt.footer) || INTERNAL_RECEIPT_LEGEND;
}
