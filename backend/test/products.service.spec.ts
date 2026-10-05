import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { BarcodeService } from "../src/domain/barcode.service";
import { ProductsService } from "../src/modules/products/products.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("ProductsService", () => {
  let db: SeededTestDatabase;
  let service: ProductsService;

  beforeEach(async () => {
    db = await createSeededTestDatabase();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        BarcodeService,
        {
          provide: PrismaService,
          useValue: db.prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("finds an active product by barcode with amountCents fields", async () => {
    const product = await service.findByBarcode("7790001000017");

    expect(product).toMatchObject({
      barcode: "7790001000017",
      name: "Hamburguesas de carne x4",
      costAmountCents: 185000,
      priceAmountCents: 268000,
      physicalStock: 24,
      minStock: 5,
      archived: false,
      category: {
        id: "c0",
        name: "Hamburguesas",
      },
      supplier: {
        id: "s1",
        name: "Frigorífico La Pampa",
      },
    });
  });

  it("excludes archived products from active lists and barcode lookup", async () => {
    await db.prisma.product.update({
      where: { id: "p1" },
      data: { archived: true },
    });

    const activeProducts = await service.findAll({});
    expect(activeProducts.some((product) => product.id === "p1")).toBe(false);

    const allProducts = await service.findAll({ includeArchived: true });
    expect(allProducts.some((product) => product.id === "p1")).toBe(true);

    await expect(service.findByBarcode("7790001000017")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("archives and restores products without deleting history", async () => {
    const archived = await service.setArchived("p1", { archived: true });
    expect(archived.archived).toBe(true);

    const restored = await service.setArchived("p1", { archived: false });
    expect(restored.archived).toBe(false);

    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } }),
    ).resolves.toMatchObject({ archived: false });
  });

  it("audits initial stock when creating a product with physical stock", async () => {
    const product = await service.create({
      barcode: "7791293044507",
      name: "Burga",
      categoryId: "c0",
      supplierId: "s1",
      costAmountCents: 100000,
      priceAmountCents: 150000,
      marginPct: 50,
      physicalStock: 7,
      minStock: 2,
    });

    await expect(
      db.prisma.stockMovement.findFirstOrThrow({
        where: { productId: product.id },
      }),
    ).resolves.toMatchObject({
      productId: product.id,
      type: "Ajuste",
      sourceType: "ProductInitialStock",
      sourceId: product.id,
      physicalDelta: 7,
      note: "Stock inicial del producto",
    });
  });

  it("creates products without barcode and allows negative initial stock with audit movement", async () => {
    const product = await service.create({
      barcode: "",
      name: "Producto sin codigo",
      categoryId: "c0",
      supplierId: "s1",
      costAmountCents: 100000,
      priceAmountCents: 150000,
      marginPct: 50,
      physicalStock: -3,
      minStock: 2,
    });

    expect(product).toMatchObject({
      barcode: null,
      physicalStock: -3,
    });
    await expect(
      db.prisma.stockMovement.findFirstOrThrow({
        where: { productId: product.id },
      }),
    ).resolves.toMatchObject({
      productId: product.id,
      type: "Ajuste",
      sourceType: "ProductInitialStock",
      sourceId: product.id,
      physicalDelta: -3,
      note: "Stock inicial del producto",
    });
  });
});
