import { formatDateInputAR } from "./formatters";
import { parsePesosToAmountCents } from "./money";

export type SupplierPaymentMethod = "Efectivo" | "Transferencia" | "QR";
export type PurchaseFinance = {
  paymentCondition: "Pagada" | "Credito" | "SinSeguimiento";
  dueDate?: string | null;
  paymentDate?: string | null;
  paymentMethod?: SupplierPaymentMethod | null;
  paymentReference?: string | null;
};
export type SupplierFinancialEntry = {
  id: string;
  date: string;
  method: SupplierPaymentMethod | "Sin especificar";
  reference?: string | null;
  amountCents: number;
  reversedAt?: string | null;
  reversalReason?: string | null;
};
export type SupplierPayable = {
  id: string;
  supplierId: string;
  supplierName: string;
  purchaseId: string | null;
  title: string;
  amountCents: number;
  dueDate: string;
  status: "Pendiente" | "Vencida" | "Pagada" | "Anulada";
  balanceCents: number;
  refundPendingCents: number;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  payments: SupplierFinancialEntry[];
  refunds: SupplierFinancialEntry[];
};
export type SupplierDebtSummary = {
  balanceCents: number;
  overdueCents: number;
  dueThisMonthCents: number;
  paidAmountCents: number;
  refundPendingCents: number;
};
export type SupplierAccount = Pick<
  SupplierDebtSummary,
  "balanceCents" | "overdueCents" | "refundPendingCents"
> & {
  supplier: { id: string; name: string };
  payables: SupplierPayable[];
};
export type InventoryValuation = {
  paidQty: number;
  creditQty: number;
  unclassifiedQty: number;
  paidValueCents: number;
  creditValueCents: number;
  unclassifiedValueCents: number;
  totalValueCents: number;
};
export type StockSummary = InventoryValuation & {
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
};
export type StockClassification = {
  productId: string;
  qty: number;
  classification: "Pagada" | "Credito";
  unitCostAmountCents: number;
  payableId?: string;
  reason: string;
};

export function emptyPurchaseFinance(): PurchaseFinance {
  return {
    paymentCondition: "Pagada",
    paymentDate: formatDateInputAR(),
    paymentMethod: null,
    dueDate: "",
    paymentReference: null,
  };
}
export function purchaseFinanceError(
  finance: PurchaseFinance,
  registering: boolean,
  today = formatDateInputAR(),
): string | null {
  if (!registering) return null;
  if (finance.paymentCondition === "Credito")
    return finance.dueDate ? null : "Indicá una fecha de vencimiento.";
  if (finance.paymentCondition === "SinSeguimiento")
    return "Elegí si la compra está pagada o es a crédito.";
  if (!finance.paymentDate) return "Indicá la fecha de pago.";
  if (finance.paymentDate > today)
    return "La fecha de pago no puede ser futura.";
  return null;
}
export function stockClassificationInput(
  values: {
    productId: string;
    qty: number;
    classification: "Pagada" | "Credito";
    cost: string;
    payableId: string;
    reason: string;
  },
  available: number,
): StockClassification {
  if (
    !Number.isInteger(values.qty) ||
    values.qty <= 0 ||
    values.qty > available
  )
    throw new Error(
      "La cantidad debe ser entera y no superar las unidades sin clasificar.",
    );
  const unitCostAmountCents = parsePesosToAmountCents(values.cost);
  if (!Number.isSafeInteger(unitCostAmountCents) || unitCostAmountCents < 0)
    throw new Error("Indicá un costo válido en pesos.");
  if (values.classification === "Credito" && !values.payableId)
    throw new Error("Elegí la deuda pendiente que financia este stock.");
  if (!values.reason.trim())
    throw new Error("Indicá el motivo de la clasificación.");
  return {
    productId: values.productId,
    qty: values.qty,
    classification: values.classification,
    unitCostAmountCents,
    payableId:
      values.classification === "Credito" ? values.payableId : undefined,
    reason: values.reason.trim(),
  };
}
