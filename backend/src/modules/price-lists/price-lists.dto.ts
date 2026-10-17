import { Type } from "class-transformer";
import {
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
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { CreateSaleItemDto } from "../sales/dto/sale.dto";

export class PriceCellDto {
  @IsIn(["Product", "Combo"])
  itemType!: "Product" | "Combo";
  @IsString()
  @IsNotEmpty()
  itemId!: string;
  @IsInt()
  @Min(0)
  @Max(2147483647)
  priceAmountCents!: number;
}
export class PriceTierDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  minimumQty!: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceCellDto)
  prices!: PriceCellDto[];
}
export class CreatePriceListDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceTierDto)
  tiers!: PriceTierDto[];
}
export class UpdatePriceListDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  active?: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceTierDto)
  tiers?: PriceTierDto[];
}
export class DuplicatePriceListDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
export class CatalogPriceItemDto {
  @IsIn(["Product", "Combo"])
  itemType!: "Product" | "Combo";
  @IsString()
  @IsNotEmpty()
  itemId!: string;
}
export class PreviewPriceListDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerId?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogPriceItemDto)
  catalogItems?: CatalogPriceItemDto[];
}
