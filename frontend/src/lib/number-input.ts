export function normalizeNumberInputValue(value: string): string {
  return value.replace(/^([+-]?)0+(?=\d)/, "$1");
}

export function reconcileNumberInputValue(
  draftValue: string,
  nextValue: string,
): string {
  if (nextValue === "") return "";
  return Number(draftValue) === Number(nextValue)
    ? draftValue
    : normalizeNumberInputValue(nextValue);
}
