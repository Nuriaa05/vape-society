import { Test } from "@nestjs/testing";
import { ConflictException } from "@nestjs/common";

import { SettingsService } from "../src/modules/settings/settings.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("SettingsService", () => {
  let db: SeededTestDatabase;
  let service: SettingsService;

  beforeEach(async () => {
    db = await createSeededTestDatabase();

    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: PrismaService,
          useValue: db.prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(SettingsService);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("loads frontend settings without raw user or auth state", async () => {
    const settings = await service.getSettings();

    expect(settings).toMatchObject({
      business: {
        name: "Lozano Congelados",
        cuit: "30-12345678-9",
      },
      receipt: {
        header: "LOZANO CONGELADOS - Congelados de calidad",
      },
      defaultMarginPct: 45,
      defaultMargin: 45,
    });
    expect(settings.categories).toHaveLength(9);
    expect(settings.paymentMethods).toHaveLength(7);
    expect(settings.paymentMethods[0]).toEqual(
      expect.objectContaining({
        surchargeBasisPoints: expect.any(Number),
        cashHandling: expect.any(Boolean),
      }),
    );
  });

  it("persists default margin updates", async () => {
    await service.updateDefaultMargin({ defaultMarginPct: 52 });

    await expect(service.getSettings()).resolves.toMatchObject({
      defaultMarginPct: 52,
      defaultMargin: 52,
    });
  });

  it("deletes categories only when they have no products", async () => {
    const unused = await service.createCategory({ name: "Sin productos" });

    await expect(service.deleteCategory(unused.id)).resolves.toEqual({
      id: unused.id,
      deleted: true,
    });
    await expect(
      db.prisma.category.findUnique({ where: { id: unused.id } }),
    ).resolves.toBeNull();

    await expect(service.deleteCategory("c0")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("deletes payment methods only when they have no historical sales", async () => {
    const unused = await service.createPaymentMethod({ name: "Vale" });
    expect(unused).toMatchObject({
      surchargeBasisPoints: 0,
      cashHandling: false,
    });

    await expect(service.deletePaymentMethod(unused.id)).resolves.toEqual({
      id: unused.id,
      deleted: true,
    });
    await expect(
      db.prisma.paymentMethod.findUnique({ where: { id: unused.id } }),
    ).resolves.toBeNull();

    await db.prisma.sale.create({
      data: {
        number: "990010",
        deliveryStatus: "Entregado",
        status: "Confirmada",
        paymentMethodId: "pm1",
        subtotalAmountCents: 1000,
        totalAmountCents: 1000,
      },
    });

    await expect(service.deletePaymentMethod("pm1")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("persists payment surcharge and cash-handling configuration", async () => {
    const created = await service.createPaymentMethod({
      name: "Pago local",
      surchargeBasisPoints: 175,
      cashHandling: true,
    });

    expect(created).toMatchObject({
      surchargeBasisPoints: 175,
      cashHandling: true,
    });

    await expect(
      service.updatePaymentMethod(created.id, {
        surchargeBasisPoints: 250,
        cashHandling: false,
      }),
    ).resolves.toMatchObject({
      surchargeBasisPoints: 250,
      cashHandling: false,
    });
  });
});
