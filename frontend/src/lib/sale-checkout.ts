import type { DeliveryStatus } from "@/lib/contracts";
import { parsePesosToAmountCents } from "@/lib/money";

export type SaleQuoteKeyLine = {
  itemType: "Product" | "Combo";
  itemId: string;
  qty: number;
};

export function parseOptionalCashInput(input: string): number | undefined {
  return input.trim() ? parsePesosToAmountCents(input) : undefined;
}

export function buildSaleQuoteKey(input: {
  lines: SaleQuoteKeyLine[];
  paymentMethodId: string;
  couponCode: string;
  cashReceivedInput: string;
  deliveryStatus: DeliveryStatus;
  allowNegativeStock: boolean;
}) {
  const lines = input.lines
    .map((line) => [line.itemType, line.itemId, line.qty] as const)
    .sort((first, second) =>
      `${first[0]}:${first[1]}`.localeCompare(`${second[0]}:${second[1]}`),
    );
  const couponCode = input.couponCode.trim().toUpperCase() || null;
  const cashReceived = normalizeCashForKey(input.cashReceivedInput);

  return [
    "sale-quote",
    ...lines,
    input.paymentMethodId.trim(),
    couponCode,
    cashReceived,
    input.deliveryStatus,
    input.allowNegativeStock,
  ] as const;
}

function normalizeCashForKey(input: string): number | string | null {
  if (!input.trim()) {
    return null;
  }

  try {
    return parsePesosToAmountCents(input);
  } catch {
    return input.trim();
  }
}
