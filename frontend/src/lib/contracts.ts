export type Category = string;

export type PaymentMethodName = string;
export type CouponDiscountType = "Percentage" | "FixedAmount";

export interface CouponSetting {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountBasisPoints: number | null;
  discountAmount: number | null;
  enabled: boolean;
}

export interface SaleQuote {
  subtotal: number;
  discount: number;
  net: number;
  surchargeBasisPoints: number;
  surcharge: number;
  total: number;
  couponId?: string;
  couponCode?: string;
  couponType?: CouponDiscountType;
  couponBasisPoints?: number;
  couponValue?: number;
  cashReceived: number | null;
  change: number | null;
  cashShortfall: number;
}

export interface Product {
  itemType: "Product";
  id: string;
  barcode: string;
  name: string;
  categoryId?: string;
  category: Category;
  supplierId: string;
  cost: number;
  marginPct: number;
  price: number;
  stock: number;
  reservedStock?: number;
  availableStock?: number;
  minStock: number;
  archived?: boolean;
}

export interface ComboItem {
  productId: string;
  productName: string;
  barcode: string;
  qty: number;
  stock?: number;
  availableStock?: number;
}

export interface Combo {
  itemType: "Combo";
  id: string;
  barcode: string;
  name: string;
  price: number;
  productsTotal: number;
  discount: number;
  archived?: boolean;
  items: ComboItem[];
}

export type SaleCatalogItem = Product | Combo;

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  lastPurchase: string;
  active: boolean;
  notes?: string;
}

export type DeliveryStatus = "Pendiente" | "Entregado";
export type SaleStatus = "Confirmada" | "Anulada";

export interface Sale {
  id: string;
  number: string;
  date: string;
  customerName?: string;
  customerPhone?: string;
  items: {
    itemType?: "Product" | "Combo";
    productId: string | null;
    comboId?: string | null;
    name: string;
    qty: number;
    price: number;
    comboDiscount?: number;
    components?: ComboItem[];
  }[];
  couponId?: string;
  couponCode?: string;
  couponType?: CouponDiscountType;
  couponBasisPoints?: number;
  couponValue?: number;
  subtotal?: number;
  discount?: number;
  net?: number;
  surchargeBasisPoints?: number;
  surcharge?: number;
  cashReceived?: number;
  change?: number;
  total: number;
  payment: PaymentMethodName;
  delivery: DeliveryStatus;
  status: SaleStatus;
  cancelReason?: string;
}

export type PurchaseStatus = "Pendiente" | "Registrada" | "Anulada";

export interface Purchase {
  id: string;
  supplierId: string;
  date: string;
  items: { productId: string; name: string; qty: number; cost: number }[];
  total: number;
  status?: PurchaseStatus;
  cancelReason?: string;
}

export interface StockMovement {
  id: string;
  date: string;
  productId: string;
  productName: string;
  type: "Venta" | "Compra" | "Ajuste" | "Reverso";
  qty: number;
  sourceType?: string;
  sourceId?: string;
  note?: string;
  reversed?: boolean;
  reversalOf?: string;
}

export interface BusinessSettings {
  name: string;
  address: string;
  cuit: string;
  phone: string;
}

export interface ReceiptSettings {
  header: string;
  footer: string;
}

export interface CategorySetting {
  id: string;
  name: string;
}

export interface PaymentMethodSetting {
  id: string;
  name: string;
  enabled: boolean;
  surchargeBasisPoints: number;
  cashHandling: boolean;
}

export interface LocalSettings {
  business: BusinessSettings;
  receipt: ReceiptSettings;
  defaultMargin: number;
  comboTicketMode?: "ComboLine" | "ComboWithComponents";
  categories: CategorySetting[];
  paymentMethods: PaymentMethodSetting[];
}
