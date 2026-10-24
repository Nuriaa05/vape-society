import { describe, expect, it } from "vitest";
import type { FinancialEntry } from "./collections";
import { getCollectionHistoryView } from "./collection-history";

const entries: FinancialEntry[] = [
  {
    id: "old",
    date: "2026-09-30",
    amountCents: 10000,
    paymentMethodName: "Efectivo",
  },
  {
    id: "transfer",
    date: "2026-10-21",
    amountCents: 60000,
    paymentMethodName: "Transferencia",
  },
  {
    id: "debit",
    date: "2026-10-21",
    amountCents: 3444000,
    paymentMethodName: "Tarjeta Débito",
  },
  {
    id: "qr",
    date: "2026-10-20",
    amountCents: 90000,
    paymentMethodName: "QR",
    reversedAt: "2026-10-21T12:00:00Z",
  },
  {
    id: "cents",
    date: "2026-10-19",
    amountCents: 731850,
    paymentMethodName: "Efectivo",
  },
  { id: "unknown", date: "2026-10-18", amountCents: 0 },
];
const noFilters = { search: "", date: "", method: "" };

describe("collection history", () => {
  it("shows the latest five collections while preserving the order within each day", () => {
    const view = getCollectionHistoryView(entries, noFilters, 0);
    expect(view.rows.map((entry) => entry.id)).toEqual([
      "transfer",
      "debit",
      "qr",
      "cents",
      "unknown",
    ]);
    expect(view).toMatchObject({
      total: 6,
      page: 0,
      pageCount: 2,
      start: 1,
      end: 5,
    });
  });

  it("searches methods without accents or case differences", () => {
    expect(
      getCollectionHistoryView(
        entries,
        { ...noFilters, search: "  TARJETA debito " },
        0,
      ).rows.map((entry) => entry.id),
    ).toEqual(["debit"]);
  });

  it.each(["21/10/2026", "2026-10-21"])(
    "finds collections using the date %s",
    (search) => {
      expect(
        getCollectionHistoryView(entries, { ...noFilters, search }, 0).rows.map(
          (entry) => entry.id,
        ),
      ).toEqual(["transfer", "debit"]);
    },
  );

  it.each(["7.318,50", "7318.5"])(
    "finds amounts with cents using %s",
    (search) => {
      expect(
        getCollectionHistoryView(entries, { ...noFilters, search }, 0).rows.map(
          (entry) => entry.id,
        ),
      ).toEqual(["cents"]);
    },
  );

  it("combines text, exact date and payment method", () => {
    expect(
      getCollectionHistoryView(
        entries,
        { search: "600", date: "2026-10-21", method: "Transferencia" },
        0,
      ).rows.map((entry) => entry.id),
    ).toEqual(["transfer"]);
    expect(
      getCollectionHistoryView(
        entries,
        { search: "600", date: "2026-10-21", method: "QR" },
        0,
      ).total,
    ).toBe(0);
  });

  it("keeps reversed collections in the history and allows finding them", () => {
    const view = getCollectionHistoryView(
      entries,
      { ...noFilters, search: "revertido" },
      0,
    );
    expect(view.rows.map((entry) => entry.id)).toEqual(["qr"]);
    expect(view.rows[0].reversedAt).toBe(entries[3].reversedAt);
  });

  it("clamps the current page after the available rows shrink", () => {
    expect(getCollectionHistoryView(entries, noFilters, 99)).toMatchObject({
      rows: [entries[0]],
      total: 6,
      page: 1,
      start: 6,
      end: 6,
    });
    expect(
      getCollectionHistoryView(entries, { ...noFilters, method: "QR" }, 1),
    ).toMatchObject({
      rows: [entries[3]],
      total: 1,
      page: 0,
      start: 1,
      end: 1,
    });
  });

  it("handles an empty history and filters without matches", () => {
    expect(getCollectionHistoryView([], noFilters, 3)).toMatchObject({
      rows: [],
      total: 0,
      page: 0,
      pageCount: 0,
      start: 0,
      end: 0,
    });
    expect(
      getCollectionHistoryView(entries, { ...noFilters, date: "2026-01-01" }, 0)
        .rows,
    ).toEqual([]);
  });

  it("does not reorder or mutate the original records", () => {
    const original = structuredClone(entries);
    getCollectionHistoryView(entries, noFilters, 0);
    expect(entries).toEqual(original);
  });

  it("searches the persisted sale, opening debt and installment references", () => {
    const linked: FinancialEntry[] = [
      {
        ...entries[0],
        id: "allocated",
        references: [
          {
            kind: "Sale",
            saleId: "sale",
            saleNumber: "000123",
            planId: "plan-sale",
            title: "Venta 000123",
            amountCents: 8000,
            installments: [{ number: 2, amountCents: 8000 }],
          },
          {
            kind: "OpeningBalance",
            saleId: null,
            saleNumber: null,
            planId: "opening",
            title: "Saldo de septiembre",
            amountCents: 2000,
            installments: [{ number: 1, amountCents: 2000 }],
          },
        ],
      },
      {
        ...entries[1],
        id: "upfront",
        references: [
          {
            kind: "Upfront",
            saleId: "sale-2",
            saleNumber: "000124",
            planId: null,
            title: "Venta 000124",
            amountCents: 60000,
            installments: [],
          },
        ],
      },
      entries[2],
    ];
    for (const search of ["000123", "venta cuota 2", "deuda SEPTIEMBRE"]) {
      expect(
        getCollectionHistoryView(linked, { ...noFilters, search }, 0).rows.map(
          (entry) => entry.id,
        ),
      ).toEqual(["allocated"]);
    }
    expect(
      getCollectionHistoryView(
        linked,
        { ...noFilters, search: "anticipo" },
        0,
      ).rows.map((entry) => entry.id),
    ).toEqual(["upfront"]);
  });
});
