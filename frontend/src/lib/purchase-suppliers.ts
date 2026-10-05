import type { Supplier } from "./contracts";

export function getPurchaseSupplierOptions(
  suppliers: Supplier[],
  currentSupplierId?: string,
): Supplier[] {
  return suppliers.filter(
    (supplier) => supplier.active || supplier.id === currentSupplierId,
  );
}
