import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { salesRepository } from "./sales-repository";

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
