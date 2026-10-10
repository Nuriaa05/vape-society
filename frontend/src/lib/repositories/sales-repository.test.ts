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

describe("sales repository date filter", () => {
  const sale: Sale = {
    id: "sale-date",
    number: "000001",
    date: "2026-10-11T00:30:00.000Z",
    items: [],
    total: 1000,
    payment: "Transferencia",
    delivery: "Pendiente",
    status: "Confirmada",
  };

  it.each([
    ["20:59", "2026-10-10T23:59:59.999Z"],
    ["21:30", "2026-10-11T00:30:00.000Z"],
    ["22:30", "2026-10-11T01:30:00.000Z"],
    ["23:59", "2026-10-11T02:59:59.999Z"],
  ])("keeps a sale at %s on its Argentine day", (_, date) => {
    const datedSale = { ...sale, date };

    expect(salesRepository.filter([datedSale], { date: "2026-10-10" })).toEqual(
      [datedSale],
    );
    expect(salesRepository.filter([datedSale], { date: "2026-10-11" })).toEqual(
      [],
    );
    expect(datedSale.date).toBe(date);
  });

  it.each([
    [
      "2026-10-10",
      "2026-10-11",
      "2026-10-11T02:59:59.999Z",
      "2026-10-11T03:00:00.000Z",
    ],
    [
      "2026-10-31",
      "2026-11-01",
      "2026-11-01T02:59:59.999Z",
      "2026-11-01T03:00:00.000Z",
    ],
    [
      "2026-12-31",
      "2027-01-01",
      "2027-01-01T02:59:59.999Z",
      "2027-01-01T03:00:00.000Z",
    ],
  ])(
    "changes the filtered day from %s to %s at Argentine midnight",
    (previousDay, nextDay, beforeMidnight, midnight) => {
      const previousSale = { ...sale, id: "previous", date: beforeMidnight };
      const nextSale = { ...sale, id: "next", date: midnight };
      const sales = [previousSale, nextSale];

      expect(salesRepository.filter(sales, { date: previousDay })).toEqual([
        previousSale,
      ]);
      expect(salesRepository.filter(sales, { date: nextDay })).toEqual([
        nextSale,
      ]);
    },
  );

  it("returns all sales when no day is selected", () => {
    expect(salesRepository.filter([sale], {})).toEqual([sale]);
    expect(salesRepository.filter([sale], { date: "" })).toEqual([sale]);
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
