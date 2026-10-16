import { apiClient } from "@/lib/api-client";
import type { PageResult } from "@/lib/collections";
import type {
  SupplierAccount,
  SupplierDebtSummary,
  SupplierPayable,
  SupplierPaymentMethod,
} from "@/lib/supplier-credit";

type Filters = {
  supplierId?: string;
  status?: string;
  q?: string;
  month?: string;
  take?: number;
  skip?: number;
};
type PaymentInput = {
  operationId: string;
  date: string;
  method: SupplierPaymentMethod;
  reference?: string;
};
export const supplierPayablesRepository = {
  async all(): Promise<SupplierPayable[]> {
    const items: SupplierPayable[] = [];
    let hasMore = true;
    while (hasMore) {
      const page = await apiClient.get<PageResult<SupplierPayable>>(
        "/supplier-payables",
        { take: 500, skip: items.length },
      );
      items.push(...page.items);
      hasMore = page.hasMore && page.items.length > 0;
    }
    return items;
  },
  find: (filters: Filters = {}) =>
    apiClient.get<PageResult<SupplierPayable>>("/supplier-payables", filters),
  summary: (filters: Pick<Filters, "supplierId" | "month"> = {}) =>
    apiClient.get<SupplierDebtSummary>("/supplier-payables/summary", filters),
  account: (id: string) =>
    apiClient.get<SupplierAccount>(`/supplier-payables/account/${id}`),
  opening: (data: {
    operationId: string;
    supplierId: string;
    title: string;
    amountCents: number;
    dueDate: string;
  }) => apiClient.post<SupplierPayable>("/supplier-payables/opening", data),
  pay: (id: string, data: PaymentInput) =>
    apiClient.post(`/supplier-payables/${id}/payments`, data),
  refund: (id: string, data: PaymentInput) =>
    apiClient.post(`/supplier-payables/${id}/refunds`, data),
  reversePayment: (id: string, reason: string) =>
    apiClient.post(`/supplier-payables/payments/${id}/reverse`, { reason }),
  reverseRefund: (id: string, reason: string) =>
    apiClient.post(`/supplier-payables/refunds/${id}/reverse`, { reason }),
  cancel: (id: string, reason: string) =>
    apiClient.post(`/supplier-payables/${id}/cancel`, { reason }),
};
