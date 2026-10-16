import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class CreatePurchaseItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsInt()
  @Min(1)
  unitCostAmountCents!: number;
}

export class PurchaseFinancingDto {
  @IsOptional()
  @IsString()
  operationId?: string;

  @IsOptional()
  @IsIn(["Pagada", "Credito"])
  paymentCondition?: "Pagada" | "Credito";

  @IsOptional()
  @IsString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  paymentDate?: string | null;

  @IsOptional()
  @IsIn(["Efectivo", "Transferencia", "QR"])
  paymentMethod?: string | null;

  @IsOptional()
  @IsString()
  paymentReference?: string | null;
}

export class CreatePurchaseDto extends PurchaseFinancingDto {
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsIn(["Pendiente", "Registrada"])
  status!: "Pendiente" | "Registrada";

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items!: CreatePurchaseItemDto[];
}

export class UpdatePurchaseDto extends PurchaseFinancingDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  supplierId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items?: CreatePurchaseItemDto[];
}

export class CancelPurchaseDto {
  @IsOptional()
  @IsString()
  reason?: string | null;
}
