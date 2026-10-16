import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class ListSalesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

export class CreateSaleItemDto {
  @IsOptional()
  @IsIn(["Product", "Combo"])
  itemType?: "Product" | "Combo";

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  itemId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  productId?: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

export class DirectPlanDto {
  @IsInt() @Min(1) @Max(120) installmentCount!: number;
  @IsString() firstDueDate!: string;
  @IsOptional() @IsInt() @Min(0) @Max(100000) surchargeBasisPoints?: number;
  @IsOptional() @IsInt() @Min(0) upfrontAmountCents?: number;
  @IsOptional() @IsString() @IsNotEmpty() upfrontPaymentMethodId?: string;
  @IsOptional() @IsInt() @Min(0) upfrontCashReceivedAmountCents?: number;
}

export class CardSettlementDto {
  @IsString() dueDate!: string;
  @IsInt() @Min(1) grossAmountCents!: number;
  @IsInt() @Min(0) feeAmountCents!: number;
}

export class CardPlanDto {
  @IsInt() @Min(1) @Max(120) installmentCount!: number;
  @IsString() @IsNotEmpty() @MaxLength(100) processor!: string;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CardSettlementDto)
  settlements?: CardSettlementDto[];
}

export class CreateSaleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerId?: string;

  @IsOptional()
  @IsIn(["Immediate", "DirectInstallments", "CardInstallments"])
  paymentTerms?: "Immediate" | "DirectInstallments" | "CardInstallments";

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  operationId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DirectPlanDto)
  directPlan?: DirectPlanDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CardPlanDto)
  cardPlan?: CardPlanDto;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  paymentMethodId?: string;

  @IsIn(["Pendiente", "Entregado"])
  deliveryStatus!: "Pendiente" | "Entregado";

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  couponCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  cashReceivedAmountCents?: number;

  @IsOptional()
  @IsBoolean()
  allowNegativeStock?: boolean;
}

export class QuoteSaleDto extends CreateSaleDto {
  @IsOptional()
  @IsBoolean()
  pricingOnly?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  directSurchargeBasisPoints?: number;
}

export class CancelSaleDto {
  @IsOptional()
  @IsString()
  reason?: string | null;
}
