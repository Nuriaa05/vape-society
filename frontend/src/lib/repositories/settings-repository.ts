import { apiClient } from "@/lib/api-client";
import type {
  CategorySetting,
  LocalSettings,
  PaymentMethodSetting,
} from "@/lib/contracts";

type ApiSettings = {
  business: LocalSettings["business"];
  receipt: LocalSettings["receipt"];
  defaultMarginPct?: number;
  defaultMargin: number;
  comboTicketMode?: LocalSettings["comboTicketMode"];
  categories: Array<CategorySetting & { active?: boolean }>;
  paymentMethods: ApiPaymentMethod[];
};

type ApiPaymentMethod = Omit<
  PaymentMethodSetting,
  "surchargeBasisPoints" | "cashHandling"
> & {
  surchargeBasisPoints?: number;
  cashHandling?: boolean;
};

export type CategoryUpdateInput = Partial<Pick<CategorySetting, "name">> & {
  active?: boolean;
};

export type PaymentMethodUpdateInput = Partial<
  Pick<
    PaymentMethodSetting,
    "name" | "enabled" | "surchargeBasisPoints" | "cashHandling"
  >
>;

function toPaymentMethod(method: ApiPaymentMethod): PaymentMethodSetting {
  return {
    id: method.id,
    name: method.name,
    enabled: method.enabled,
    surchargeBasisPoints: method.surchargeBasisPoints ?? 0,
    cashHandling: method.cashHandling ?? false,
  };
}

function toSettings(settings: ApiSettings): LocalSettings {
  return {
    business: { ...settings.business },
    receipt: { ...settings.receipt },
    defaultMargin: settings.defaultMarginPct ?? settings.defaultMargin,
    comboTicketMode: settings.comboTicketMode ?? "ComboLine",
    categories: settings.categories.map((category) => ({
      id: category.id,
      name: category.name,
    })),
    paymentMethods: settings.paymentMethods.map(toPaymentMethod),
  };
}

export const settingsRepository = {
  async getSettings(): Promise<LocalSettings> {
    return toSettings(await apiClient.get<ApiSettings>("/settings"));
  },

  async findCategories(): Promise<CategorySetting[]> {
    const categories = await apiClient.get<
      Array<CategorySetting & { active?: boolean }>
    >("/settings/categories");
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
    }));
  },

  async createCategory(name: string): Promise<CategorySetting> {
    const category = await apiClient.post<CategorySetting>(
      "/settings/categories",
      { name },
    );
    return { id: category.id, name: category.name };
  },

  async updateCategory(
    id: string,
    input: CategoryUpdateInput,
  ): Promise<CategorySetting> {
    const category = await apiClient.patch<CategorySetting>(
      `/settings/categories/${id}`,
      input,
    );
    return { id: category.id, name: category.name };
  },

  async deleteCategory(id: string): Promise<void> {
    await apiClient.delete(`/settings/categories/${id}`);
  },

  async findPaymentMethods(): Promise<PaymentMethodSetting[]> {
    const methods = await apiClient.get<ApiPaymentMethod[]>(
      "/settings/payment-methods",
    );
    return methods.map(toPaymentMethod);
  },

  async createPaymentMethod(name: string): Promise<PaymentMethodSetting> {
    return toPaymentMethod(
      await apiClient.post<ApiPaymentMethod>("/settings/payment-methods", {
        name,
        enabled: true,
      }),
    );
  },

  async updatePaymentMethod(
    id: string,
    input: PaymentMethodUpdateInput,
  ): Promise<PaymentMethodSetting> {
    return toPaymentMethod(
      await apiClient.patch<ApiPaymentMethod>(
        `/settings/payment-methods/${id}`,
        input,
      ),
    );
  },

  async deletePaymentMethod(id: string): Promise<void> {
    await apiClient.delete(`/settings/payment-methods/${id}`);
  },

  async updateBusiness(
    business: Partial<LocalSettings["business"]>,
  ): Promise<void> {
    await apiClient.patch("/settings/business", business);
  },

  async updateReceipt(
    receipt: Partial<LocalSettings["receipt"]>,
  ): Promise<void> {
    await apiClient.patch("/settings/receipt", receipt);
  },

  async updateDefaultMargin(defaultMarginPct: number): Promise<void> {
    await apiClient.patch("/settings/default-margin", { defaultMarginPct });
  },

  async updateComboTicketMode(
    comboTicketMode: NonNullable<LocalSettings["comboTicketMode"]>,
  ): Promise<void> {
    await apiClient.patch("/settings/combo-ticket-mode", { comboTicketMode });
  },
};
