import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import {
  type CouponDiscountType,
  CreateCouponDto,
  UpdateCouponDto,
} from "./dto/coupon.dto";

export type CouponResponse = {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountBasisPoints: number | null;
  discountAmountCents: number | null;
  enabled: boolean;
};

type CouponValues = Omit<CouponResponse, "id">;

const couponSelect = {
  id: true,
  code: true,
  discountType: true,
  discountBasisPoints: true,
  discountAmountCents: true,
  enabled: true,
} satisfies Prisma.CouponSelect;

type CouponRecord = Prisma.CouponGetPayload<{ select: typeof couponSelect }>;

export function normalizeCouponCode(value: string): string {
  return value.trim().toUpperCase();
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<CouponResponse[]> {
    const coupons = await this.prisma.coupon.findMany({
      orderBy: { code: "asc" },
      select: couponSelect,
    });

    return coupons.map((coupon) => this.serialize(coupon));
  }

  async create(dto: CreateCouponDto): Promise<CouponResponse> {
    const values = this.validateValues({
      code: normalizeCouponCode(dto.code),
      discountType: dto.discountType,
      discountBasisPoints: dto.discountBasisPoints ?? null,
      discountAmountCents: dto.discountAmountCents ?? null,
      enabled: dto.enabled ?? true,
    });

    try {
      const coupon = await this.prisma.coupon.create({
        data: {
          code: values.code,
          discountType: values.discountType,
          discountBasisPoints: values.discountBasisPoints,
          discountAmountCents: values.discountAmountCents,
          enabled: values.enabled,
        },
        select: couponSelect,
      });
      return this.serialize(coupon);
    } catch (error) {
      this.handleUniqueError(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateCouponDto): Promise<CouponResponse> {
    const current = await this.findById(id);
    const nextType = dto.discountType ?? current.discountType;
    const typeChanged = nextType !== current.discountType;
    const values = this.validateValues({
      code:
        dto.code === undefined
          ? current.code
          : normalizeCouponCode(dto.code),
      discountType: nextType,
      discountBasisPoints:
        dto.discountBasisPoints !== undefined
          ? dto.discountBasisPoints
          : typeChanged
            ? null
            : current.discountBasisPoints,
      discountAmountCents:
        dto.discountAmountCents !== undefined
          ? dto.discountAmountCents
          : typeChanged
            ? null
            : current.discountAmountCents,
      enabled: dto.enabled ?? current.enabled,
    });

    try {
      const coupon = await this.prisma.coupon.update({
        where: { id },
        data: {
          code: values.code,
          discountType: values.discountType,
          discountBasisPoints: values.discountBasisPoints,
          discountAmountCents: values.discountAmountCents,
          enabled: values.enabled,
        },
        select: couponSelect,
      });
      return this.serialize(coupon);
    } catch (error) {
      this.handleUniqueError(error);
      throw error;
    }
  }

  async delete(id: string): Promise<{ id: string; deleted: true }> {
    await this.findById(id);
    const salesCount = await this.prisma.sale.count({
      where: { couponId: id },
    });

    if (salesCount > 0) {
      throw new ConflictException(
        "No se puede eliminar el cupón porque tiene ventas asociadas.",
      );
    }

    await this.prisma.coupon.delete({ where: { id } });
    return { id, deleted: true };
  }

  async findEnabledByCode(
    code: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<CouponResponse> {
    const normalizedCode = normalizeCouponCode(code);
    const coupon = normalizedCode
      ? await client.coupon.findFirst({
          where: { code: normalizedCode, enabled: true },
          select: couponSelect,
        })
      : null;

    if (!coupon) {
      throw new BadRequestException("El cupón no existe o está inactivo.");
    }

    return this.serialize(coupon);
  }

  private async findById(id: string): Promise<CouponResponse> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      select: couponSelect,
    });

    if (!coupon) {
      throw new NotFoundException("Cupón no encontrado.");
    }

    return this.serialize(coupon);
  }

  private validateValues(values: CouponValues): CouponValues {
    if (!values.code) {
      throw new BadRequestException("El código del cupón es obligatorio.");
    }
    if (typeof values.enabled !== "boolean") {
      throw new BadRequestException("El estado del cupón es inválido.");
    }

    if (values.discountType === "Percentage") {
      if (
        !Number.isSafeInteger(values.discountBasisPoints) ||
        Number(values.discountBasisPoints) <= 0 ||
        Number(values.discountBasisPoints) > 10_000 ||
        values.discountAmountCents !== null
      ) {
        throw new BadRequestException(
          "El cupón porcentual requiere un porcentaje válido.",
        );
      }
      return values;
    }

    if (values.discountType === "FixedAmount") {
      if (
        !Number.isSafeInteger(values.discountAmountCents) ||
        Number(values.discountAmountCents) <= 0 ||
        values.discountBasisPoints !== null
      ) {
        throw new BadRequestException(
          "El cupón de monto fijo requiere un importe válido.",
        );
      }
      return values;
    }

    throw new BadRequestException("El tipo de cupón es inválido.");
  }

  private serialize(coupon: CouponRecord): CouponResponse {
    if (
      coupon.discountType !== "Percentage" &&
      coupon.discountType !== "FixedAmount"
    ) {
      throw new BadRequestException("La configuración del cupón es inválida.");
    }

    return {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountBasisPoints: coupon.discountBasisPoints,
      discountAmountCents: coupon.discountAmountCents,
      enabled: coupon.enabled,
    };
  }

  private handleUniqueError(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException("Ya existe un cupón con ese código.");
    }
  }
}
