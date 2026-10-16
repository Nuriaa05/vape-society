import type {
  PaymentTerms,
  DirectPlanInput,
  CardPlanInput,
} from "@/lib/collections";
import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { DeliveryStatus } from "@/lib/contracts";
import type { Line } from "@/lib/sale-cart";

export type SaleDraft = {
  customerId: string;
  paymentTerms: PaymentTerms;
  directPlan: DirectPlanInput;
  cardPlan: CardPlanInput;
  operationId: string;
  operationFingerprint: string;
  search: string;
  lines: Line[];
  activeLineProductId: string | null;
  paymentMethodId: string;
  delivery: DeliveryStatus;
  couponInput: string;
  appliedCouponCode: string;
  cashReceivedInput: string;
  customerName: string;
  customerPhone: string;
};

export function createEmptySaleDraft(): SaleDraft {
  return {
    customerId: "",
    paymentTerms: "Immediate",
    directPlan: {
      installmentCount: 3,
      firstDueDate: "",
      surchargeBasisPoints: 0,
      upfrontAmountCents: 0,
    },
    cardPlan: { installmentCount: 3, processor: "", settlements: [] },
    operationId: crypto.randomUUID(),
    operationFingerprint: "",
    search: "",
    lines: [],
    activeLineProductId: null,
    paymentMethodId: "",
    delivery: "Entregado",
    couponInput: "",
    appliedCouponCode: "",
    cashReceivedInput: "",
    customerName: "",
    customerPhone: "",
  };
}

export const SaleDraftContext = createContext<{
  draft: SaleDraft;
  setDraft: Dispatch<SetStateAction<SaleDraft>>;
} | null>(null);

export function useSaleDraft() {
  const context = useContext(SaleDraftContext);
  if (!context) throw new Error("Falta el proveedor del borrador de venta.");
  return context;
}
