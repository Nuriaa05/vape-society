import {
  IsBoolean,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class UpdateBusinessSettingsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  address?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cuit?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone?: string;
}

export class UpdateReceiptSettingsDto {
  @IsOptional()
  @IsString()
  header?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  footer?: string;
}

export class UpdateDefaultMarginDto {
  @IsInt()
  @Min(0)
  defaultMarginPct!: number;
}

export class UpdateComboTicketModeDto {
  @IsIn(["ComboLine", "ComboWithComponents"])
  comboTicketMode!: "ComboLine" | "ComboWithComponents";
}

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreatePaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  surchargeBasisPoints?: number;

  @IsOptional()
  @IsBoolean()
  cashHandling?: boolean;
}

export class UpdatePaymentMethodDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  surchargeBasisPoints?: number;

  @IsOptional()
  @IsBoolean()
  cashHandling?: boolean;
}
