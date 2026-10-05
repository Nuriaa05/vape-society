import { apiClient } from "@/lib/api-client";
import { amountCentsToPesos } from "@/lib/money";

export type HistoryEventType =
  | "sales"
  | "purchases"
  | "products"
  | "stock"
  | "suppliers"
  | "combos"
  | "settings"
  | "backups";

export type HistoryMonth = {
  month: string;
  label: string;
  eventCount: number;
};

export type HistoryEvent = {
  id: string;
  occurredAt: string;
  type: HistoryEventType;
  title: string;
  description: string;
  entityId: string;
  amount?: number;
  quantity?: number;
  status?: string;
};

export type HistoryFilters = {
  month: string;
  day?: string;
  type?: HistoryEventType;
  query?: string;
  take?: number;
  skip?: number;
};

type ApiHistoryEvent = Omit<HistoryEvent, "amount"> & {
  amountCents?: number;
};

type ApiHistoryPage = {
  items: ApiHistoryEvent[];
  total: number;
  hasMore: boolean;
};

export const historyRepository = {
  getMonths(): Promise<HistoryMonth[]> {
    return apiClient.get<HistoryMonth[]>("/history/months");
  },

  async findAll(filters: HistoryFilters) {
    const page = await apiClient.get<ApiHistoryPage>("/history", filters);

    return {
      ...page,
      items: page.items.map(({ amountCents, ...event }) => ({
        ...event,
        amount:
          amountCents === undefined
            ? undefined
            : amountCentsToPesos(amountCents),
      })),
    };
  },
};
