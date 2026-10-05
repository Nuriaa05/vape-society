import { BadRequestException, ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { BarcodeService } from "../src/domain/barcode.service";
import { CombosService } from "../src/modules/combos/combos.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("CombosService", () => {
  let db: SeededTestDatabase;
  let service: CombosService;

  beforeEach(async () => {
    db = await createSeededTestDatabase();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CombosService,
        BarcodeService,
        {
          provide: PrismaService,
          useValue: db.prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(CombosService);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("creates combos with normalized optional barcode and computed discount", async () => {
    const combo = await service.create({
      name: "Combo Burger",
      barcode: " 7799990000001 ",
      priceAmountCents: 600000,
      items: [
        { productId: "p1", qty: 1 },
        { productId: "p3", qty: 2 },
      ],
    });

    expect(combo).toMatchObject({
      name: "Combo Burger",
      barcode: "7799990000001",
      priceAmountCents: 600000,
      productsTotalAmountCents: 718000,
      discountAmountCents: 118000,
      archived: false,
    });
    expect(combo.items).toEqual([
      expect.objectContaining({ productId: "p1", qty: 1 }),
      expect.objectContaining({ productId: "p3", qty: 2 }),
    ]);
  });

  it("rejects combos without products or with archived products", async () => {
    await expect(
      service.create({
        name: "Combo vacio",
        priceAmountCents: 100000,
        items: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await db.prisma.product.update({
      where: { id: "p1" },
      data: { archived: true },
    });

    await expect(
      service.create({
        name: "Combo archivado",
        priceAmountCents: 100000,
        items: [{ productId: "p1", qty: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("enforces global barcode uniqueness against products", async () => {
    await expect(
      service.create({
        name: "Combo con barcode repetido",
        barcode: "7790001000017",
        priceAmountCents: 100000,
        items: [{ productId: "p1", qty: 1 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("edits combos without changing archived state", async () => {
    const combo = await service.create({
      name: "Combo original",
      priceAmountCents: 600000,
      items: [{ productId: "p1", qty: 1 }],
    });

    const updated = await service.update(combo.id, {
      name: "Combo editado",
      priceAmountCents: 700000,
      items: [{ productId: "p3", qty: 2 }],
    });

    expect(updated).toMatchObject({
      id: combo.id,
      name: "Combo editado",
      priceAmountCents: 700000,
      archived: false,
    });
    expect(updated.items).toEqual([
      expect.objectContaining({ productId: "p3", qty: 2 }),
    ]);
  });
});
