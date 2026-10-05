import { describe, expect, it } from "vitest";

import type {
  CouponSetting,
  PaymentMethodSetting,
  Product,
  Sale,
  CategorySetting,
} from "./contracts";
import {
  canDeleteCategory,
  canDeleteCoupon,
  canDeletePaymentMethod,
} from "./settings-delete-rules";

const category: CategorySetting = { id: "cat-1", name: "Helados" };
const method: PaymentMethodSetting = {
  id: "pm-1",
  name: "Efectivo",
  enabled: true,
  surchargeBasisPoints: 0,
  cashHandling: false,
};
const usedCoupon: CouponSetting = {
  id: "coupon-used",
  code: "VERANO10",
  discountType: "Percentage",
  discountBasisPoints: 1000,
  discountAmount: null,
  enabled: true,
};
const unusedCoupon: CouponSetting = {
  ...usedCoupon,
  id: "coupon-unused",
  code: "INVIERNO10",
};

const product = (input: Partial<Product>): Product => ({
  itemType: "Product",
  id: "p1",
  barcode: "7791",
  name: "Producto",
  categoryId: "other",
  category: "Hamburguesas",
  supplierId: "s1",
  cost: 1,
  marginPct: 1,
  price: 2,
  stock: 1,
  minStock: 1,
  ...input,
});

const sale = (input: Partial<Sale>): Sale => ({
  id: "s1",
  number: "000001",
  date: "2026-06-19T12:00:00.000Z",
  items: [],
  total: 0,
  payment: "Efectivo",
  delivery: "Entregado",
  status: "Confirmada",
  ...input,
});

describe("settings delete rules", () => {
  it("allows deleting only categories without associated products", () => {
    expect(canDeleteCategory(category, [])).toBe(true);
    expect(
      canDeleteCategory(category, [product({ categoryId: category.id })]),
    ).toBe(false);
  });

  it("allows deleting only payment methods without historical sales", () => {
    expect(canDeletePaymentMethod(method, [])).toBe(true);
    expect(
      canDeletePaymentMethod(method, [sale({ payment: method.name })]),
    ).toBe(false);
  });

  it("allows deleting only coupons without historical sales", () => {
    const sales = [sale({ couponId: usedCoupon.id, couponCode: "OLD-CODE" })];

    expect(canDeleteCoupon(usedCoupon, sales)).toBe(false);
    expect(canDeleteCoupon(unusedCoupon, sales)).toBe(true);
  });
});
