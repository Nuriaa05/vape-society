import { BadRequestException, ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { ReceiptNumberService } from "../src/domain/receipt-number.service";
import { StockRulesService } from "../src/domain/stock-rules.service";
import { TotalsService } from "../src/domain/totals.service";
import { CouponsService } from "../src/modules/coupons/coupons.service";
import { SalesService } from "../src/modules/sales/sales.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  type SeededTestDatabase,
} from "./prisma-test-database";

describe("SalesService", () => {
  let db: SeededTestDatabase;
  let service: SalesService;

  beforeEach(async () => {
    db = await createSeededTestDatabase();

    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesService,
        CouponsService,
        StockRulesService,
        TotalsService,
        ReceiptNumberService,
        {
          provide: PrismaService,
          useValue: db.prisma,
        },
      ],
    }).compile();

    service = moduleRef.get(SalesService);
  });

  afterEach(async () => {
    await db.cleanup();
  });

  it.each([
    {
      label: "both customer fields",
      customer: {
        customerName: "  María López  ",
        customerPhone: "  +54 9 362 412-3456  ",
      },
      expected: {
        customerName: "María López",
        customerPhone: "+54 9 362 412-3456",
      },
    },
    {
      label: "only a name",
      customer: { customerName: "María López" },
      expected: { customerName: "María López", customerPhone: null },
    },
    {
      label: "only a phone",
      customer: { customerPhone: "+54 9 362 412-3456" },
      expected: { customerName: null, customerPhone: "+54 9 362 412-3456" },
    },
    {
      label: "no customer details",
      customer: {},
      expected: { customerName: null, customerPhone: null },
    },
    {
      label: "blank customer details",
      customer: { customerName: "  ", customerPhone: "  " },
      expected: { customerName: null, customerPhone: null },
    },
  ])(
    "persists and reloads a sale with $label",
    async ({ customer, expected }) => {
      const input = {
        deliveryStatus: "Pendiente" as const,
        paymentMethodId: "pm2",
        items: [{ productId: "p3", qty: 1 }],
        ...customer,
      };
      const sale = await service.create(input);

      expect(sale).toMatchObject(expected);
      await expect(
        db.prisma.sale.findUniqueOrThrow({ where: { id: sale.id } }),
      ).resolves.toMatchObject(expected);
      await expect(service.findById(sale.id)).resolves.toMatchObject(expected);
      await expect(service.findAll()).resolves.toEqual([
        expect.objectContaining({ id: sale.id, ...expected }),
      ]);
      await expect(service.getReceiptData(sale.id)).resolves.toMatchObject({
        sale: expected,
      });
      await expect(service.deliver(sale.id)).resolves.toMatchObject(expected);
      await expect(service.cancel(sale.id, {})).resolves.toMatchObject(
        expected,
      );
    },
  );

  it("creates a pending sale, aggregates repeated lines, and reserves without changing physical stock", async () => {
    const sale = await service.create({
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm2",
      items: [
        { productId: "p1", qty: 2 },
        { productId: "p1", qty: 3 },
      ],
    });

    expect(sale).toMatchObject({
      number: "000001",
      deliveryStatus: "Pendiente",
      status: "Confirmada",
      subtotalAmountCents: 1340000,
      totalAmountCents: 1340000,
    });
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0]).toMatchObject({
      productId: "p1",
      qty: 5,
      unitPriceAmountCents: 268000,
      lineTotalAmountCents: 1340000,
    });

    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } }),
    ).resolves.toMatchObject({ physicalStock: 24 });

    await expect(db.prisma.stockMovement.count()).resolves.toBe(0);
  });

  it("rejects new sales against available stock, not physical stock", async () => {
    await service.create({
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm2",
      items: [{ productId: "p1", qty: 23 }],
    });

    await expect(
      service.create({
        deliveryStatus: "Entregado",
        paymentMethodId: "pm2",
        items: [{ productId: "p1", qty: 2 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows confirmed negative stock sales only when explicitly requested", async () => {
    await db.prisma.product.update({
      where: { id: "p1" },
      data: { physicalStock: 0 },
    });

    await expect(
      service.create({
        deliveryStatus: "Entregado",
        paymentMethodId: "pm2",
        items: [{ productId: "p1", qty: 3 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const sale = await service.create({
      deliveryStatus: "Entregado",
      paymentMethodId: "pm2",
      items: [{ productId: "p1", qty: 3 }],
      allowNegativeStock: true,
    });

    expect(sale.items[0]).toMatchObject({ productId: "p1", qty: 3 });
    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } }),
    ).resolves.toMatchObject({ physicalStock: -3 });
  });

  it("rejects new sales for archived products", async () => {
    await db.prisma.product.update({
      where: { id: "p1" },
      data: { archived: true },
    });

    await expect(
      service.create({
        deliveryStatus: "Entregado",
        paymentMethodId: "pm2",
        items: [{ productId: "p1", qty: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects direct sales for sale-disabled products", async () => {
    await db.prisma.product.update({
      where: { id: "p1" },
      data: { saleEnabled: false },
    });

    await expect(
      service.create({
        deliveryStatus: "Entregado",
        paymentMethodId: "pm2",
        items: [{ productId: "p1", qty: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates a delivered sale, decreases physical stock, and writes stock movements", async () => {
    const sale = await service.create({
      deliveryStatus: "Entregado",
      paymentMethodId: "pm2",
      items: [{ productId: "p3", qty: 4 }],
    });

    expect(sale.number).toBe("000001");
    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p3" } }),
    ).resolves.toMatchObject({ physicalStock: 28 });

    await expect(db.prisma.stockMovement.findMany()).resolves.toEqual([
      expect.objectContaining({
        productId: "p3",
        type: "Venta",
        sourceType: "Sale",
        sourceId: sale.id,
        physicalDelta: -4,
      }),
    ]);
  });

  it("sells combos from a snapshot and discounts component stock without exposing component prices", async () => {
    const combo = await db.prisma.combo.create({
      data: {
        id: "combo-burger",
        name: "Combo Burger",
        barcode: "7799990000032",
        priceAmountCents: 600000,
        items: {
          create: [
            { productId: "p1", qty: 1 },
            { productId: "p3", qty: 2 },
          ],
        },
      },
    });

    const sale = await service.create({
      deliveryStatus: "Entregado",
      paymentMethodId: "pm2",
      items: [{ itemType: "Combo", itemId: combo.id, qty: 2 }],
    });

    expect(sale).toMatchObject({
      totalAmountCents: 1200000,
      items: [
        expect.objectContaining({
          itemType: "Combo",
          comboId: combo.id,
          productId: null,
          name: "Combo Burger",
          qty: 2,
          unitPriceAmountCents: 600000,
          lineTotalAmountCents: 1200000,
          comboDiscountAmountCents: 236000,
        }),
      ],
    });
    expect(sale.items[0].components).toEqual([
      expect.objectContaining({
        productId: "p1",
        name: "Hamburguesas de carne x4",
        qty: 2,
      }),
      expect.objectContaining({
        productId: "p3",
        name: "Papas prefritas baston 1kg",
        qty: 4,
      }),
    ]);
    expect(sale.items[0].components[0]).not.toHaveProperty(
      "unitPriceAmountCents",
    );

    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } }),
    ).resolves.toMatchObject({ physicalStock: 22 });
    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p3" } }),
    ).resolves.toMatchObject({ physicalStock: 28 });
  });

  it("keeps combo sale history stable after editing the combo", async () => {
    const combo = await db.prisma.combo.create({
      data: {
        id: "combo-history",
        name: "Combo Historico",
        priceAmountCents: 600000,
        items: {
          create: [{ productId: "p1", qty: 1 }],
        },
      },
    });
    const sale = await service.create({
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm2",
      items: [{ itemType: "Combo", itemId: combo.id, qty: 1 }],
    });

    await db.prisma.combo.update({
      where: { id: combo.id },
      data: {
        name: "Combo Editado",
        priceAmountCents: 900000,
        items: {
          deleteMany: {},
          create: [{ productId: "p3", qty: 3 }],
        },
      },
    });

    const receipt = await service.getReceiptData(sale.id);

    expect(receipt.items[0]).toMatchObject({
      itemType: "Combo",
      comboId: combo.id,
      name: "Combo Historico",
      unitPriceAmountCents: 600000,
    });
    expect(receipt.items[0].components).toEqual([
      expect.objectContaining({
        productId: "p1",
        name: "Hamburguesas de carne x4",
        qty: 1,
      }),
    ]);
  });

  it("delivers a pending sale exactly once and removes the reservation", async () => {
    const sale = await service.create({
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm2",
      items: [{ productId: "p5", qty: 3 }],
    });

    await service.deliver(sale.id);

    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p5" } }),
    ).resolves.toMatchObject({ physicalStock: 11 });

    await expect(service.deliver(sale.id)).rejects.toBeInstanceOf(
      ConflictException,
    );

    await expect(db.prisma.stockMovement.count()).resolves.toBe(1);
    await expect(
      db.prisma.sale.findUniqueOrThrow({ where: { id: sale.id } }),
    ).resolves.toMatchObject({ deliveryStatus: "Entregado" });
  });

  it("allows delivery to make physical stock negative after the sale was reserved", async () => {
    const sale = await service.create({
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm2",
      items: [{ productId: "p8", qty: 3 }],
    });
    await db.prisma.product.update({
      where: { id: "p8" },
      data: { physicalStock: 2 },
    });

    await service.deliver(sale.id);

    await expect(
      db.prisma.sale.findUniqueOrThrow({ where: { id: sale.id } }),
    ).resolves.toMatchObject({ deliveryStatus: "Entregado" });
    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p8" } }),
    ).resolves.toMatchObject({ physicalStock: -1 });
  });

  it("cancels pending sales without changing physical stock", async () => {
    const sale = await service.create({
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm2",
      items: [{ productId: "p2", qty: 4 }],
    });

    await service.cancel(sale.id, { reason: "Cliente cancela" });

    await expect(
      db.prisma.sale.findUniqueOrThrow({ where: { id: sale.id } }),
    ).resolves.toMatchObject({
      status: "Anulada",
      cancelReason: "Cliente cancela",
    });
    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p2" } }),
    ).resolves.toMatchObject({ physicalStock: 18 });
    await expect(db.prisma.stockMovement.count()).resolves.toBe(0);
  });

  it("releases combo component reservations when a pending combo sale is cancelled", async () => {
    const combo = await db.prisma.combo.create({
      data: {
        id: "combo-pending-cancel",
        name: "Combo Pendiente",
        priceAmountCents: 600000,
        items: {
          create: [
            { productId: "p1", qty: 1 },
            { productId: "p3", qty: 2 },
          ],
        },
      },
    });

    const sale = await service.create({
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm2",
      items: [{ itemType: "Combo", itemId: combo.id, qty: 2 }],
    });

    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p1" } }),
    ).resolves.toMatchObject({ physicalStock: 24 });
    await service.cancel(sale.id, { reason: "" });
    const reserved = await new StockRulesService(
      db.prisma as unknown as PrismaService,
    ).getReservedStockByProductIds(["p1", "p3"]);

    expect(reserved.get("p1") ?? 0).toBe(0);
    expect(reserved.get("p3") ?? 0).toBe(0);
  });

  it("normalizes empty sale cancellation reason to null", async () => {
    const sale = await service.create({
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm2",
      items: [{ productId: "p2", qty: 1 }],
    });

    const cancelled = await service.cancel(sale.id, { reason: "" });

    expect(cancelled).toMatchObject({
      status: "Anulada",
      cancelReason: null,
    });
  });

  it("cancels delivered sales, restores physical stock, and writes reversal movements", async () => {
    const sale = await service.create({
      deliveryStatus: "Entregado",
      paymentMethodId: "pm2",
      items: [{ productId: "p7", qty: 2 }],
    });

    await service.cancel(sale.id, { reason: "Error de carga" });

    await expect(
      db.prisma.product.findUniqueOrThrow({ where: { id: "p7" } }),
    ).resolves.toMatchObject({ physicalStock: 21 });

    await expect(db.prisma.stockMovement.findMany()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: "p7", physicalDelta: -2 }),
        expect.objectContaining({
          productId: "p7",
          type: "Reverso",
          sourceType: "Sale",
          sourceId: sale.id,
          physicalDelta: 2,
        }),
      ]),
    );
  });

  it("increments receipt numbers globally and never reuses cancelled sale numbers", async () => {
    const first = await service.create({
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm2",
      items: [{ productId: "p10", qty: 1 }],
    });
    await service.cancel(first.id, { reason: "Anulada" });

    const second = await service.create({
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm2",
      items: [{ productId: "p10", qty: 1 }],
    });

    expect(first.number).toBe("000001");
    expect(second.number).toBe("000002");
  });

  it("reconstructs an internal non-fiscal receipt from persisted sale data", async () => {
    const sale = await service.create({
      deliveryStatus: "Entregado",
      paymentMethodId: "pm2",
      items: [{ productId: "p9", qty: 2 }],
    });

    const receipt = await service.getReceiptData(sale.id);

    expect(receipt).toMatchObject({
      legend: "Comprobante interno no válido como factura fiscal.",
      business: {
        name: "Lozano Congelados",
      },
      receipt: {
        header: "LOZANO CONGELADOS - Congelados de calidad",
      },
      sale: {
        id: sale.id,
        number: "000001",
        deliveryStatus: "Entregado",
        status: "Confirmada",
      },
      totals: {
        totalAmountCents: 532000,
      },
    });
    expect(receipt.items).toEqual([
      expect.objectContaining({
        productId: "p9",
        qty: 2,
        unitPriceAmountCents: 266000,
      }),
    ]);
  });

  it("reconstructs receipt totals and labels from immutable sale snapshots", async () => {
    await db.prisma.product.update({
      where: { id: "p1" },
      data: { priceAmountCents: 1_000_000 },
    });
    const coupon = await db.prisma.coupon.create({
      data: {
        code: "VERANO10",
        discountType: "Percentage",
        discountBasisPoints: 1_000,
        enabled: true,
      },
    });
    const sale = await service.create({
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm5",
      couponCode: "VERANO10",
      items: [{ productId: "p1", qty: 1 }],
    });

    await db.prisma.paymentMethod.update({
      where: { id: "pm5" },
      data: { name: "Debito actual", surchargeBasisPoints: 500 },
    });
    await db.prisma.coupon.update({
      where: { id: coupon.id },
      data: { code: "OTRO", discountBasisPoints: 2_000 },
    });

    const receipt = await service.getReceiptData(sale.id);

    expect(receipt.totals).toEqual({
      subtotalAmountCents: 1_000_000,
      discountAmountCents: 100_000,
      netAmountCents: 900_000,
      surchargeAmountCents: 22_500,
      totalAmountCents: 922_500,
      cashReceivedAmountCents: null,
      changeAmountCents: null,
    });
    expect(receipt.sale).toMatchObject({
      couponCode: "VERANO10",
      surchargeBasisPoints: 250,
      payment: "Tarjeta Debito",
    });
  });

  it("quotes coupon discounts and payment surcharges without persisting a sale", async () => {
    await db.prisma.coupon.create({
      data: {
        code: "VERANO10",
        discountType: "Percentage",
        discountBasisPoints: 1_000,
        enabled: true,
      },
    });

    const quote = await service.quote({
      deliveryStatus: "Entregado",
      paymentMethodId: "pm5",
      couponCode: " verano10 ",
      items: [{ productId: "p1", qty: 1 }],
    });

    expect(quote).toMatchObject({
      couponCode: "VERANO10",
      couponType: "Percentage",
      couponBasisPoints: 1_000,
      couponValueAmountCents: null,
      subtotalAmountCents: 268_000,
      discountAmountCents: 26_800,
      netAmountCents: 241_200,
      surchargeBasisPoints: 250,
      surchargeAmountCents: 6_030,
      totalAmountCents: 247_230,
      cashReceivedAmountCents: null,
      changeAmountCents: null,
      cashShortfallAmountCents: 0,
    });
    await expect(db.prisma.sale.count()).resolves.toBe(0);
    await expect(db.prisma.stockMovement.count()).resolves.toBe(0);
  });

  it("quotes optional cash and persists its exact change", async () => {
    await db.prisma.product.update({
      where: { id: "p1" },
      data: { priceAmountCents: 750_000 },
    });

    const quote = await service.quote({
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      items: [{ productId: "p1", qty: 1 }],
    });

    expect(quote).toMatchObject({
      totalAmountCents: 750_000,
      cashReceivedAmountCents: null,
      changeAmountCents: null,
      cashShortfallAmountCents: 0,
    });

    const sale = await service.create({
      deliveryStatus: "Entregado",
      paymentMethodId: "pm1",
      cashReceivedAmountCents: 1_000_000,
      items: [{ productId: "p1", qty: 1 }],
    });

    expect(sale).toMatchObject({
      payment: "Efectivo",
      totalAmountCents: 750_000,
      cashReceivedAmountCents: 1_000_000,
      changeAmountCents: 250_000,
      cashShortfallAmountCents: 0,
    });
  });

  it("rejects missing or insufficient cash when creating a cash sale", async () => {
    const input = {
      deliveryStatus: "Entregado" as const,
      paymentMethodId: "pm1",
      items: [{ productId: "p1", qty: 1 }],
    };

    await expect(service.create(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.create({ ...input, cashReceivedAmountCents: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(db.prisma.sale.count()).resolves.toBe(0);
  });

  it("rejects cash on electronic payments and inactive coupons", async () => {
    await db.prisma.coupon.create({
      data: {
        code: "INACTIVO",
        discountType: "FixedAmount",
        discountAmountCents: 10_000,
        enabled: false,
      },
    });

    await expect(
      service.create({
        deliveryStatus: "Entregado",
        paymentMethodId: "pm5",
        cashReceivedAmountCents: 300_000,
        items: [{ productId: "p1", qty: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.quote({
        deliveryStatus: "Entregado",
        paymentMethodId: "pm5",
        couponCode: "INACTIVO",
        items: [{ productId: "p1", qty: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
