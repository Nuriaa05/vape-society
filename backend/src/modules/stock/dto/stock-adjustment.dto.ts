import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export type StockAdjustmentType = "Ingreso" | "Egreso" | "ConteoFisico";

export class CreateStockAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsIn(["Ingreso", "Egreso", "ConteoFisico"])
  type!: StockAdjustmentType;

  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  physicalStock?: number;

  @IsOptional()
  @IsString()
  reason?: string | null;
}

export class ReverseStockMovementDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}
