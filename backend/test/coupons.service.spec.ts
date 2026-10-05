import { BadRequestException, ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { CouponsService } from "../src/modules/coupons/coupons.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("CouponsService", () => {
  let db: SeededTestDatabase;
  let service: CouponsService;

  beforeEach(async () => {
    db = await createSeededTestDatabase();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CouponsService,
        {
          provide: PrismaService,
          useValue: db.prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(CouponsService);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("creates and lists a normalized percentage coupon", async () => {
    const created = await service.create({
      code: " verano10 ",
      discountType: "Percentage",
      discountBasisPoints: 1_000,
    });

    expect(created).toMatchObject({
      code: "VERANO10",
      discountType: "Percentage",
      discountBasisPoints: 1_000,
      discountAmountCents: null,
      enabled: true,
    });
    await expect(service.findAll()).resolves.toContainEqual(created);
  });

  it("rejects a duplicate normalized code", async () => {
    await service.create({
      code: "verano10",
      discountType: "Percentage",
      discountBasisPoints: 1_000,
    });

    await expect(
      service.create({
        code: " VERANO10 ",
        discountType: "Percentage",
        discountBasisPoints: 1_000,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects incomplete or cross-type discount configuration", async () => {
    await expect(
      service.create({
        code: "MALCONFIGURADO",
        discountType: "FixedAmount",
        discountBasisPoints: 500,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create({
        code: "SINPORCENTAJE",
        discountType: "Percentage",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updates its type and rejects resolution after disabling it", async () => {
    const coupon = await service.create({
      code: "INVIERNO10",
      discountType: "Percentage",
      discountBasisPoints: 1_000,
    });

    const updated = await service.update(coupon.id, {
      code: " invierno fijo ",
      discountType: "FixedAmount",
      discountAmountCents: 250_000,
      enabled: false,
    });

    expect(updated).toEqual({
      id: coupon.id,
      code: "INVIERNO FIJO",
      discountType: "FixedAmount",
      discountBasisPoints: null,
      discountAmountCents: 250_000,
      enabled: false,
    });
    await expect(
      service.findEnabledByCode("invierno fijo"),
    ).rejects.toThrow("El cupón no existe o está inactivo.");
  });

  it("deletes only coupons without historical sales", async () => {
    const unused = await service.create({
      code: "SINUSO",
      discountType: "FixedAmount",
      discountAmountCents: 100_000,
    });

    await expect(service.delete(unused.id)).resolves.toEqual({
      id: unused.id,
      deleted: true,
    });
    await expect(
      db.prisma.coupon.findUnique({ where: { id: unused.id } }),
    ).resolves.toBeNull();

    const used = await service.create({
      code: "USADO",
      discountType: "Percentage",
      discountBasisPoints: 500,
    });
    await db.prisma.sale.create({
      data: {
        number: "990030",
        deliveryStatus: "Entregado",
        status: "Confirmada",
        paymentMethodId: "pm1",
        couponId: used.id,
        subtotalAmountCents: 100_000,
        totalAmountCents: 95_000,
      },
    });

    await expect(service.delete(used.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
