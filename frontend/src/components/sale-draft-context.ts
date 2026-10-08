import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { DeliveryStatus } from "@/lib/contracts";
import type { Line } from "@/lib/sale-cart";

type SaleDraft = {
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
