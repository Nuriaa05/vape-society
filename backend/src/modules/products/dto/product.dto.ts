import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateProductDto {
  @IsOptional()
  @IsString()
  barcode?: string | null;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @IsInt()
  @Min(0)
  costAmountCents!: number;

  @IsInt()
  @Min(0)
  priceAmountCents!: number;

  @IsInt()
  @Min(0)
  marginPct!: number;

  @IsInt()
  physicalStock!: number;

  @IsInt()
  @Min(0)
  minStock!: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  barcode?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  categoryId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  costAmountCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceAmountCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  marginPct?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;
}

export class ArchiveProductDto {
  @IsBoolean()
  archived!: boolean;
}
