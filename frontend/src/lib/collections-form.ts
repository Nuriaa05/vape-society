import { formatDateInputAR } from "./formatters";
import { formatAmountCentsAsARS, parsePesosToAmountCents } from "./money";
import type { InstallmentRow } from "./collections";
export const money = formatAmountCentsAsARS;
export const today = () => formatDateInputAR();
export function createFinancialOperationResolver(
  createId: () => string = () => crypto.randomUUID(),
) {
  let previousPayload = "";
  let operationId = "";
  return (payload: unknown): string => {
    const fingerprint = JSON.stringify(payload);
    if (fingerprint !== previousPayload) {
      previousPayload = fingerprint;
      operationId = createId();
    }
    return operationId;
  };
}
export function readMoney(value: string) {
  return value.trim() ? parsePesosToAmountCents(value) : 0;
}
export function allocationAmounts(
  rows: InstallmentRow[],
  values: Record<string, string>,
) {
  return rows.flatMap((row) => {
    const amountCents = readMoney(values[row.id] ?? "");
    if (!amountCents) return [];
    if (amountCents > row.remainingAmountCents)
      throw new Error(`El importe supera el saldo de la cuota ${row.number}.`);
    return [{ installmentId: row.id, amountCents }];
  });
}
