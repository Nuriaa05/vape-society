import type {
  CategorySetting,
  CouponSetting,
  PaymentMethodSetting,
  Product,
  Sale,
} from "@/lib/contracts";

export function canDeleteCategory(
  category: CategorySetting,
  products: Product[],
): boolean {
  return !products.some(
    (product) =>
      product.categoryId === category.id || product.category === category.name,
  );
}

export function canDeletePaymentMethod(
  method: PaymentMethodSetting,
  sales: Sale[],
): boolean {
  return !sales.some((sale) => sale.payment === method.name);
}

export function canDeleteCoupon(coupon: CouponSetting, sales: Sale[]): boolean {
  return !sales.some((sale) => sale.couponId === coupon.id);
}
