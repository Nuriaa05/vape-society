import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import {
  createSeededTestDatabase,
  SeededTestDatabase,
} from "./prisma-test-database";

describe("Wholesale authoritative pricing", () => {
  let app: INestApplication;
  let db: SeededTestDatabase;
  const http = () => request(app.getHttpServer());
  const preview = (items: unknown[], extra = {}) =>
    http()
      .post("/api/price-lists/preview")
      .send({ items, ...extra });
  const config = {
    name: "Mayorista",
    tiers: [
      {
        minimumQty: 3,
        prices: [
          { itemType: "Product", itemId: "p1", priceAmountCents: 200000 },
        ],
      },
      {
        minimumQty: 5,
        prices: [
          { itemType: "Product", itemId: "p2", priceAmountCents: 100000 },
        ],
      },
    ],
  };
  beforeAll(async () => {
    db = await createSeededTestDatabase();
    process.env.DATABASE_URL = db.url;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await db?.cleanup();
  });

  it("seeds empty General and supports empty cart/catalog lookup without counting catalog rows", async () => {
    const lists = await http().get("/api/price-lists").expect(200);
    expect(lists.body).toEqual([
      expect.objectContaining({
        id: "general",
        name: "General",
        isGeneral: true,
        active: true,
        tiers: [],
      }),
    ]);
    const result = await preview([], {
      catalogItems: [{ itemType: "Product", itemId: "p1" }],
    }).expect(200);
    expect(result.body).toMatchObject({
      listId: "general",
      countedUnits: 0,
      globalMinimumQty: null,
      lines: [],
    });
    expect(result.body.catalogPrices[0]).toMatchObject({
      itemId: "p1",
      appliedPriceAmountCents: 268000,
      origin: "Catalog",
    });
    expect(await db.prisma.sale.count()).toBe(0);
  });

  it("uses a customer's list exclusively, aggregates mixed cart, inherits sparse cells and has order-independent fingerprint", async () => {
    const list = (
      await http().post("/api/price-lists").send(config).expect(201)
    ).body;
    const customer = (
      await http()
        .post("/api/customers")
        .send({ name: "Mayorista A", priceListId: list.id })
        .expect(201)
    ).body;
    const items = [
      { productId: "p1", qty: 1 },
      { productId: "p2", qty: 2 },
      { productId: "p1", qty: 2 },
    ];
    const result = (
      await preview(items, { customerId: customer.id }).expect(200)
    ).body;
    expect(result).toMatchObject({
      listId: list.id,
      countedUnits: 5,
      globalMinimumQty: 5,
    });
    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: "p1",
          qty: 3,
          appliedPriceAmountCents: 200000,
          effectiveMinimumQty: 3,
        }),
        expect.objectContaining({
          itemId: "p2",
          qty: 2,
          appliedPriceAmountCents: 100000,
          effectiveMinimumQty: 5,
        }),
      ]),
    );
    const reordered = (
      await preview([...items].reverse(), { customerId: customer.id }).expect(
        200,
      )
    ).body;
    expect(reordered.fingerprint).toBe(result.fingerprint);
    await http()
      .patch("/api/price-lists/general")
      .send({
        tiers: [
          {
            minimumQty: 1,
            prices: [
              { itemType: "Product", itemId: "p3", priceAmountCents: 1 },
            ],
          },
        ],
      })
      .expect(200);
    const fallback = (
      await preview([{ productId: "p3", qty: 1 }], {
        customerId: customer.id,
      }).expect(200)
    ).body;
    expect(fallback.lines[0]).toMatchObject({
      origin: "Catalog",
      effectiveMinimumQty: null,
    });
    await http()
      .patch(`/api/price-lists/${list.id}`)
      .send({ active: false })
      .expect(409);
    await http()
      .patch("/api/price-lists/general")
      .send({ active: false })
      .expect(409);
    await http()
      .patch(`/api/customers/${customer.id}`)
      .send({ priceListId: null })
      .expect(200);
    await http()
      .patch(`/api/price-lists/${list.id}`)
      .send({ active: false })
      .expect(200);
    expect(
      (await http().get("/api/price-lists?includeInactive=true")).body.some(
        (row: { id: string }) => row.id === list.id,
      ),
    ).toBe(true);
  });

  it("applies whole-cart thresholds at boundaries and does not alter list prices when costs change", async () => {
    const list = (
      await http().post("/api/price-lists").send(config).expect(201)
    ).body;
    const customer = (
      await http()
        .post("/api/customers")
        .send({ name: "Boundary", priceListId: list.id })
        .expect(201)
    ).body;
    for (const [qty, applied, minimum] of [
      [2, 268000, null],
      [3, 200000, 3],
      [4, 200000, 3],
      [5, 200000, 5],
    ]) {
      const result = (
        await preview([{ productId: "p1", qty }], {
          customerId: customer.id,
        }).expect(200)
      ).body;
      expect(result).toMatchObject({
        countedUnits: qty,
        globalMinimumQty: minimum,
      });
      expect(result.lines[0].appliedPriceAmountCents).toBe(applied);
    }
    await db.prisma.product.update({
      where: { id: "p1" },
      data: { costAmountCents: 999 },
    });
    const unchanged = (
      await preview([{ productId: "p1", qty: 3 }], {
        customerId: customer.id,
      }).expect(200)
    ).body;
    expect(unchanged.lines[0].appliedPriceAmountCents).toBe(200000);
    await http()
      .post("/api/customers")
      .send({ name: "Invalid list", priceListId: "missing" })
      .expect(400);
  });

  it("counts combo components once, independently prices combo and detects changed composition", async () => {
    const combo = await db.prisma.combo.create({
      data: {
        name: "Pack",
        priceAmountCents: 500000,
        items: {
          create: [
            { productId: "p1", qty: 2 },
            { productId: "p2", qty: 1 },
          ],
        },
      },
    });
    await http()
      .patch("/api/price-lists/general")
      .send({
        tiers: [
          {
            minimumQty: 7,
            prices: [
              { itemType: "Combo", itemId: combo.id, priceAmountCents: 400000 },
            ],
          },
        ],
      })
      .expect(200);
    const items = [
      { itemType: "Combo", itemId: combo.id, qty: 2 },
      { productId: "p1", qty: 1 },
    ];
    const a = (await preview(items).expect(200)).body;
    expect(a).toMatchObject({ countedUnits: 7, globalMinimumQty: 7 });
    expect(
      a.lines.find((line: { itemId: string }) => line.itemId === combo.id),
    ).toMatchObject({ appliedPriceAmountCents: 400000, qty: 2 });
    await db.prisma.comboItem.updateMany({
      where: { comboId: combo.id, productId: "p1" },
      data: { qty: 3 },
    });
    const b = (await preview(items).expect(200)).body;
    expect(b.countedUnits).toBe(9);
    expect(b.fingerprint).not.toBe(a.fingerprint);
    const sale = (
      await http()
        .post("/api/sales")
        .send({ deliveryStatus: "Pendiente", paymentMethodId: "pm2", items })
        .expect(201)
    ).body;
    expect(sale.subtotalAmountCents).toBe(1068000);
    expect(sale.items).toHaveLength(2);
    expect(sale.pricingSnapshot.countedUnits).toBe(9);
  });

  it("renames General while preserving its identity and archive restriction", async () => {
    const renamed = (
      await http()
        .patch("/api/price-lists/general")
        .send({ name: "General actualizada" })
        .expect(200)
    ).body;
    expect(renamed).toMatchObject({
      id: "general",
      name: "General actualizada",
      isGeneral: true,
    });
    await http()
      .patch("/api/price-lists/general")
      .send({ active: false })
      .expect(409);
  });

  it("rejects explicit null management flags and catalog lookup arrays", async () => {
    await http()
      .patch("/api/price-lists/general")
      .send({ active: null })
      .expect(400);
  });
  it("rejects explicit null catalog lookup arrays", async () => {
    await http()
      .post("/api/price-lists/preview")
      .send({ items: [], catalogItems: null })
      .expect(400);
  });

  it("rejects invalid configurations and duplicates deeply", async () => {
    for (const tiers of [
      [{ minimumQty: 0, prices: [] }],
      [
        { minimumQty: 3, prices: [] },
        { minimumQty: 3, prices: [] },
      ],
      [
        {
          minimumQty: 3,
          prices: [{ itemType: "Product", itemId: "p1", priceAmountCents: -1 }],
        },
      ],
      [
        {
          minimumQty: 3,
          prices: [
            { itemType: "Product", itemId: "p1", priceAmountCents: 1.5 },
          ],
        },
      ],
    ])
      await http()
        .post("/api/price-lists")
        .send({ name: "Invalid", tiers })
        .expect(400);
    const source = (
      await http().post("/api/price-lists").send(config).expect(201)
    ).body;
    const copy = (
      await http()
        .post(`/api/price-lists/${source.id}/duplicate`)
        .send({ name: "Copia" })
        .expect(201)
    ).body;
    expect(copy.tiers).toEqual(source.tiers);
    await http()
      .patch(`/api/price-lists/${copy.id}`)
      .send({ tiers: [] })
      .expect(200);
    expect(
      (await http().get(`/api/price-lists/${source.id}`).expect(200)).body
        .tiers,
    ).toEqual(source.tiers);
  });

  it("recalculates sale with discount/surcharge, rejects stale confirmation and preserves snapshot/idempotent retry", async () => {
    await http()
      .patch("/api/price-lists/general")
      .send({
        tiers: [
          {
            minimumQty: 1,
            prices: [
              { itemType: "Product", itemId: "p1", priceAmountCents: 200000 },
            ],
          },
        ],
      })
      .expect(200);
    await db.prisma.coupon.create({
      data: {
        code: "WHOLE10",
        discountType: "Percentage",
        discountBasisPoints: 1000,
      },
    });
    const input = {
      operationId: "wholesale-retry",
      deliveryStatus: "Pendiente",
      paymentMethodId: "pm5",
      couponCode: "WHOLE10",
      items: [{ productId: "p1", qty: 1 }],
    };
    const quote = (
      await http().post("/api/sales/quote").send(input).expect(200)
    ).body;
    expect(quote).toMatchObject({
      subtotalAmountCents: 200000,
      discountAmountCents: 20000,
      surchargeAmountCents: 4500,
      totalAmountCents: 184500,
    });
    const confirmedInput = {
      ...input,
      expectedPricingFingerprint: quote.pricing.fingerprint,
    };
    const sale = (
      await http().post("/api/sales").send(confirmedInput).expect(201)
    ).body;
    await http()
      .patch("/api/price-lists/general")
      .send({ tiers: [] })
      .expect(200);
    const stale = await http()
      .post("/api/sales")
      .send({ ...confirmedInput, operationId: "stale-new" })
      .expect(409);
    expect(stale.body.code).toBe("PRICE_CHANGED");
    expect(
      (await http().post("/api/sales").send(confirmedInput).expect(201)).body
        .id,
    ).toBe(sale.id);
    const historic = (await http().get(`/api/sales/${sale.id}`).expect(200))
      .body;
    expect(historic.pricingSnapshot).toEqual(sale.pricingSnapshot);
    expect(historic.pricingSnapshot.lines[0].appliedPriceAmountCents).toBe(
      200000,
    );
    const receipt = (
      await http().get(`/api/sales/${sale.id}/receipt`).expect(200)
    ).body;
    expect(receipt.sale.pricingSnapshot).toEqual(sale.pricingSnapshot);
    const exported = (
      await http().get("/api/reports/sales?range=all").expect(200)
    ).body;
    expect(
      exported.find((row: { id: string }) => row.id === sale.id)
        .pricingSnapshot,
    ).toEqual(sale.pricingSnapshot);
    await http()
      .post("/api/sales/quote")
      .send({ ...input, pricingOnly: true, customerId: "missing" })
      .expect(400);
  });
  it("omits unavailable lookup combos for empty and unrelated carts but rejects selling them", async () => {
    const combo = await db.prisma.combo.create({
      data: {
        name: "Unavailable lookup pack",
        priceAmountCents: 1000,
        items: { create: [{ productId: "p1", qty: 1 }] },
      },
    });
    await db.prisma.product.update({
      where: { id: "p1" },
      data: { archived: true },
    });
    const catalogItems = [
      { itemType: "Combo", itemId: combo.id },
      { itemType: "Product", itemId: "p2" },
      { itemType: "Combo", itemId: "missing-lookup" },
    ];
    try {
      const empty = await preview([], { catalogItems }).expect(200);
      expect(empty.body.countedUnits).toBe(0);
      expect(
        empty.body.catalogPrices.map((line: { itemId: string }) => line.itemId),
      ).toEqual(["p2"]);
      const unrelated = await preview([{ productId: "p2", qty: 1 }], {
        catalogItems,
      }).expect(200);
      expect(unrelated.body.countedUnits).toBe(1);
      expect(unrelated.body.lines[0].itemId).toBe("p2");
      expect(unrelated.body.catalogPrices).toHaveLength(1);
      await preview([{ itemType: "Combo", itemId: combo.id, qty: 1 }]).expect(
        400,
      );
      await http()
        .post("/api/sales/quote")
        .send({
          items: [{ itemType: "Combo", itemId: combo.id, qty: 1 }],
          paymentMethodId: "pm1",
          deliveryStatus: "Entregado",
        })
        .expect(400);
    } finally {
      await db.prisma.product.update({
        where: { id: "p1" },
        data: { archived: false },
      });
    }
  });
});
