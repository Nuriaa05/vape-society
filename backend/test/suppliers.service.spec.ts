import { ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { SuppliersService } from "../src/modules/suppliers/suppliers.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("SuppliersService", () => {
  let db: SeededTestDatabase;
  let service: SuppliersService;

  beforeEach(async () => {
    db = await createSeededTestDatabase();

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuppliersService,
        {
          provide: PrismaService,
          useValue: db.prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(SuppliersService);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("can list only active suppliers", async () => {
    const suppliers = await service.findAll({ activeOnly: true });

    expect(suppliers.map((supplier) => supplier.id)).toContain("s1");
    expect(suppliers.map((supplier) => supplier.id)).not.toContain("s4");
  });

  it("updates supplier active status", async () => {
    const updated = await service.updateStatus("s2", { active: false });

    expect(updated).toMatchObject({ id: "s2", active: false });

    const activeSuppliers = await service.findAll({ activeOnly: true });
    expect(activeSuppliers.map((supplier) => supplier.id)).not.toContain("s2");
  });

  it("creates suppliers without forcing a placeholder email", async () => {
    const created = await service.create({
      name: "Proveedor sin email",
      phone: "-",
      active: true,
    });

    expect(created).toMatchObject({
      name: "Proveedor sin email",
      email: "",
    });
  });

  it("persists a manually entered last purchase date on create and update", async () => {
    const created = await service.create({
      name: "Proveedor con fecha manual",
      phone: "-",
      lastPurchase: "2026-08-01",
    });

    expect(created.lastPurchase).toBe("2026-08-01");

    const updated = await service.update(created.id, {
      lastPurchase: "2026-08-02",
    });

    expect(updated.lastPurchase).toBe("2026-08-02");
  });

  it("keeps the Local supplier protected from deactivation", async () => {
    await db.prisma.supplier.create({
      data: {
        id: "local",
        name: "Local",
        phone: "-",
        email: "",
        active: true,
      },
    });

    await expect(
      service.updateStatus("local", { active: false }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.update("local", { name: "Otro nombre" }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      db.prisma.supplier.findUniqueOrThrow({ where: { id: "local" } }),
    ).resolves.toMatchObject({ active: true });
  });
});
