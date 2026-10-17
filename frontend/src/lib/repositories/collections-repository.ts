import { apiClient } from "@/lib/api-client";
import type {
  Customer,
  CustomerAccount,
  PageResult,
  InstallmentRow,
  CardSettlementRow,
  CardPlanInput,
  RefundSourceRow,
  CollectionsSummary,
  CollectionInput,
  RefundInput,
  FinancialEntry,
  FinancialReceipt,
  CustomerPlan,
} from "@/lib/collections";

export type CollectionFilters = {
  month?: string;
  customerId?: string;
  status?: string;
  q?: string;
  take?: number;
  skip?: number;
};
export const collectionsRepository = {
  async customerOptions(): Promise<Customer[]> {
    const items: Customer[] = [];
    let hasMore = true;
    while (hasMore) {
      const page = await apiClient.get<PageResult<Customer>>("/customers", {
        includeInactive: true,
        take: 500,
        skip: items.length,
      });
      items.push(...page.items);
      hasMore = page.hasMore && page.items.length > 0;
    }
    return items;
  },
  findCustomers: (
    query: {
      q?: string;
      take?: number;
      skip?: number;
      includeInactive?: boolean;
    } = {},
  ) => apiClient.get<PageResult<Customer>>("/customers", query),
  createCustomer: (data: {
    name: string;
    phone?: string;
    notes?: string;
    priceListId?: string | null;
  }) => apiClient.post<Customer>("/customers", data),
  customers: (
    query: {
      debtStatus?: "withDebt" | "overdue";
      q?: string;
      take?: number;
      skip?: number;
      includeInactive?: boolean;
    } = {},
  ) => apiClient.get<PageResult<Customer>>("/customers", query),
  saveCustomer: (data: {
    id?: string;
    name: string;
    phone?: string;
    notes?: string;
    active?: boolean;
    priceListId?: string | null;
  }) => {
    const { id, ...payload } = data;
    return id
      ? apiClient.patch<Customer>(`/customers/${id}`, payload)
      : apiClient.post<Customer>("/customers", payload);
  },
  archiveCustomer: (id: string, active: boolean) =>
    apiClient.patch<Customer>(`/customers/${id}`, { active }),
  assignPriceList: (id: string, priceListId: string | null) =>
    apiClient.patch<Customer>(`/customers/${id}`, { priceListId }),
  account: (id: string) =>
    apiClient.get<CustomerAccount>(`/customers/${id}/account`),
  openingBalance: (
    id: string,
    data: {
      operationId: string;
      title: string;
      totalAmountCents: number;
      installmentCount: number;
      firstDueDate: string;
    },
  ) => apiClient.post<CustomerPlan>(`/customers/${id}/opening-balances`, data),
  cancelPlan: (customerId: string, planId: string, reason: string) =>
    apiClient.post<CustomerPlan>(
      `/customers/${customerId}/plans/${planId}/cancel`,
      { reason },
    ),
  installments: (query: CollectionFilters) =>
    apiClient.get<PageResult<InstallmentRow>>("/collections", query),
  summary: (query: Pick<CollectionFilters, "month" | "customerId">) =>
    apiClient.get<CollectionsSummary>("/collections/summary", query),
  collect: (data: CollectionInput) =>
    apiClient.post<FinancialEntry>("/collections", data),
  reverseCollection: (id: string, reason: string) =>
    apiClient.post(`/collections/${id}/reverse`, { reason }),
  settlements: (query: CollectionFilters) =>
    apiClient.get<PageResult<CardSettlementRow>>("/card-settlements", query),
  scheduleCardSale: (
    saleId: string,
    data: { operationId: string; settlements: CardPlanInput["settlements"] },
  ) => apiClient.post(`/card-settlements/sales/${saleId}/schedule`, data),
  accredit: (
    id: string,
    data: {
      operationId: string;
      date: string;
      grossAmountCents: number;
      feeAmountCents: number;
      reference?: string;
    },
  ) => apiClient.post(`/card-settlements/${id}/accreditations`, data),
  reverseAccreditation: (id: string, reason: string) =>
    apiClient.post(`/card-settlements/accreditations/${id}/reverse`, {
      reason,
    }),
  refunds: (query: CollectionFilters) =>
    apiClient.get<PageResult<RefundSourceRow>>("/collections/refunds", query),
  refund: (data: RefundInput) =>
    apiClient.post<FinancialEntry>("/collections/refunds", data),
  reverseRefund: (id: string, reason: string) =>
    apiClient.post(`/collections/refunds/${id}/reverse`, { reason }),
  receipt: (id: string, refund = false) =>
    apiClient.get<FinancialReceipt>(
      `/collections/${refund ? "refunds/" : ""}${id}/receipt`,
    ),
};
