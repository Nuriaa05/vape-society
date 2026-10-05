export function requiresNegativeInitialStockConfirmation({
  isEdit,
  stock,
}: {
  isEdit: boolean;
  stock: number;
}): boolean {
  return !isEdit && stock < 0;
}
