import { apiClient } from "@/lib/api-client";
import type { CouponDiscountType, CouponSetting } from "@/lib/contracts";
import {
  amountCentsToPesos,
  parsePesosToAmountCents,
  pesosToAmountCents,
} from "@/lib/money";

type ApiCoupon = {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountBasisPoints: number | null;
  discountAmountCents: number | null;
  enabled: boolean;
};

type VisibleAmountInput = string | number | null;

export type CreateCouponInput = {
  code: string;
  discountType: CouponDiscountType;
  discountBasisPoints?: number | null;
  discountAmount?: VisibleAmountInput;
  enabled?: boolean;
};

export type UpdateCouponInput = Partial<CreateCouponInput>;

function toCoupon(coupon: ApiCoupon): CouponSetting {
  return {
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType,
    discountBasisPoints: coupon.discountBasisPoints,
    discountAmount:
      coupon.discountAmountCents === null
        ? null
        : amountCentsToPesos(coupon.discountAmountCents),
    enabled: coupon.enabled,
  };
}

function toAmountCents(value: Exclude<VisibleAmountInput, null>): number {
  return typeof value === "string"
    ? parsePesosToAmountCents(value)
    : pesosToAmountCents(value);
}

function toApiInput(input: CreateCouponInput | UpdateCouponInput) {
  const { discountAmount, ...rest } = input;
  return {
    ...rest,
    ...(discountAmount !== undefined
      ? {
          discountAmountCents:
            discountAmount === null ? null : toAmountCents(discountAmount),
        }
      : {}),
  };
}

export const couponsRepository = {
  async findAll(): Promise<CouponSetting[]> {
    const coupons = await apiClient.get<ApiCoupon[]>("/coupons");
    return coupons.map(toCoupon);
  },

  async create(input: CreateCouponInput): Promise<CouponSetting> {
    return toCoupon(
      await apiClient.post<ApiCoupon>("/coupons", toApiInput(input)),
    );
  },

  async update(id: string, input: UpdateCouponInput): Promise<CouponSetting> {
    return toCoupon(
      await apiClient.patch<ApiCoupon>(`/coupons/${id}`, toApiInput(input)),
    );
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/coupons/${id}`);
  },
};
