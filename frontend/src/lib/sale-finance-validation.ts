import type {
  CardPlanInput,
  DirectPlanInput,
  PaymentTerms,
} from "@/lib/collections";
import type { PaymentMethodSetting } from "@/lib/contracts";

type SaleFinanceInput = {
  paymentTerms: PaymentTerms;
  customerId: string;
  directPlan: DirectPlanInput;
  cardPlan: CardPlanInput;
  paymentMethodId: string;
  methods: PaymentMethodSetting[];
  totalAmountCents?: number;
  moneyValid: boolean;
};

export function getSaleFinanceIssue(input: SaleFinanceInput): string | null {
  if (!input.moneyValid) {
    return "Revisá los importes: ingresá montos válidos con hasta dos decimales.";
  }

  const { paymentTerms, directPlan, cardPlan, totalAmountCents } = input;
  if (paymentTerms === "DirectInstallments") {
    if (!input.customerId.trim()) {
      return "Seleccioná un cliente registrado para las cuotas propias.";
    }
    if (!validInstallmentCount(directPlan.installmentCount)) {
      return "Ingresá una cantidad de cuotas entre 1 y 120.";
    }
    if (!validCalendarDate(directPlan.firstDueDate)) {
      return "Ingresá una fecha válida para la primera cuota.";
    }
    const surcharge = directPlan.surchargeBasisPoints ?? 0;
    if (!Number.isInteger(surcharge) || surcharge < 0 || surcharge > 100000) {
      return "Ingresá un recargo válido entre 0 % y 1000 %.";
    }
    const upfront = directPlan.upfrontAmountCents ?? 0;
    if (
      !Number.isSafeInteger(upfront) ||
      upfront < 0 ||
      (totalAmountCents !== undefined && upfront >= totalAmountCents)
    ) {
      return "Ingresá una entrega inicial válida y menor al total.";
    }
    if (upfront > 0) {
      const method = input.methods.find(
        (method) => method.id === directPlan.upfrontPaymentMethodId,
      );
      if (!method?.enabled || !method.collectionEligible) {
        return "Seleccioná un medio de cobro habilitado para la entrega inicial.";
      }
      const received = directPlan.upfrontCashReceivedAmountCents;
      if (
        method.cashHandling &&
        (received === undefined ||
          !Number.isSafeInteger(received) ||
          received < upfront)
      ) {
        return "El efectivo recibido debe cubrir la entrega inicial.";
      }
    }
    return null;
  }

  const method = getSalePaymentMethods(input.methods, paymentTerms).find(
    (method) => method.id === input.paymentMethodId,
  );
  if (!method) {
    return paymentTerms === "CardInstallments"
      ? "Seleccioná un medio habilitado para cuotas con tarjeta."
      : "Seleccioná un medio de pago habilitado.";
  }

  if (paymentTerms === "CardInstallments") {
    if (totalAmountCents === 0)
      return "El total de una venta con tarjeta en cuotas debe ser mayor a cero.";
    if (!cardPlan.processor.trim()) {
      return "Ingresá la procesadora de la tarjeta.";
    }
    if (!validInstallmentCount(cardPlan.installmentCount)) {
      return "Ingresá una cantidad de cuotas entre 1 y 120.";
    }
    for (const [index, settlement] of cardPlan.settlements.entries()) {
      if (!validCalendarDate(settlement.dueDate)) {
        return `Ingresá una fecha válida para la acreditación ${index + 1}.`;
      }
      if (
        !Number.isSafeInteger(settlement.grossAmountCents) ||
        settlement.grossAmountCents <= 0
      ) {
        return `Ingresá un importe bruto válido para la acreditación ${index + 1}.`;
      }
      if (
        !Number.isSafeInteger(settlement.feeAmountCents) ||
        settlement.feeAmountCents < 0 ||
        settlement.feeAmountCents > settlement.grossAmountCents
      ) {
        return `La comisión de la acreditación ${index + 1} debe estar entre cero y el importe bruto.`;
      }
    }
    if (
      cardPlan.settlements.length > 0 &&
      totalAmountCents !== undefined &&
      cardPlan.settlements.reduce(
        (sum, settlement) => sum + settlement.grossAmountCents,
        0,
      ) !== totalAmountCents
    ) {
      return "La suma de las acreditaciones debe coincidir con el total.";
    }
  }
  return null;
}

export function getSalePaymentMethods(
  methods: PaymentMethodSetting[],
  terms: PaymentTerms,
): PaymentMethodSetting[] {
  return methods.filter(
    (method) =>
      method.enabled &&
      (terms === "CardInstallments"
        ? method.supportsInstallments && !method.cashHandling
        : terms !== "Immediate" || !method.supportsInstallments),
  );
}

export function nextMonthlyDueDate(today: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(today);
  const value = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)!.value);
  const originalMonth = value("month");
  const year = value("year") + (originalMonth === 12 ? 1 : 0);
  const month = originalMonth === 12 ? 1 : originalMonth + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(value("day"), daysInMonth);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function validInstallmentCount(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= 120;
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
