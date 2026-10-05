import { describe, expect, it } from "vitest";

import type { PaymentMethodSetting, Sale } from "@/lib/contracts";
import {
  getAvailablePaymentMethods,
  getPaymentFilterOptions,
  resolveSelectedPaymentMethodId,
} from "./payment-methods";

const method = (
  id: string,
  name: string,
  enabled = true,
): PaymentMethodSetting => ({
  id,
  name,
  enabled,
  surchargeBasisPoints: 0,
  cashHandling: false,
});

const sale = (payment: string): Sale => ({
  id: `sale-${payment}`,
  number: "000001",
  date: "2026-06-28T12:00:00.000Z",
  items: [],
  total: 100,
  payment,
  delivery: "Entregado",
  status: "Confirmada",
});

describe("payment method helpers", () => {
  it("uses enabled configured payment methods for new sales", () => {
    const methods = [
      method("pm1", "Efectivo"),
      method("pm2", "Mercado Pago"),
      method("pm3", "Tarjeta", false),
    ];

    expect(
      getAvailablePaymentMethods(methods).map((item) => item.name),
    ).toEqual(["Efectivo", "Mercado Pago"]);
  });

  it("keeps the selected method only while it is enabled", () => {
    const methods = [method("pm1", "Efectivo"), method("pm2", "Mercado Pago")];

    expect(resolveSelectedPaymentMethodId("pm2", methods)).toBe("pm2");
    expect(resolveSelectedPaymentMethodId("pm3", methods)).toBe("pm1");
  });

  it("builds sale filters from configured methods and historical sales", () => {
    const methods = [method("pm2", "Mercado Pago")];
    const sales = [sale("Efectivo"), sale("Mercado Pago")];

    expect(getPaymentFilterOptions(methods, sales)).toEqual([
      "Mercado Pago",
      "Efectivo",
    ]);
  });
});
