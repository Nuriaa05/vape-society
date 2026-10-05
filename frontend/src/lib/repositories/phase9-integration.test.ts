import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backupsRepository } from "./backups-repository";
import { catalogRepository } from "./catalog-repository";
import { combosRepository } from "./combos-repository";
import { invalidateInventoryQueries } from "../inventory-cache";
import { productsRepository } from "./products-repository";
import { salesRepository } from "./sales-repository";
import { settingsRepository } from "./settings-repository";
import { stockRepository } from "./stock-repository";
import { suppliersRepository } from "./suppliers-repository";

const originalFetch = globalThis.fetch;

function mockJsonResponse(body: unknown, init: ResponseInit = {}) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
      ...init,
    }),
  );
}

describe("phase 9 repository integration", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("updates category and payment method settings through existing backend endpoints", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockImplementationOnce(() =>
        mockJsonResponse({ id: "cat-1", name: "Helados", active: true }),
      )
      .mockImplementationOnce(() =>
        mockJsonResponse({ id: "pm-1", name: "Mercado Pago", enabled: true }),
      )
      .mockImplementationOnce(() =>
        mockJsonResponse({ id: "pm-1", name: "Mercado Pago", enabled: false }),
      )
      .mockImplementationOnce(() =>
        mockJsonResponse({ id: "cat-1", deleted: true }),
      )
      .mockImplementationOnce(() =>
        mockJsonResponse({ id: "pm-1", deleted: true }),
      );

    await settingsRepository.updateCategory("cat-1", { name: "Helados" });
    await settingsRepository.createPaymentMethod("Mercado Pago");
    await settingsRepository.updatePaymentMethod("pm-1", { enabled: false });
    await settingsRepository.deleteCategory("cat-1");
    await settingsRepository.deletePaymentMethod("pm-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:3002/api/settings/categories/cat-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Helados" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:3002/api/settings/payment-methods",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Mercado Pago", enabled: true }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://127.0.0.1:3002/api/settings/payment-methods/pm-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://127.0.0.1:3002/api/settings/categories/cat-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "http://127.0.0.1:3002/api/settings/payment-methods/pm-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("updates minimum stock through product update without sending physical stock", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementationOnce(() =>
      mockJsonResponse({
        id: "p1",
        barcode: "7790001000017",
        name: "Hamburguesas",
        category: { id: "c1", name: "Hamburguesas" },
        supplier: { id: "s1", name: "Proveedor" },
        costAmountCents: 100000,
        priceAmountCents: 150000,
        marginPct: 50,
        physicalStock: 10,
        minStock: 7,
        archived: false,
      }),
    );

    const product = await productsRepository.updateMinStock("p1", 7);

    expect(product.minStock).toBe(7);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3002/api/products/p1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ minStock: 7 }),
      }),
    );
  });

  it("archives and restores products through the existing archive endpoint", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const apiProduct = {
      id: "p1",
      barcode: "7790001000017",
      name: "Hamburguesas",
      category: { id: "c1", name: "Hamburguesas" },
      supplier: { id: "s1", name: "Proveedor" },
      costAmountCents: 100000,
      priceAmountCents: 150000,
      marginPct: 50,
      physicalStock: 10,
      minStock: 7,
      archived: false,
    };
    fetchMock.mockImplementationOnce(() => mockJsonResponse(apiProduct));

    await productsRepository.setArchived("p1", false);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3002/api/products/p1/archive",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ archived: false }),
      }),
    );
  });

  it("saves products with optional barcode and negative initial stock", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementationOnce(() =>
      mockJsonResponse({
        id: "p-new",
        barcode: null,
        name: "Producto propio",
        category: { id: "c1", name: "Hamburguesas" },
        supplier: { id: "s-local", name: "Local" },
        costAmountCents: 100000,
        priceAmountCents: 150000,
        marginPct: 50,
        physicalStock: -3,
        minStock: 1,
        archived: false,
      }),
    );

    const product = await productsRepository.save({
      barcode: "",
      name: "Producto propio",
      categoryId: "c1",
      category: "Hamburguesas",
      supplierId: "s-local",
      cost: 1000,
      price: 1500,
      marginPct: 50,
      stock: -3,
      minStock: 1,
    });

    expect(product.barcode).toBe("");
    expect(product.stock).toBe(-3);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3002/api/products",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          barcode: null,
          name: "Producto propio",
          categoryId: "c1",
          supplierId: "s-local",
          costAmountCents: 100000,
          priceAmountCents: 150000,
          marginPct: 50,
          physicalStock: -3,
          minStock: 1,
        }),
      }),
    );
  });

  it("sends explicit negative stock confirmation when creating sales", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementationOnce(() =>
      mockJsonResponse({
        id: "sale-1",
        number: "000001",
        date: "2026-06-18T12:00:00.000Z",
        deliveryStatus: "Entregado",
        status: "Confirmada",
        paymentMethodId: "pm1",
        payment: "Efectivo",
        items: [
          {
            id: "item-1",
            productId: "p1",
            productName: "Producto",
            name: "Producto",
            barcode: "",
            qty: 3,
            unitPriceAmountCents: 150000,
            lineTotalAmountCents: 450000,
          },
        ],
        totalAmountCents: 450000,
        cancelReason: null,
      }),
    );

    await salesRepository.create({
      paymentMethodId: "pm1",
      deliveryStatus: "Entregado",
      allowNegativeStock: true,
      items: [{ productId: "p1", qty: 3 }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3002/api/sales",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          paymentMethodId: "pm1",
          deliveryStatus: "Entregado",
          allowNegativeStock: true,
          items: [{ itemType: "Product", itemId: "p1", qty: 3 }],
        }),
      }),
    );
  });

  it("saves combos and maps discount without component prices", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementationOnce(() =>
      mockJsonResponse({
        id: "combo-1",
        barcode: "7799990000018",
        name: "Combo Burger",
        priceAmountCents: 600000,
        productsTotalAmountCents: 718000,
        discountAmountCents: 118000,
        archived: false,
        items: [
          {
            productId: "p1",
            productName: "Hamburguesas",
            barcode: "7790001000017",
            qty: 1,
          },
        ],
      }),
    );

    const combo = await combosRepository.save({
      name: "Combo Burger",
      barcode: " 7799990000018 ",
      price: 6000,
      items: [{ productId: "p1", qty: 1 }],
    });

    expect(combo).toMatchObject({
      id: "combo-1",
      itemType: "Combo",
      price: 6000,
      productsTotal: 7180,
      discount: 1180,
    });
    expect(combo.items[0]).not.toHaveProperty("price");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3002/api/combos",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Combo Burger",
          barcode: "7799990000018",
          priceAmountCents: 600000,
          items: [{ productId: "p1", qty: 1 }],
        }),
      }),
    );
  });

  it("resolves scanner barcodes through the unified catalog endpoint", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementationOnce(() =>
      mockJsonResponse({
        itemType: "Combo",
        item: {
          id: "combo-1",
          barcode: "7799990000018",
          name: "Combo Burger",
          priceAmountCents: 600000,
          productsTotalAmountCents: 718000,
          discountAmountCents: 118000,
          archived: false,
          items: [],
        },
      }),
    );

    await expect(
      catalogRepository.findByBarcode("7799990000018"),
    ).resolves.toMatchObject({
      itemType: "Combo",
      item: { id: "combo-1", name: "Combo Burger" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3002/api/catalog/barcode/7799990000018",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates and reverses manual stock adjustments through stock endpoints", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const movement = {
      id: "m1",
      date: "2026-06-18T12:00:00.000Z",
      productId: "p1",
      productName: "Hamburguesas",
      type: "Ajuste",
      qty: 5,
      sourceType: "ManualAdjustment",
      sourceId: "manual-1",
      note: "Ingreso manual",
      reversalOf: null,
    };
    fetchMock
      .mockImplementationOnce(() => mockJsonResponse(movement, { status: 201 }))
      .mockImplementationOnce(() =>
        mockJsonResponse({
          ...movement,
          id: "m2",
          type: "Reverso",
          qty: -5,
          note: "Carga duplicada",
          reversalOf: "m1",
        }),
      );

    await stockRepository.createAdjustment({
      productId: "p1",
      type: "Ingreso",
      qty: 5,
      reason: "Ingreso manual",
    });
    await stockRepository.reverseMovement("m1", "Carga duplicada");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:3002/api/stock/adjustments",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          productId: "p1",
          type: "Ingreso",
          qty: 5,
          reason: "Ingreso manual",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:3002/api/stock/movements/m1/reverse",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "Carga duplicada" }),
      }),
    );
  });

  it("creates and lists backups through the existing backups endpoints", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const backup = {
      id: "b1",
      filename: "lozano-backup-2026-06-18-120000.db",
      sizeBytes: 1024,
      status: "Ok",
      createdAt: "2026-06-18T12:00:00.000Z",
    };
    fetchMock
      .mockImplementationOnce(() => mockJsonResponse(backup, { status: 201 }))
      .mockImplementationOnce(() => mockJsonResponse([backup]));

    await expect(backupsRepository.create()).resolves.toEqual(backup);
    await expect(backupsRepository.findAll()).resolves.toEqual([backup]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:3002/api/backups",
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:3002/api/backups",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("saves suppliers without a local.test placeholder email", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementationOnce(() =>
      mockJsonResponse({
        id: "s-new",
        name: "Proveedor sin email",
        phone: "-",
        email: "",
        lastPurchase: null,
        active: true,
        notes: null,
      }),
    );

    const saved = await suppliersRepository.save({
      name: "Proveedor sin email",
      phone: "-",
      email: "",
      active: true,
    });

    expect(saved.email).toBe("");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3002/api/suppliers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Proveedor sin email",
          phone: "-",
          email: "",
          lastPurchase: undefined,
          active: true,
          notes: null,
        }),
      }),
    );
  });

  it("sends manually entered supplier purchase dates to the backend", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementationOnce(() =>
      mockJsonResponse({
        id: "s-date",
        name: "Proveedor con fecha",
        phone: "-",
        email: "",
        lastPurchase: "2026-08-02",
        active: true,
        notes: null,
      }),
    );

    const saved = await suppliersRepository.save({
      name: "Proveedor con fecha",
      phone: "-",
      email: "",
      lastPurchase: "2026-08-02",
      active: true,
    });

    expect(saved.lastPurchase).toBe("2026-08-02");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3002/api/suppliers",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"lastPurchase":"2026-08-02"'),
      }),
    );
  });

  it("invalidates product, stock and movement queries after inventory mutations", () => {
    const queryClient = {
      invalidateQueries: vi.fn(),
    };

    invalidateInventoryQueries(queryClient);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["products"],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["stock"],
    });
  });
});
