import type { BusinessSettings, ReceiptSettings } from "./contracts";

export type PaymentTerms =
  | "Immediate"
  | "DirectInstallments"
  | "CardInstallments";
export type DirectPlanInput = {
  installmentCount: number;
  firstDueDate: string;
  surchargeBasisPoints?: number;
  upfrontAmountCents?: number;
  upfrontPaymentMethodId?: string;
  upfrontCashReceivedAmountCents?: number;
};
export type CardPlanInput = {
  installmentCount: number;
  processor: string;
  reference?: string;
  settlements: Array<{
    dueDate: string;
    grossAmountCents: number;
    feeAmountCents: number;
  }>;
};
export type FinanceInstallment = {
  id?: string;
  number: number;
  dueDate: string;
  amountCents: number;
  paidAmountCents?: number;
  remainingAmountCents?: number;
};
export type SaleFinance = {
  paymentTerms: PaymentTerms;
  upfrontAmountCents: number;
  financedAmountCents: number;
  installments: FinanceInstallment[];
  cardPlan?: Omit<CardPlanInput, "settlements"> & {
    settlements: Array<{
      id?: string;
      number: number;
      dueDate: string;
      grossAmountCents: number;
      feeAmountCents: number;
      netAmountCents: number;
    }>;
  };
};
export type Customer = {
  priceListId?: string | null;
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  balanceAmountCents?: number;
  overdueAmountCents?: number;
  cardPendingAmountCents?: number;
  cardUnscheduledAmountCents?: number;
};
export type PageResult<T> = { items: T[]; total: number; hasMore: boolean };
export type InstallmentRow = {
  id: string;
  planId: string;
  number: number;
  dueDate: string;
  amountCents: number;
  paidAmountCents: number;
  remainingAmountCents: number;
  status: "Pendiente" | "Parcial" | "Pagada" | "Vencida" | "Anulada";
  customerId: string;
  customerName: string;
  title: string;
  saleId: string | null;
  saleNumber?: string | null;
};
export type Accreditation = {
  id: string;
  date: string;
  grossAmountCents: number;
  feeAmountCents: number;
  netAmountCents: number;
  reversedAt?: string | null;
};
export type CardSettlementRow = {
  id: string;
  saleId: string;
  saleNumber: string;
  customerId: string | null;
  customerName: string | null;
  processor: string;
  reference: string | null;
  number: number;
  schedulePending: boolean;
  dueDate: string | null;
  grossAmountCents: number;
  feeAmountCents: number | null;
  netAmountCents: number | null;
  creditedGrossAmountCents: number;
  creditedNetAmountCents: number;
  cancelledGrossAmountCents: number;
  remainingGrossAmountCents: number;
  remainingNetAmountCents: number | null;
  status: string;
  accreditations: Accreditation[];
};
export type FinancialEntry = {
  id: string;
  date: string;
  amountCents: number;
  paymentMethodName?: string;
  reversedAt?: string | null;
  reason?: string;
  cashOutAmountCents?: number;
};
type ReceiptEntry = FinancialEntry & {
  customerId?: string | null;
  customerName?: string | null;
  cashReceivedAmountCents?: number | null;
  changeAmountCents?: number | null;
  reversalReason?: string | null;
  cancellations?: Array<{ grossAmountCents: number }>;
};
export type FinancialReceipt = {
  business: BusinessSettings | null;
  receipt: ReceiptSettings | null;
  collection?: ReceiptEntry;
  refund?: ReceiptEntry;
  allocations?: Array<{
    amountCents: number;
    installment: { number: number; dueDate: string; plan: { title: string } };
  }>;
  legend: string;
};
export type RefundSourceRow = {
  saleId: string | null;
  planId: string | null;
  customerId: string | null;
  customerName: string | null;
  title: string;
  paymentTerms: string | null;
  refundableAmountCents: number;
  refundedAmountCents: number;
  pendingAmountCents: number;
  refunds: FinancialEntry[];
  settlements?: CardSettlementRow[];
};
export type CustomerPlan = {
  id: string;
  title: string;
  status?: string;
  totalAmountCents?: number;
  cancelledAt?: string | null;
  saleId?: string | null;
};
export type CustomerAccount = {
  customer: Customer;
  plans: CustomerPlan[];
  installments: InstallmentRow[];
  collections: FinancialEntry[];
  refunds: FinancialEntry[];
  sales: Array<{
    id: string;
    number?: string;
    totalAmountCents?: number;
    paymentTerms?: PaymentTerms | null;
  }>;
  balanceAmountCents: number;
  overdueAmountCents: number;
  cardPendingAmountCents: number;
  cardUnscheduledAmountCents: number;
};
export type CollectionsSummary = {
  customerDebtAmountCents: number;
  overdueAmountCents: number;
  monthCommitmentsAmountCents: number;
  cardPendingAmountCents: number;
  cardUnscheduledAmountCents: number;
  collectedAmountCents: number;
  refundedAmountCents: number;
  pendingRefundAmountCents: number;
};
export type CollectionInput = {
  operationId: string;
  customerId: string;
  date: string;
  paymentMethodId: string;
  amountCents: number;
  cashReceivedAmountCents?: number;
  allocations: Array<{ installmentId: string; amountCents: number }>;
};
export type RefundInput = {
  operationId: string;
  saleId?: string;
  planId?: string;
  date: string;
  amountCents: number;
  cashOutAmountCents: number;
  paymentMethodId?: string;
  reason: string;
  cancellations?: Array<{ settlementId: string; grossAmountCents: number }>;
};
