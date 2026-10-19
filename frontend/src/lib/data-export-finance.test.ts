import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dataExportOptions,
  loadDataExport,
  type DataExportSection,
} from "./data-export";
import type { CsvCell } from "./csv";
import { paymentTermsLabel } from "./data-export-sections";

afterEach(() => vi.unstubAllGlobals());
const respond = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body)));
const cell = (rows: CsvCell[][], column: string, index = 1) =>
  rows[index]?.[rows[0].indexOf(column)];

describe("complete exports after financing and wholesale pricing", () => {
  it("identifies refunds of opening balances as tracked previous debt", () => {
    expect(paymentTermsLabel("OpeningBalance")).toBe("Saldo anterior");
  });
  it("offers every new financial, inventory and price-list dataset", () => {
    expect(dataExportOptions.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "customers",
        "customer-plans",
        "customer-installments",
        "collections",
        "collection-allocations",
        "card-settlements",
        "card-accreditations",
        "refunds",
        "refund-cancellations",
        "supplier-payables",
        "supplier-payments",
        "supplier-refunds",
        "inventory-lots",
        "inventory-allocations",
        "price-lists",
        "price-list-tiers",
        "price-list-prices",
      ]),
    );
  });

  it("exports paid, credit and unclassified stock at its historical lot costs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) =>
        respond(
          String(input).endsWith("/suppliers")
            ? []
            : [
                {
                  productId: "p",
                  productName: "Producto",
                  category: { id: "cat", name: "Categoría" },
                  physicalStock: 14,
                  reservedStock: 2,
                  availableStock: 12,
                  minStock: 1,
                  costAmountCents: 99000,
                  priceAmountCents: 120000,
                  marginPct: 20,
                  paidQty: 5,
                  creditQty: 3,
                  unclassifiedQty: 6,
                  paidValueCents: 750000,
                  creditValueCents: 450000,
                  unclassifiedValueCents: 600001,
                  totalValueCents: 1800001,
                },
              ],
        ),
      ),
    );
    const rows = await loadDataExport("stock");
    expect(cell(rows, "Unidades pagadas")).toBe(5);
    expect(cell(rows, "Valor pagado ARS")).toBe(7500);
    expect(cell(rows, "Unidades a crédito")).toBe(3);
    expect(cell(rows, "Valor a crédito ARS")).toBe(4500);
    expect(cell(rows, "Unidades sin clasificar")).toBe(6);
    expect(cell(rows, "Valor sin clasificar ARS")).toBe(6000.01);
    expect(cell(rows, "Valor total al costo ARS")).toBe(18000.01);
  });

  it("keeps the original financing and wholesale conditions in sales and their lines", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        respond([
          {
            id: "sale",
            number: "000001",
            date: "2026-01-31T02:30:00Z",
            customerId: "c",
            customerName: "Nombre original",
            paymentTerms: "DirectInstallments",
            payment: "",
            deliveryStatus: "Entregado",
            status: "Confirmada",
            totalAmountCents: 10001,
            items: [
              {
                productId: "p",
                name: "Original",
                qty: 2,
                unitPriceAmountCents: 5000,
              },
            ],
            finance: {
              upfrontAmountCents: 1001,
              financedAmountCents: 9000,
              installments: [
                { number: 1, dueDate: "2026-01-31", amountCents: 4500 },
                { number: 2, dueDate: "2026-02-28", amountCents: 4500 },
              ],
            },
            pricingSnapshot: {
              listId: "l",
              listName: "Mayorista original",
              countedUnits: 2,
              globalMinimumQty: 2,
              lines: [
                {
                  itemType: "Product",
                  itemId: "p",
                  qty: 2,
                  basePriceAmountCents: 6000,
                  appliedPriceAmountCents: 5000,
                  origin: "List",
                  effectiveMinimumQty: 1,
                  components: [],
                },
              ],
            },
          },
        ]),
      ),
    );
    const rows = await loadDataExport("sales");
    expect(cell(rows, "Condición de pago")).toBe("Cuotas directas");
    expect(cell(rows, "Anticipo ARS")).toBe(10.01);
    expect(cell(rows, "Financiado ARS")).toBe(90);
    expect(cell(rows, "Cuotas directas")).toBe(2);
    expect(cell(rows, "Lista original")).toBe("Mayorista original");
    expect(cell(rows, "Unidades computadas")).toBe(2);
    expect(cell(rows, "Escala alcanzada")).toBe(2);
    const detail = await loadDataExport("sale-items");
    expect(cell(detail, "Precio habitual original ARS")).toBe(60);
    expect(cell(detail, "Precio unitario ARS")).toBe(50);
    expect(cell(detail, "Escala del precio aplicado")).toBe(1);
    expect(cell(detail, "Origen del precio")).toBe("Lista");
  });

  it("does not invent tracked payments or debts for historical sales and purchases", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) =>
        respond(
          String(input).endsWith("/suppliers")
            ? []
            : [
                {
                  id: "legacy",
                  number: "000002",
                  supplierId: "s",
                  date: "2026-01-01T12:00:00Z",
                  items: [],
                  totalAmountCents: 10000,
                  payment: "Efectivo",
                  deliveryStatus: "Entregado",
                  status: "Registrada",
                  paymentTerms: null,
                  paymentCondition: "SinSeguimiento",
                  finance: null,
                  pricingSnapshot: null,
                },
              ],
        ),
      ),
    );
    const sales = await loadDataExport("sales");
    expect(cell(sales, "Condición de pago")).toBe("Sin seguimiento financiero");
    expect(cell(sales, "Anticipo ARS")).toBeNull();
    expect(cell(sales, "Lista original")).toBeNull();
    const purchases = await loadDataExport("purchases");
    expect(cell(purchases, "Condición de pago")).toBe(
      "Sin seguimiento financiero",
    );
    expect(cell(purchases, "Saldo pendiente ARS")).toBeNull();
  });

  it("keeps purchase registration, supplier debt and effective payments distinct", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) =>
        respond(
          String(input).endsWith("/suppliers")
            ? []
            : [
                {
                  id: "purchase",
                  supplierId: "s",
                  date: "2026-10-18T03:00:00Z",
                  items: [],
                  status: "Registrada",
                  totalAmountCents: 12345,
                  paymentCondition: "Credito",
                  dueDate: "2026-11-30",
                  payable: {
                    id: "debt",
                    status: "Pagada",
                    balanceCents: 0,
                    refundPendingCents: 0,
                    payments: [
                      {
                        id: "payment",
                        date: "2026-10-18",
                        method: "QR",
                        amountCents: 12345,
                      },
                    ],
                    refunds: [],
                  },
                },
              ],
        ),
      ),
    );
    const rows = await loadDataExport("purchases");
    expect(cell(rows, "Condición de pago")).toBe("A crédito");
    expect(cell(rows, "Vencimiento")).toBe("30/11/2026");
    expect(cell(rows, "Estado del pago")).toBe("Pagada");
    expect(cell(rows, "Saldo pendiente ARS")).toBe(0);
    expect(cell(rows, "Pagado ARS")).toBe(123.45);
    expect(cell(rows, "Fecha de último pago")).toBe("18/10/2026");
  });

  it("exports all customer pages, archived accounts and explicit General assignments", async () => {
    const fetchMock = vi.fn((input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("price-lists"))
        return respond([
          {
            id: "general",
            name: "General",
            isGeneral: true,
            active: true,
            tiers: [],
          },
        ]);
      const skip = Number(url.searchParams.get("skip"));
      return respond({
        items: [
          {
            id: `c${skip}`,
            name: `Cliente ${skip}`,
            active: skip === 0,
            priceListId: null,
            phone: null,
            notes: "",
            balanceAmountCents: 101,
            overdueAmountCents: 1,
            cardPendingAmountCents: 200,
          },
        ],
        total: 2,
        hasMore: skip === 0,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const rows = await loadDataExport("customers" as DataExportSection);
    expect(rows).toHaveLength(3);
    expect(cell(rows, "Lista aplicable")).toBe("General");
    expect(cell(rows, "Deuda del cliente ARS")).toBe(1.01);
    expect(cell(rows, "Tarjetas pendientes ARS")).toBe(2);
    expect(cell(rows, "Activo", 2)).toBe(false);
    const urls = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname.endsWith("/customers"));
    expect(urls).toHaveLength(2);
    expect(
      urls.every((url) => url.searchParams.get("includeInactive") === "true"),
    ).toBe(true);
  });

  it("preserves empty price tiers and only exports configured product or combo prices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/customers"))
          return respond({ items: [], total: 0, hasMore: false });
        if (path.endsWith("/products"))
          return respond([
            {
              id: "p",
              name: "Producto",
              costAmountCents: 1,
              priceAmountCents: 200,
              category: { id: "cat", name: "Categoría" },
            },
          ]);
        if (path.endsWith("/combos"))
          return respond([
            {
              id: "b",
              name: "Combo",
              items: [],
              priceAmountCents: 200,
              productsTotalAmountCents: 200,
              discountAmountCents: 0,
            },
          ]);
        return respond([
          {
            id: "l",
            name: "Lista archivada",
            active: false,
            isGeneral: false,
            tiers: [
              { minimumQty: 1, prices: [] },
              {
                minimumQty: 6,
                prices: [
                  { itemType: "Product", itemId: "p", priceAmountCents: 10001 },
                  { itemType: "Combo", itemId: "b", priceAmountCents: 30003 },
                ],
              },
            ],
          },
        ]);
      }),
    );
    const tiers = await loadDataExport("price-list-tiers" as DataExportSection);
    expect(tiers).toHaveLength(3);
    expect(cell(tiers, "Cantidad mínima")).toBe(1);
    const prices = await loadDataExport(
      "price-list-prices" as DataExportSection,
    );
    expect(prices).toHaveLength(3);
    expect(cell(prices, "Precio ARS")).toBe(100.01);
    expect(cell(prices, "Precio ARS", 2)).toBe(300.03);
    expect(cell(prices, "Tipo", 2)).toBe("Combo");
    expect(cell(prices, "Lista activa")).toBe(false);
  });

  it("exports supplier balances from all debts, without treating supplier refunds as new purchases", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/suppliers"))
          return respond([
            {
              id: "s",
              name: "Proveedor",
              phone: "",
              email: "",
              active: false,
              lastPurchase: "2026-10-15",
            },
          ]);
        return respond({
          items: [
            {
              supplierId: "s",
              balanceCents: 15001,
              refundPendingCents: 0,
              dueDate: "2026-11-30",
              status: "Pendiente",
            },
            {
              supplierId: "s",
              balanceCents: 200,
              refundPendingCents: 0,
              dueDate: "2026-01-31",
              status: "Vencida",
            },
            {
              supplierId: "s",
              balanceCents: 0,
              refundPendingCents: 300,
              dueDate: "2026-01-01",
              status: "Anulada",
            },
          ],
          total: 3,
          hasMore: false,
        });
      }),
    );
    const rows = await loadDataExport("suppliers");
    expect(cell(rows, "Deuda pendiente ARS")).toBe(152.01);
    expect(cell(rows, "Deuda vencida ARS")).toBe(2);
    expect(cell(rows, "Próximo vencimiento pendiente")).toBe("31/01/2026");
    expect(cell(rows, "Reintegros a favor ARS")).toBe(3);
    expect(cell(rows, "Activo")).toBe(false);
  });

  it("keeps pending refunds visible even when no repayment has been registered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        respond({
          items: [
            {
              saleId: "s",
              planId: null,
              customerId: null,
              customerName: "Cliente original",
              title: "000042",
              paymentTerms: "CardInstallments",
              refundableAmountCents: 10001,
              refundedAmountCents: 2000,
              pendingAmountCents: 8001,
              refunds: [],
            },
          ],
          total: 1,
          hasMore: false,
        }),
      ),
    );
    const rows = await loadDataExport("refund-sources" as DataExportSection);
    expect(cell(rows, "Importe a devolver ARS")).toBe(100.01);
    expect(cell(rows, "Devuelto ARS")).toBe(20);
    expect(cell(rows, "Pendiente de devolver ARS")).toBe(80.01);
    expect(cell(rows, "Condición original")).toBe("Cuotas con tarjeta");
  });
});
