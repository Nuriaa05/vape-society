import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { BarcodeService } from "../src/domain/barcode.service";
import { CatalogService } from "../src/modules/catalog/catalog.service";
import { CombosService } from "../src/modules/combos/combos.service";
import { ProductsService } from "../src/modules/products/products.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("CatalogService", () => {
  let db: SeededTestDatabase;
  let catalog: CatalogService;
  let combos: CombosService;
  let products: ProductsService;

  beforeEach(async () => {
    db = await createSeededTestDatabase();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogService,
        CombosService,
        ProductsService,
        BarcodeService,
        {
          provide: PrismaService,
          useValue: db.prisma,
        },
      ],
    }).compile();

    catalog = moduleRef.get(CatalogService);
    combos = moduleRef.get(CombosService);
    products = moduleRef.get(ProductsService);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it("resolves scanner barcodes for products and combos through one endpoint service", async () => {
    const combo = await combos.create({
      name: "Combo Scanner",
      barcode: " 7799990000018 ",
      priceAmountCents: 500000,
      items: [{ productId: "p1", qty: 1 }],
    });

    await expect(catalog.findByBarcode(" 7790001000017 ")).resolves.toMatchObject({
      itemType: "Product",
      item: { id: "p1", barcode: "7790001000017" },
    });
    await expect(catalog.findByBarcode("7799990000018")).resolves.toMatchObject({
      itemType: "Combo",
      item: { id: combo.id, barcode: "7799990000018" },
    });
  });

  it("rejects product barcodes already used by combos", async () => {
    await combos.create({
      name: "Combo Barcode",
      barcode: "7799990000025",
      priceAmountCents: 500000,
      items: [{ productId: "p1", qty: 1 }],
    });

    await expect(
      products.create({
        barcode: " 7799990000025 ",
        name: "Producto repetido",
        categoryId: "c0",
        supplierId: "s1",
        costAmountCents: 100000,
        priceAmountCents: 150000,
        marginPct: 50,
        physicalStock: 1,
        minStock: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects unknown or blank barcodes", async () => {
    await expect(catalog.findByBarcode("   ")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(catalog.findByBarcode("7799999999999")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("resolves active products with a disabled legacy sale flag", async () => {
    await db.prisma.product.update({
      where: { id: "p1" },
      data: { saleEnabled: false },
    });

    await expect(catalog.findByBarcode("7790001000017")).resolves.toMatchObject({
      itemType: "Product",
      item: { id: "p1", archived: false },
    });
  });
});
