import type { CreateSaleInput } from "./repositories/sales-repository";
type Attempt = { operationId: string; operationFingerprint: string };
export function getPersistedWholesaleSaleAttempt(
  previous: Attempt,
): CreateSaleInput | null {
  if (!previous.operationFingerprint) return null;
  try {
    const original = JSON.parse(
      previous.operationFingerprint,
    ) as CreateSaleInput;
    return original && Array.isArray(original.items)
      ? { ...original, operationId: previous.operationId }
      : null;
  } catch {
    return null;
  }
}
export function resolveWholesaleSaleAttempt(
  previous: Attempt,
  input: CreateSaleInput,
  createId: () => string = () => crypto.randomUUID(),
): Attempt & { payload: CreateSaleInput } {
  const original = getPersistedWholesaleSaleAttempt(previous);
  const operationId =
    original || !previous.operationFingerprint
      ? previous.operationId
      : createId();
  const payload = original ?? { ...input, operationId };
  return {
    operationId,
    operationFingerprint: JSON.stringify(payload),
    payload,
  };
}
export function releaseWholesaleSaleAttempt(
  createId: () => string = () => crypto.randomUUID(),
): Attempt {
  return { operationId: createId(), operationFingerprint: "" };
}
