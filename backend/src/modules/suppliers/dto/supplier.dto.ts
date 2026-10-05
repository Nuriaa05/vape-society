import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from "class-validator";

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== "")
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsDateString()
  lastPurchase?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== "")
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsDateString()
  lastPurchase?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateSupplierStatusDto {
  @IsBoolean()
  active!: boolean;
}
