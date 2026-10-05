import { apiClient, ApiError } from "@/lib/api-client";
import type { Supplier } from "@/lib/contracts";

type ApiSupplier = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  lastPurchase: string | null;
  active: boolean;
  notes: string | null;
};

type SupplierSaveInput = Omit<Supplier, "id" | "lastPurchase"> & {
  id?: string;
  lastPurchase?: string | null;
};

const EMPTY_LAST_PURCHASE = "-";

function toSupplier(supplier: ApiSupplier): Supplier {
  return {
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    email: supplier.email ?? "",
    lastPurchase: supplier.lastPurchase ?? EMPTY_LAST_PURCHASE,
    active: supplier.active,
    notes: supplier.notes ?? undefined,
  };
}

function toSupplierPayload(supplier: SupplierSaveInput) {
  return {
    name: supplier.name,
    phone: supplier.phone || "-",
    email: supplier.email?.trim() ?? "",
    lastPurchase:
      supplier.lastPurchase === ""
        ? null
        : supplier.lastPurchase && supplier.lastPurchase !== EMPTY_LAST_PURCHASE
          ? supplier.lastPurchase
          : undefined,
    active: supplier.active,
    notes: supplier.notes ?? null,
  };
}

export const suppliersRepository = {
  async findAll(): Promise<Supplier[]> {
    const suppliers = await apiClient.get<ApiSupplier[]>("/suppliers");
    return suppliers.map(toSupplier);
  },

  async findActive(): Promise<Supplier[]> {
    const suppliers = await apiClient.get<ApiSupplier[]>("/suppliers", {
      activeOnly: true,
    });
    return suppliers.map(toSupplier);
  },

  async findById(id: string): Promise<Supplier | undefined> {
    try {
      return toSupplier(await apiClient.get<ApiSupplier>(`/suppliers/${id}`));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return undefined;
      }
      throw error;
    }
  },

  async findOptions(): Promise<{ id: string; name: string }[]> {
    const suppliers = await this.findAll();
    return suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
    }));
  },

  async save(supplier: SupplierSaveInput): Promise<Supplier> {
    const payload = toSupplierPayload(supplier);
    const saved = supplier.id
      ? await apiClient.patch<ApiSupplier>(`/suppliers/${supplier.id}`, payload)
      : await apiClient.post<ApiSupplier>("/suppliers", payload);

    return toSupplier(saved);
  },

  async updateStatus(id: string, active: boolean): Promise<Supplier> {
    return toSupplier(
      await apiClient.patch<ApiSupplier>(`/suppliers/${id}/status`, { active }),
    );
  },
};
