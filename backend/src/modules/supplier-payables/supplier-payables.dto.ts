import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class SupplierPayablesQueryDto {
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional()
  @IsIn(["Pendiente", "Vencida", "Pagada", "Anulada"])
  status?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) take?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
}

export class SupplierOpeningDto {
  @IsString() @IsNotEmpty() @MaxLength(128) operationId!: string;
  @IsString() @IsNotEmpty() supplierId!: string;
  @IsString() @IsNotEmpty() @MaxLength(300) title!: string;
  @IsInt() @Min(1) amountCents!: number;
  @IsString() dueDate!: string;
}

export class SupplierPaymentDto {
  @IsString() @IsNotEmpty() @MaxLength(128) operationId!: string;
  @IsString() date!: string;
  @IsIn(["Efectivo", "Transferencia", "QR"]) method!: string;
  @IsOptional() @IsString() @MaxLength(300) reference?: string;
}

export class SupplierReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}
