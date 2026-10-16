import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api-client";
import { collectionsRepository as repo } from "./collections-repository";
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
beforeEach(() => vi.clearAllMocks());
describe("collections request contracts", () => {
  it("sends stable operation key and explicit allocations unchanged", async () => {
    const data = {
      operationId: "retry",
      customerId: "customer",
      date: "2026-10-15",
      paymentMethodId: "cash",
      amountCents: 2550,
      allocations: [{ installmentId: "one", amountCents: 2550 }],
    };
    await repo.collect(data);
    await repo.collect(data);
    expect(apiClient.post).toHaveBeenNthCalledWith(1, "/collections", data);
    expect(apiClient.post).toHaveBeenNthCalledWith(2, "/collections", data);
  });
  it("preserves pending card cancellations separately from actual cash out", async () => {
    const data = {
      operationId: "refund",
      saleId: "sale",
      date: "2026-10-15",
      amountCents: 10000,
      cashOutAmountCents: 2500,
      paymentMethodId: "cash",
      reason: "Cancelación completa",
      cancellations: [{ settlementId: "pending", grossAmountCents: 7500 }],
    };
    await repo.refund(data);
    expect(apiClient.post).toHaveBeenCalledWith("/collections/refunds", data);
  });
  it("excludes paging from server summary and includes paging in row search", async () => {
    await repo.summary({ month: "2026-10", customerId: "customer" });
    await repo.installments({
      month: "2026-10",
      customerId: "customer",
      take: 25,
      skip: 50,
    });
    expect(apiClient.get).toHaveBeenCalledWith("/collections/summary", {
      month: "2026-10",
      customerId: "customer",
    });
    expect(apiClient.get).toHaveBeenCalledWith("/collections", {
      month: "2026-10",
      customerId: "customer",
      take: 25,
      skip: 50,
    });
  });
  it("archives without deleting and preserves reversal reason", async () => {
    await repo.archiveCustomer("customer", false);
    await repo.reverseCollection("collection", "Duplicado");
    expect(apiClient.patch).toHaveBeenCalledWith("/customers/customer", {
      active: false,
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      "/collections/collection/reverse",
      { reason: "Duplicado" },
    );
  });
  it("loads all customer-option pages including archived customers", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({
        items: [{ id: "one" }],
        total: 2,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [{ id: "two" }],
        total: 2,
        hasMore: false,
      });
    expect(await repo.customerOptions()).toEqual([
      { id: "one" },
      { id: "two" },
    ]);
    expect(apiClient.get).toHaveBeenNthCalledWith(2, "/customers", {
      includeInactive: true,
      take: 500,
      skip: 1,
    });
  });
});
