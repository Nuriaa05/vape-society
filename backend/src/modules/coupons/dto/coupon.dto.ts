import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export type CouponDiscountType = "Percentage" | "FixedAmount";

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsIn(["Percentage", "FixedAmount"])
  discountType!: CouponDiscountType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  discountBasisPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  discountAmountCents?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateCouponDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

  @IsOptional()
  @IsIn(["Percentage", "FixedAmount"])
  discountType?: CouponDiscountType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  discountBasisPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  discountAmountCents?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
