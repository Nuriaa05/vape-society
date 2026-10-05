import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Sale } from "@/lib/contracts";
import { salesRepository, type SalesFilters } from "./sales-repository";

const apiSale = {
  id: "sale-customer",
  number: "000001",
  date: "2026-10-04T12:00:00.000Z",
  deliveryStatus: "Pendiente",
  status: "Confirmada",
  paymentMethodId: "pm2",
  payment: "Transferencia",
  totalAmountCents: 100000,
  items: [],
  cancelReason: null,
};

describe("sales repository customer details", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends optional customer details and preserves them in the confirmed sale", async () => {
    const customer = {
      customerName: "María López",
      customerPhone: "+54 9 362 412-3456",
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ ...apiSale, ...customer }),
    );
    const input = {
      paymentMethodId: "pm2",
      deliveryStatus: "Pendiente" as const,
      items: [{ productId: "p3", qty: 1 }],
      ...customer,
    };

    await expect(salesRepository.create(input)).resolves.toMatchObject(
      customer,
    );
    const options = vi.mocked(fetch).mock.calls[0][1];
    expect(JSON.parse(String(options?.body))).toMatchObject(customer);
  });

  it("reloads customer details while accepting older sales without them", async () => {
    const customer = {
      customerName: "María López",
      customerPhone: "+54 9 362 412-3456",
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json([
        { ...apiSale, ...customer },
        { ...apiSale, id: "sale-legacy" },
      ]),
    );

    const sales = await salesRepository.findAll();

    expect(sales[0]).toMatchObject(customer);
    expect(sales[1].customerName).toBeUndefined();
    expect(sales[1].customerPhone).toBeUndefined();
  });
});

describe("sales repository search", () => {
  const customerSale: Sale = {
    id: "sale-customer",
    number: "000001",
    date: "2026-10-04T12:00:00.000Z",
    customerName: "María López",
    customerPhone: "+54 9 362 412-3456",
    items: [{ productId: "pod", name: "Pod 20", qty: 1, price: 1000 }],
    total: 1000,
    payment: "Transferencia",
    delivery: "Pendiente",
    status: "Confirmada",
  };
  const anonymousSale: Sale = {
    ...customerSale,
    id: "sale-anonymous",
    number: "000002",
    customerName: undefined,
    customerPhone: undefined,
    items: [{ productId: "perfume", name: "Perfume 362", qty: 1, price: 1000 }],
  };
  const sales = [customerSale, anonymousSale];

  it.each(["maría", "LÓPEZ", "  María López  "])(
    "finds the customer by name with query %s",
    (query) => {
      expect(salesRepository.filter(sales, { query })).toEqual([customerSale]);
    },
  );

  it.each(["3624123456", "+54 9 362 412-3456", "(362) 412 3456", "412-3456"])(
    "finds the customer by phone with query %s",
    (query) => {
      expect(salesRepository.filter(sales, { query })).toEqual([customerSale]);
    },
  );

  it("keeps searching sale numbers without customer details", () => {
    expect(salesRepository.filter(sales, { query: "000002" })).toEqual([
      anonymousSale,
    ]);
  });

  it("does not turn digits in a product query into a phone match", () => {
    expect(salesRepository.filter(sales, { query: "perfume 362" })).toEqual([
      anonymousSale,
    ]);
  });

  it("combines customer search with matching sale filters", () => {
    expect(
      salesRepository.filter(sales, {
        query: "lópez",
        delivery: "Pendiente",
        payment: "Transferencia",
        date: "2026-10-04",
      }),
    ).toEqual([customerSale]);
  });

  it.each<[string, SalesFilters]>([
    ["delivery", { delivery: "Entregado" }],
    ["payment", { payment: "Efectivo" }],
    ["date", { date: "2026-10-03" }],
  ])("respects the %s filter when the customer matches", (_, filters) => {
    expect(
      salesRepository.filter(sales, { query: "lópez", ...filters }),
    ).toEqual([]);
  });

  it.each(["+", "---", "()"])(
    "does not match every phone for formatting-only query %s",
    (query) => {
      expect(salesRepository.filter(sales, { query })).toEqual([]);
    },
  );

  it("returns all sales when the search is cleared", () => {
    expect(salesRepository.filter(sales, { query: "   " })).toEqual(sales);
  });
});
