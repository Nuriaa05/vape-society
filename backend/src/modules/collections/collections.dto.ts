import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { CardSettlementDto } from "../sales/dto/sale.dto";

export class CardScheduleDto {
  @IsString() @IsNotEmpty() @MaxLength(128) operationId!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => CardSettlementDto) settlements!: CardSettlementDto[];
}

export class FinanceQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}$/) month?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() includeInactive?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) take?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) skip?: number;
}
export class CreateCustomerDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}
export class UpdateCustomerDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class OpeningBalanceDto {
  @IsString() @IsNotEmpty() @MaxLength(128) operationId!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsInt() @Min(1) totalAmountCents!: number;
  @IsInt() @Min(1) @Max(120) installmentCount!: number;
  @IsString() firstDueDate!: string;
}
export class ReasonDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}
export class AllocationDto {
  @IsString() @IsNotEmpty() installmentId!: string;
  @IsInt() @Min(1) amountCents!: number;
}
export class CreateCollectionDto {
  @IsString() @IsNotEmpty() @MaxLength(128) operationId!: string;
  @IsString() @IsNotEmpty() customerId!: string;
  @IsString() date!: string;
  @IsString() @IsNotEmpty() paymentMethodId!: string;
  @IsInt() @Min(1) amountCents!: number;
  @IsOptional() @IsInt() @Min(0) cashReceivedAmountCents?: number;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations!: AllocationDto[];
}
export class AccreditationDto {
  @IsString() @IsNotEmpty() @MaxLength(128) operationId!: string;
  @IsString() date!: string;
  @IsInt() @Min(1) grossAmountCents!: number;
  @IsInt() @Min(0) feeAmountCents!: number;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
}
export class RefundCancellationDto {
  @IsString() @IsNotEmpty() settlementId!: string;
  @IsInt() @Min(1) grossAmountCents!: number;
}
export class CreateRefundDto {
  @IsString() @IsNotEmpty() @MaxLength(128) operationId!: string;
  @IsOptional() @IsString() @IsNotEmpty() saleId?: string;
  @IsOptional() @IsString() @IsNotEmpty() planId?: string;
  @IsString() date!: string;
  @IsInt() @Min(1) amountCents!: number;
  @IsInt() @Min(0) cashOutAmountCents!: number;
  @IsOptional() @IsString() @IsNotEmpty() paymentMethodId?: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RefundCancellationDto)
  cancellations?: RefundCancellationDto[];
}
