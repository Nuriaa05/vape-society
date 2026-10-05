import { apiClient, ApiError } from "@/lib/api-client";
import type {
  ComboItem,
  CouponDiscountType,
  DeliveryStatus,
  PaymentMethodName,
  Sale,
  SaleQuote,
} from "@/lib/contracts";
import { amountCentsToPesos } from "@/lib/money";

export type DeliveryFilter = "all" | "Pendiente" | "Entregado" | "Anulada";

export interface SalesFilters {
  delivery?: DeliveryFilter;
  payment?: "all" | Sale["payment"];
  date?: string;
  query?: string;
}

type ApiSalePricing = {
  couponId: string | null;
  couponCode: string | null;
  couponType: CouponDiscountType | null;
  couponBasisPoints: number | null;
  couponValueAmountCents: number | null;
  subtotalAmountCents: number;
  discountAmountCents: number;
  netAmountCents: number;
  surchargeBasisPoints: number;
  surchargeAmountCents: number;
  totalAmountCents: number;
  cashReceivedAmountCents: number | null;
  changeAmountCents: number | null;
  cashShortfallAmountCents: number;
};

type ApiSale = Partial<ApiSalePricing> & {
  id: string;
  number: string;
  date: string;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryStatus: DeliveryStatus;
  status: Sale["status"];
  paymentMethodId: string;
  payment: string;
  items: Array<{
    id: string;
    itemType?: "Product" | "Combo";
    productId: string | null;
    comboId?: string | null;
    productName: string;
    name: string;
    barcode: string;
    qty: number;
    unitPriceAmountCents: number;
    lineTotalAmountCents: number;
    comboDiscountAmountCents?: number;
    components?: Array<{
      productId: string;
      productName: string;
      name?: string;
      barcode: string;
      qtyPerCombo: number;
      qty: number;
    }>;
  }>;
  totalAmountCents: number;
  cancelReason: string | null;
  cancelledAt?: string | null;
};

export type CreateSaleInput = {
  customerName?: string;
  customerPhone?: string;
  items: Array<{
    itemType?: "Product" | "Combo";
    itemId?: string;
    productId?: string;
    qty: number;
  }>;
  paymentMethodId: string;
  deliveryStatus: DeliveryStatus;
  allowNegativeStock?: boolean;
  couponCode?: string;
  cashReceivedAmountCents?: number;
};

function toSaleComponent(
  component: NonNullable<ApiSale["items"][number]["components"]>[number],
): ComboItem {
  return {
    productId: component.productId,
    productName: component.productName || component.name || "",
    barcode: component.barcode,
    qty: component.qty,
  };
}

function toSale(sale: ApiSale): Sale {
  const subtotalAmountCents = sale.subtotalAmountCents ?? sale.totalAmountCents;
  const discountAmountCents = sale.discountAmountCents ?? 0;
  const netAmountCents =
    sale.netAmountCents ?? subtotalAmountCents - discountAmountCents;

  return {
    id: sale.id,
    number: sale.number,
    date: sale.date,
    customerName: sale.customerName ?? undefined,
    customerPhone: sale.customerPhone ?? undefined,
    items: sale.items.map((item) => ({
      itemType: item.itemType ?? "Product",
      productId: item.productId,
      comboId: item.comboId,
      name: item.name || item.productName,
      qty: item.qty,
      price: amountCentsToPesos(item.unitPriceAmountCents),
      comboDiscount: amountCentsToPesos(item.comboDiscountAmountCents ?? 0),
      components: item.components?.map(toSaleComponent) ?? [],
    })),
    couponId: sale.couponId ?? undefined,
    couponCode: sale.couponCode ?? undefined,
    couponType: sale.couponType ?? undefined,
    couponBasisPoints: sale.couponBasisPoints ?? undefined,
    couponValue:
      sale.couponValueAmountCents == null
        ? undefined
        : amountCentsToPesos(sale.couponValueAmountCents),
    subtotal: amountCentsToPesos(subtotalAmountCents),
    discount: amountCentsToPesos(discountAmountCents),
    net: amountCentsToPesos(netAmountCents),
    surchargeBasisPoints: sale.surchargeBasisPoints ?? 0,
    surcharge: amountCentsToPesos(sale.surchargeAmountCents ?? 0),
    total: amountCentsToPesos(sale.totalAmountCents),
    cashReceived:
      sale.cashReceivedAmountCents == null
        ? undefined
        : amountCentsToPesos(sale.cashReceivedAmountCents),
    change:
      sale.changeAmountCents == null
        ? undefined
        : amountCentsToPesos(sale.changeAmountCents),
    payment: sale.payment as PaymentMethodName,
    delivery: sale.deliveryStatus,
    status: sale.status,
    cancelReason: sale.cancelReason ?? undefined,
  };
}

function toSaleQuote(quote: ApiSalePricing): SaleQuote {
  return {
    subtotal: amountCentsToPesos(quote.subtotalAmountCents),
    discount: amountCentsToPesos(quote.discountAmountCents),
    net: amountCentsToPesos(quote.netAmountCents),
    surchargeBasisPoints: quote.surchargeBasisPoints,
    surcharge: amountCentsToPesos(quote.surchargeAmountCents),
    total: amountCentsToPesos(quote.totalAmountCents),
    couponId: quote.couponId ?? undefined,
    couponCode: quote.couponCode ?? undefined,
    couponType: quote.couponType ?? undefined,
    couponBasisPoints: quote.couponBasisPoints ?? undefined,
    couponValue:
      quote.couponValueAmountCents === null
        ? undefined
        : amountCentsToPesos(quote.couponValueAmountCents),
    cashReceived:
      quote.cashReceivedAmountCents === null
        ? null
        : amountCentsToPesos(quote.cashReceivedAmountCents),
    change:
      quote.changeAmountCents === null
        ? null
        : amountCentsToPesos(quote.changeAmountCents),
    cashShortfall: amountCentsToPesos(quote.cashShortfallAmountCents),
  };
}

function toApiSaleInput(input: CreateSaleInput) {
  return {
    ...input,
    items: input.items.map((item) => ({
      itemType: item.itemType ?? "Product",
      itemId: item.itemId ?? item.productId,
      qty: item.qty,
    })),
  };
}

export const salesRepository = {
  async quote(input: CreateSaleInput): Promise<SaleQuote> {
    return toSaleQuote(
      await apiClient.post<ApiSalePricing>(
        "/sales/quote",
        toApiSaleInput(input),
      ),
    );
  },

  async findAll(
    options: { take?: number; skip?: number } = {},
  ): Promise<Sale[]> {
    const sales = await apiClient.get<ApiSale[]>("/sales", {
      take: options.take,
      skip: options.skip,
    });
    return sales.map(toSale);
  },

  async findConfirmed(): Promise<Sale[]> {
    return (await this.findAll()).filter(
      (sale) => sale.status === "Confirmada",
    );
  },

  async findRecent(limit = 6): Promise<Sale[]> {
    return this.findAll({ take: limit });
  },

  async findPendingDeliveries(): Promise<Sale[]> {
    return (await this.findAll()).filter(
      (sale) => sale.status === "Confirmada" && sale.delivery === "Pendiente",
    );
  },

  async findDelivered(): Promise<Sale[]> {
    return (await this.findAll()).filter(
      (sale) => sale.status === "Confirmada" && sale.delivery === "Entregado",
    );
  },

  async findCancelled(): Promise<Sale[]> {
    return (await this.findAll()).filter((sale) => sale.status === "Anulada");
  },

  async getReceiptData(id: string): Promise<Sale | undefined> {
    try {
      const receipt = await apiClient.get<{ sale: ApiSale }>(
        `/sales/${id}/receipt`,
      );
      return toSale(receipt.sale);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return undefined;
      }
      throw error;
    }
  },

  async create(input: CreateSaleInput): Promise<Sale> {
    return toSale(
      await apiClient.post<ApiSale>("/sales", toApiSaleInput(input)),
    );
  },

  async deliver(id: string): Promise<Sale> {
    return toSale(await apiClient.patch<ApiSale>(`/sales/${id}/deliver`));
  },

  async cancel(id: string, reason?: string): Promise<Sale> {
    return toSale(
      await apiClient.post<ApiSale>(`/sales/${id}/cancel`, {
        reason: reason?.trim() || null,
      }),
    );
  },

  filter(source: Sale[], filters: SalesFilters): Sale[] {
    const delivery = filters.delivery ?? "all";
    const payment = filters.payment ?? "all";
    const date = filters.date ?? "";
    const query = filters.query?.trim().toLowerCase() ?? "";
    const phoneQuery = /^[+\d\s().-]+$/.test(query)
      ? query.replace(/\D/g, "")
      : "";

    return source.filter((sale) => {
      if (delivery === "Anulada" && sale.status !== "Anulada") return false;
      if (
        delivery === "Pendiente" &&
        !(sale.status === "Confirmada" && sale.delivery === "Pendiente")
      ) {
        return false;
      }
      if (
        delivery === "Entregado" &&
        !(sale.status === "Confirmada" && sale.delivery === "Entregado")
      ) {
        return false;
      }
      if (payment !== "all" && sale.payment !== payment) return false;
      if (date && !sale.date.startsWith(date)) return false;
      if (!query) return true;

      const inNumber = sale.number.toLowerCase().includes(query);
      const inItems = sale.items.some((item) =>
        item.name.toLowerCase().includes(query),
      );
      const inCustomerName =
        sale.customerName?.toLowerCase().includes(query) ?? false;
      const inCustomerPhone =
        phoneQuery.length > 0 &&
        (sale.customerPhone?.replace(/\D/g, "").includes(phoneQuery) ?? false);
      return inNumber || inItems || inCustomerName || inCustomerPhone;
    });
  },

  getCounts(source: Sale[]): Record<DeliveryFilter, number> {
    return {
      all: source.length,
      Pendiente: source.filter(
        (sale) => sale.status === "Confirmada" && sale.delivery === "Pendiente",
      ).length,
      Entregado: source.filter(
        (sale) => sale.status === "Confirmada" && sale.delivery === "Entregado",
      ).length,
      Anulada: source.filter((sale) => sale.status === "Anulada").length,
    };
  },

  getTotal(source: Sale[]): number {
    return source.reduce((sum, sale) => sum + sale.total, 0);
  },
};
