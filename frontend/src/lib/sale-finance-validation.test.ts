import { describe, expect, it } from "vitest";

import type { PaymentMethodSetting } from "@/lib/contracts";
import {
  getSaleFinanceIssue,
  getSalePaymentMethods,
  nextMonthlyDueDate,
} from "./sale-finance-validation";

const cash: PaymentMethodSetting = {
  id: "cash",
  name: "Efectivo",
  enabled: true,
  cashHandling: true,
  collectionEligible: true,
  surchargeBasisPoints: 0,
};
const card: PaymentMethodSetting = {
  ...cash,
  id: "card",
  name: "Tarjeta",
  cashHandling: false,
  supportsInstallments: true,
};
const methods = [cash, card];
const validInput = (): Parameters<typeof getSaleFinanceIssue>[0] => ({
  paymentTerms: "Immediate",
  customerId: "customer-1",
  directPlan: {
    installmentCount: 3,
    firstDueDate: "2026-11-15",
    surchargeBasisPoints: 0,
    upfrontAmountCents: 0,
  },
  cardPlan: {
    installmentCount: 3,
    processor: "Visa",
    settlements: [
      { dueDate: "2026-11-15", grossAmountCents: 10000, feeAmountCents: 500 },
    ],
  },
  paymentMethodId: "cash",
  methods,
  totalAmountCents: 10000,
  moneyValid: true,
});

describe("sale finance validation", () => {
  it("explains invalid visible money before other missing fields", () => {
    expect(
      getSaleFinanceIssue({
        ...validInput(),
        moneyValid: false,
        paymentMethodId: "",
      }),
    ).toBe(
      "Revisá los importes: ingresá montos válidos con hasta dos decimales.",
    );
  });

  it("accepts immediate payment with an enabled method", () => {
    expect(getSaleFinanceIssue(validInput())).toBeNull();
  });

  it.each(["", "missing", "disabled"])(
    "explains an unavailable immediate method (%s)",
    (paymentMethodId) => {
      expect(
        getSaleFinanceIssue({
          ...validInput(),
          paymentMethodId,
          methods: [...methods, { ...card, id: "disabled", enabled: false }],
        }),
      ).toBe("Seleccioná un medio de pago habilitado.");
    },
  );

  it("requires a registered customer for direct installments", () => {
    expect(
      getSaleFinanceIssue({
        ...validInput(),
        paymentTerms: "DirectInstallments",
        customerId: " ",
      }),
    ).toBe("Seleccioná un cliente registrado para las cuotas propias.");
  });

  it("accepts direct installments without an upfront payment or payment method", () => {
    expect(
      getSaleFinanceIssue({
        ...validInput(),
        paymentTerms: "DirectInstallments",
        paymentMethodId: "",
      }),
    ).toBeNull();
  });

  it.each([0, 121, 1.5, Number.NaN])(
    "rejects invalid installment count %s for both finance options",
    (installmentCount) => {
      const input = validInput();
      for (const paymentTerms of [
        "DirectInstallments",
        "CardInstallments",
      ] as const) {
        expect(
          getSaleFinanceIssue({
            ...input,
            paymentTerms,
            paymentMethodId: "card",
            directPlan: { ...input.directPlan, installmentCount },
            cardPlan: { ...input.cardPlan, installmentCount },
          }),
        ).toBe("Ingresá una cantidad de cuotas entre 1 y 120.");
      }
    },
  );

  it.each([
    "",
    "2026-02-29",
    "2026-04-31",
    "2026-1-01",
    "2026-01-01T00:00:00Z",
  ])("rejects invalid direct due date %s", (firstDueDate) => {
    const input = validInput();
    expect(
      getSaleFinanceIssue({
        ...input,
        paymentTerms: "DirectInstallments",
        directPlan: { ...input.directPlan, firstDueDate },
      }),
    ).toBe("Ingresá una fecha válida para la primera cuota.");
  });

  it("accepts a past valid leap date", () => {
    const input = validInput();
    expect(
      getSaleFinanceIssue({
        ...input,
        paymentTerms: "DirectInstallments",
        directPlan: { ...input.directPlan, firstDueDate: "2024-02-29" },
      }),
    ).toBeNull();
  });

  it.each([-1, 100001, 0.5, Number.NaN])(
    "rejects invalid direct surcharge %s",
    (surchargeBasisPoints) => {
      const input = validInput();
      expect(
        getSaleFinanceIssue({
          ...input,
          paymentTerms: "DirectInstallments",
          directPlan: { ...input.directPlan, surchargeBasisPoints },
        }),
      ).toBe("Ingresá un recargo válido entre 0 % y 1000 %.");
    },
  );

  it.each([-1, 0.5, Number.NaN, 10000, 11000])(
    "rejects an invalid upfront amount %s",
    (upfrontAmountCents) => {
      const input = validInput();
      expect(
        getSaleFinanceIssue({
          ...input,
          paymentTerms: "DirectInstallments",
          directPlan: { ...input.directPlan, upfrontAmountCents },
        }),
      ).toBe("Ingresá una entrega inicial válida y menor al total.");
    },
  );

  it("defers comparing an upfront payment until the total is available", () => {
    const input = validInput();
    expect(
      getSaleFinanceIssue({
        ...input,
        paymentTerms: "DirectInstallments",
        totalAmountCents: undefined,
        directPlan: {
          ...input.directPlan,
          upfrontAmountCents: 10000,
          upfrontPaymentMethodId: "card",
        },
      }),
    ).toBeNull();
  });

  it.each([
    { upfrontPaymentMethodId: "" },
    { upfrontPaymentMethodId: "missing" },
    { upfrontPaymentMethodId: "disabled" },
    { upfrontPaymentMethodId: "ineligible" },
  ])("requires an enabled collection method for an upfront payment", (plan) => {
    const input = validInput();
    expect(
      getSaleFinanceIssue({
        ...input,
        paymentTerms: "DirectInstallments",
        methods: [
          ...methods,
          { ...card, id: "disabled", enabled: false },
          { ...card, id: "ineligible", collectionEligible: false },
        ],
        directPlan: { ...input.directPlan, upfrontAmountCents: 1000, ...plan },
      }),
    ).toBe("Seleccioná un medio de cobro habilitado para la entrega inicial.");
  });

  it.each([undefined, 999, -1, 1000.5, Number.NaN])(
    "requires sufficient valid cash received for an upfront payment (%s)",
    (upfrontCashReceivedAmountCents) => {
      const input = validInput();
      expect(
        getSaleFinanceIssue({
          ...input,
          paymentTerms: "DirectInstallments",
          directPlan: {
            ...input.directPlan,
            upfrontAmountCents: 1000,
            upfrontPaymentMethodId: "cash",
            upfrontCashReceivedAmountCents,
          },
        }),
      ).toBe("El efectivo recibido debe cubrir la entrega inicial.");
    },
  );

  it("accepts sufficient cash for an upfront payment", () => {
    const input = validInput();
    expect(
      getSaleFinanceIssue({
        ...input,
        paymentTerms: "DirectInstallments",
        directPlan: {
          ...input.directPlan,
          upfrontAmountCents: 1000,
          upfrontPaymentMethodId: "cash",
          upfrontCashReceivedAmountCents: 1500,
        },
      }),
    ).toBeNull();
  });

  it.each(["cash", "missing", "disabled", "unsupported", "cash-installments"])(
    "explains an unavailable card installment method (%s)",
    (paymentMethodId) => {
      expect(
        getSaleFinanceIssue({
          ...validInput(),
          paymentTerms: "CardInstallments",
          paymentMethodId,
          methods: [
            ...methods,
            { ...card, id: "disabled", enabled: false },
            { ...card, id: "unsupported", supportsInstallments: false },
            { ...cash, id: "cash-installments", supportsInstallments: true },
          ],
        }),
      ).toBe("Seleccioná un medio habilitado para cuotas con tarjeta.");
    },
  );

  it("requires a processor for card installments", () => {
    const input = validInput();
    expect(
      getSaleFinanceIssue({
        ...input,
        paymentTerms: "CardInstallments",
        paymentMethodId: "card",
        cardPlan: { ...input.cardPlan, processor: " " },
      }),
    ).toBe("Ingresá la procesadora de la tarjeta.");
  });

  it("allows the card settlement calendar to be completed after the sale", () => {
    const input = validInput();
    expect(
      getSaleFinanceIssue({
        ...input,
        paymentTerms: "CardInstallments",
        paymentMethodId: "card",
        cardPlan: { ...input.cardPlan, settlements: [] },
      }),
    ).toBeNull();
  });

  it("rejects a zero-total card sale instead of leaving an uncompletable calendar", () => {
    const input = validInput();
    expect(
      getSaleFinanceIssue({
        ...input,
        paymentTerms: "CardInstallments",
        paymentMethodId: "card",
        totalAmountCents: 0,
        cardPlan: { ...input.cardPlan, settlements: [] },
      }),
    ).toBe(
      "El total de una venta con tarjeta en cuotas debe ser mayor a cero.",
    );
  });

  it.each([
    { dueDate: "2026-02-29" },
    { grossAmountCents: 0 },
    { grossAmountCents: 10.5 },
    { feeAmountCents: -1 },
    { feeAmountCents: 10001 },
    { feeAmountCents: 0.5 },
  ])("explains an invalid card settlement", (settlement) => {
    const input = validInput();
    expect(
      getSaleFinanceIssue({
        ...input,
        paymentTerms: "CardInstallments",
        paymentMethodId: "card",
        cardPlan: {
          ...input.cardPlan,
          settlements: [{ ...input.cardPlan.settlements[0], ...settlement }],
        },
      }),
    ).toMatch(/acreditación 1/i);
  });

  it("requires card gross amounts to match the known total", () => {
    expect(
      getSaleFinanceIssue({
        ...validInput(),
        paymentTerms: "CardInstallments",
        paymentMethodId: "card",
        totalAmountCents: 20000,
      }),
    ).toBe("La suma de las acreditaciones debe coincidir con el total.");
  });

  it("defers settlement comparison until the total is available", () => {
    expect(
      getSaleFinanceIssue({
        ...validInput(),
        paymentTerms: "CardInstallments",
        paymentMethodId: "card",
        totalAmountCents: undefined,
      }),
    ).toBeNull();
  });

  it("accepts a complete card installment plan", () => {
    expect(
      getSaleFinanceIssue({
        ...validInput(),
        paymentTerms: "CardInstallments",
        paymentMethodId: "card",
      }),
    ).toBeNull();
  });
});

describe("sale payment methods", () => {
  const allMethods = [
    cash,
    card,
    { ...card, id: "disabled", enabled: false },
    { ...cash, id: "cash-installments", supportsInstallments: true },
  ];

  it.each(["DirectInstallments"] as const)(
    "offers enabled methods for %s",
    (terms) => {
      expect(
        getSalePaymentMethods(allMethods, terms).map(({ id }) => id),
      ).toEqual(["cash", "card", "cash-installments"]);
    },
  );

  it("keeps installment card methods out of the immediate-payment flow", () => {
    expect(
      getSalePaymentMethods(allMethods, "Immediate").map(({ id }) => id),
    ).toEqual(["cash"]);
  });

  it("excludes cash and unsupported or disabled methods for card installments", () => {
    expect(
      getSalePaymentMethods(allMethods, "CardInstallments").map(({ id }) => id),
    ).toEqual(["card"]);
  });
});

describe("next monthly due date", () => {
  it.each([
    ["2026-01-31T15:00:00Z", "2026-02-28"],
    ["2024-01-31T15:00:00Z", "2024-02-29"],
    ["2026-03-31T15:00:00Z", "2026-04-30"],
    ["2026-12-15T15:00:00Z", "2027-01-15"],
    ["2026-03-01T01:00:00Z", "2026-03-28"],
  ])("advances %s using the Argentina date", (instant, expected) => {
    expect(nextMonthlyDueDate(new Date(instant))).toBe(expected);
  });
});
