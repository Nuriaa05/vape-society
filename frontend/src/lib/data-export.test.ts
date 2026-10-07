import { afterEach, describe, expect, it, vi } from "vitest";

import { dataExportOptions, loadDataExport } from "@/lib/data-export";

afterEach(() => vi.unstubAllGlobals());

function respond(body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("settings data exports", () => {
  it("includes archived products, supplier names and prices in pesos", async () => {
    const products = Array.from({ length: 12 }, (_, index) => ({
      id: `product-${index}`,
      barcode: `00${index}`,
      name: `Producto ${index}`,
      category: { id: "category-1", name: "Categoría" },
      supplier: { id: "supplier-1", name: "Proveedor" },
      costAmountCents: 120025,
      priceAmountCents: 180050,
      marginPct: 50,
      physicalStock: index,
      minStock: 5,
      archived: index === 11,
      saleEnabled: index !== 11,
    }));
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = new URL(String(input));
      return respond(
        url.pathname.endsWith("/suppliers")
          ? [
              {
                id: "supplier-1",
                name: "Proveedor",
                phone: "",
                email: null,
                lastPurchase: null,
                active: true,
                notes: null,
              },
            ]
          : products,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await loadDataExport("products");
    const cell = (column: string) => rows[12][rows[0].indexOf(column)];
    expect(rows).toHaveLength(13);
    expect(cell("Archivado")).toBe(true);
    expect(rows[0]).not.toContain("Venta habilitada");
    expect(cell("Proveedor")).toBe("Proveedor");
    expect(cell("Costo ARS")).toBe(1200.25);
    expect(cell("Precio de venta ARS")).toBe(1800.5);
    expect(
      fetchMock.mock.calls.some(
        ([input]) =>
          new URL(String(input)).searchParams.get("includeArchived") === "true",
      ),
    ).toBe(true);
  });

  it("exports physical, reserved and available stock separately", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input) => {
        return respond(
          String(input).endsWith("/suppliers")
            ? []
            : [
                {
                  productId: "product-1",
                  productName: "Producto",
                  barcode: null,
                  category: { id: "category-1", name: "Categoría" },
                  supplier: null,
                  costAmountCents: 100,
                  priceAmountCents: 200,
                  marginPct: 100,
                  physicalStock: 14,
                  reservedStock: 5,
                  availableStock: 9,
                  minStock: 5,
                  archived: false,
                },
              ],
        );
      }),
    );

    const rows = await loadDataExport("stock");
    const cell = (column: string) => rows[1][rows[0].indexOf(column)];
    expect(cell("Stock físico")).toBe(14);
    expect(cell("Stock reservado")).toBe(5);
    expect(cell("Stock disponible")).toBe(9);
  });

  it("keeps purchase calendar dates and historical costs without repeating the total", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        respond([
          {
            id: "purchase-1",
            supplierId: "supplier-1",
            date: "2026-10-05T00:00:00.000Z",
            status: "Anulada",
            totalAmountCents: 240050,
            cancelReason: "Error de carga",
            items: [
              {
                productId: "product-1",
                name: "Nombre al comprar",
                qty: 2,
                unitCostAmountCents: 120025,
              },
            ],
          },
        ]),
      ),
    );

    const rows = await loadDataExport("purchase-items");
    const cell = (column: string) => rows[1][rows[0].indexOf(column)];
    expect(cell("Fecha")).toBe("05/10/2026");
    expect(cell("Estado")).toBe("Anulada");
    expect(cell("Producto")).toBe("Nombre al comprar");
    expect(cell("Costo unitario ARS")).toBe(1200.25);
    expect(cell("Subtotal del ítem ARS")).toBe(2400.5);
    expect(rows[0]).not.toContain("Total ARS");
  });

  it.each(dataExportOptions.filter((option) => option.id !== "settings"))(
    "exports an empty $label section with its headers",
    async ({ id }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => respond([])),
      );
      const rows = await loadDataExport(id);
      expect(rows).toHaveLength(1);
      expect(rows[0].length).toBeGreaterThan(1);
      expect(
        rows[0].every(
          (column) => typeof column === "string" && column.length > 0,
        ),
      ).toBe(true);
    },
  );

  it("exports all sales, optional clients and cancelled sales without a preview limit", async () => {
    const sales = Array.from({ length: 103 }, (_, index) => ({
      id: `sale-${index}`,
      number: String(index + 1).padStart(6, "0"),
      date: "2026-10-05T23:30:00.000Z",
      customerName: index === 0 ? "Cliente" : null,
      customerPhone: index === 0 ? "+54 362 4000000" : null,
      items: [],
      totalAmountCents: 125050,
      payment: "Transferencia",
      deliveryStatus: "Entregado",
      status: index === 0 ? "Anulada" : "Confirmada",
    }));
    const fetchMock = vi.fn<typeof fetch>(() => respond(sales));
    vi.stubGlobal("fetch", fetchMock);

    const rows = await loadDataExport("sales");
    const cell = (row: number, column: string) =>
      rows[row][rows[0].indexOf(column)];

    expect(rows).toHaveLength(104);
    expect(cell(1, "Cliente")).toBe("Cliente");
    expect(cell(1, "Celular")).toBe("+54 362 4000000");
    expect(cell(1, "Estado")).toBe("Anulada");
    expect(cell(1, "Total ARS")).toBe(1250.5);
    expect(cell(1, "Fecha y hora")).toBe("05/10/2026, 20:30");
    expect(cell(103, "Comprobante")).toBe("000103");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.has("take")).toBe(false);
  });

  it("uses historical line prices and separates detail from sale totals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        respond([
          {
            id: "sale-1",
            number: "000001",
            date: "2026-10-05T12:00:00.000Z",
            totalAmountCents: 30030,
            payment: "Efectivo",
            deliveryStatus: "Pendiente",
            status: "Confirmada",
            items: [
              {
                itemType: "Product",
                productId: "product-1",
                name: "Nombre al vender",
                qty: 3,
                unitPriceAmountCents: 10010,
              },
              {
                itemType: "Combo",
                productId: null,
                comboId: "combo-1",
                name: "Combo al vender",
                qty: 1,
                unitPriceAmountCents: 20000,
                comboDiscountAmountCents: 5000,
                components: [
                  {
                    productId: "p2",
                    productName: "Componente",
                    barcode: "",
                    qty: 2,
                  },
                ],
              },
            ],
          },
        ]),
      ),
    );

    const rows = await loadDataExport("sale-items");
    const cell = (row: number, column: string) =>
      rows[row][rows[0].indexOf(column)];
    expect(rows).toHaveLength(3);
    expect(cell(1, "Producto o combo")).toBe("Nombre al vender");
    expect(cell(1, "Subtotal del ítem ARS")).toBe(300.3);
    expect(cell(2, "Tipo")).toBe("Combo");
    expect(cell(2, "Subtotal del ítem ARS")).toBe(200);
    expect(cell(2, "Componentes del combo")).toBe("2x Componente");
    expect(rows[0]).not.toContain("Total ARS");
  });

  it("loads every month and every history page", async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/months")) {
        return respond([
          { month: "2026-10", label: "Octubre", eventCount: 101 },
          { month: "2026-09", label: "Septiembre", eventCount: 1 },
        ]);
      }
      const month = url.searchParams.get("month");
      const total = month === "2026-10" ? 101 : 1;
      const skip = Number(url.searchParams.get("skip"));
      const count = Math.min(100, total - skip);
      return respond({
        items: Array.from({ length: count }, (_, index) => ({
          id: `${month}-${skip + index}`,
          occurredAt: `${month}-01T12:00:00.000Z`,
          type: "products",
          title: "Producto creado",
          description: "Registro",
          entityId: "product-1",
        })),
        total,
        hasMore: skip + count < total,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await loadDataExport("history");
    expect(rows).toHaveLength(103);
    expect(rows.at(-1)?.[0]).toBe("2026-09-0");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("exports archived combo components without repeating combo prices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        respond([
          {
            id: "combo-1",
            barcode: "001",
            name: "Combo",
            archived: true,
            priceAmountCents: 150050,
            productsTotalAmountCents: 200000,
            discountAmountCents: 49950,
            items: [
              {
                productId: "product-1",
                productName: "Producto",
                barcode: "002",
                qty: 2,
              },
            ],
          },
        ]),
      ),
    );
    const rows = await loadDataExport("combo-items");
    expect(rows[1]).toEqual([
      "combo-1",
      "Combo",
      true,
      "product-1",
      "Producto",
      "002",
      2,
    ]);
    expect(rows[0]).not.toContain("Precio de venta ARS");
  });

  it("converts payment and coupon percentages from basis points", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input) =>
        respond(
          String(input).endsWith("/coupons")
            ? [
                {
                  id: "coupon-1",
                  code: "CODIGO",
                  discountType: "Percentage",
                  discountBasisPoints: 1250,
                  discountAmountCents: null,
                  enabled: false,
                },
              ]
            : [
                {
                  id: "payment-1",
                  name: "Pago",
                  surchargeBasisPoints: 250,
                  enabled: true,
                  cashHandling: false,
                },
              ],
        ),
      ),
    );
    expect((await loadDataExport("payment-methods"))[1]).toEqual([
      "payment-1",
      "Pago",
      true,
      2.5,
      false,
    ]);
    expect((await loadDataExport("coupons"))[1]).toEqual([
      "coupon-1",
      "CODIGO",
      "Porcentaje",
      12.5,
      null,
      false,
    ]);
  });

  it("exports saved settings, including multiline receipt text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        respond({
          business: {
            name: "Local",
            address: "Dirección",
            cuit: "",
            phone: "",
          },
          receipt: {
            header: "Encabezado",
            footer: "Primera línea\nSegunda línea",
          },
          defaultMarginPct: 45,
          defaultMargin: 0,
          comboTicketMode: "ComboWithComponents",
          categories: [],
          paymentMethods: [],
        }),
      ),
    );
    const rows = await loadDataExport("settings");
    expect(rows).toHaveLength(9);
    expect(rows).toContainEqual([
      "Comprobante",
      "Pie",
      "Primera línea\nSegunda línea",
    ]);
    expect(rows).toContainEqual([
      "Precios",
      "Margen de ganancia predeterminado %",
      45,
    ]);
  });

  it("does not create a partial export when an API request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Sin conexión"))),
    );
    await expect(loadDataExport("products")).rejects.toThrow("Sin conexión");
  });
});
