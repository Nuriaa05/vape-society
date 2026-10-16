import { parsePesosToAmountCents } from "@/lib/money";
import type { CardPlanInput } from "@/lib/collections";

export type FinanceMoneyDraft =
  | { raw: string; valid: true; cents: number }
  | { raw: string; valid: false };
export function createFinanceMoneyDraft(cents: number): FinanceMoneyDraft {
  return { raw: String(cents / 100).replace(".", ","), valid: true, cents };
}
export function editFinanceMoneyDraft(raw: string): FinanceMoneyDraft {
  try {
    const cents = raw.trim() ? parsePesosToAmountCents(raw) : 0;
    return Number.isSafeInteger(cents)
      ? { raw, valid: true, cents }
      : { raw, valid: false };
  } catch {
    return { raw, valid: false };
  }
}
export function removeFinanceSettlement(
  settlements: CardPlanInput["settlements"],
  keys: string[],
  index: number,
) {
  return {
    settlements: settlements.filter((_, i) => i !== index),
    keys: keys.filter((_, i) => i !== index),
  };
}
