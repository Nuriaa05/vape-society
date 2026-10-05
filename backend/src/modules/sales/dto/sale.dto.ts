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

export class CreateSaleDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @IsString()
  @IsNotEmpty()
  paymentMethodId!: string;

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

export class CancelSaleDto {
  @IsOptional()
  @IsString()
  reason?: string | null;
}
