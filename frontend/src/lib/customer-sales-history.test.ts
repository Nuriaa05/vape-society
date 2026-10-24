import { describe, expect, it } from "vitest";
import type { CustomerSale } from "./collections";
import {
  getCustomerSalesHistoryView,
  saleHistoryPaymentLabel,
  saleHistoryStatus,
} from "./customer-sales-history";

const sales: CustomerSale[] = [
  { id: "legacy", number: "000001", totalAmountCents: 0 },
  {
    id: "cash",
    number: "000002",
    date: "2026-10-22T01:30:00Z",
    totalAmountCents: 731850,
    paymentTerms: "Immediate",
    status: "Confirmada",
    deliveryStatus: "Entregado",
  },
  {
    id: "direct",
    number: "000003",
    date: "2026-10-22T15:00:00Z",
    totalAmountCents: 10000,
    paymentTerms: "DirectInstallments",
    status: "Confirmada",
    deliveryStatus: "Pendiente",
  },
  {
    id: "card",
    number: "000004",
    date: "2026-10-23T15:00:00Z",
    totalAmountCents: 20000,
    paymentTerms: "CardInstallments",
    status: "Anulada",
    deliveryStatus: "Entregado",
  },
  { id: "fifth", number: "000005", date: "2026-10-20T15:00:00Z" },
  { id: "sixth", number: "000006", date: "2026-10-19T15:00:00Z" },
];

describe("associated sales history", () => {
  it("paginates five sales, newest first, leaving undated legacy records last", () => {
    const view = getCustomerSalesHistoryView(sales, "", 0);
    expect(view.rows.map((sale) => sale.id)).toEqual([
      "card",
      "direct",
      "cash",
      "fifth",
      "sixth",
    ]);
    expect(view).toMatchObject({ total: 6, pageCount: 2, start: 1, end: 5 });
    expect(getCustomerSalesHistoryView(sales, "", 99)).toMatchObject({
      rows: [sales[0]],
      page: 1,
      start: 6,
      end: 6,
    });
  });

  it("searches sale numbers and Argentine dates rather than the UTC date", () => {
    expect(getCustomerSalesHistoryView(sales, "000003", 0).rows).toEqual([
      sales[2],
    ]);
    expect(getCustomerSalesHistoryView(sales, "21/10/2026", 0).rows).toEqual([
      sales[1],
    ]);
    expect(getCustomerSalesHistoryView(sales, "2026-10-21", 0).rows).toEqual([
      sales[1],
    ]);
  });

  it("searches payment terms, status and amounts without accents or case differences", () => {
    expect(
      getCustomerSalesHistoryView(sales, "  CUOTAS tarjeta anulada ", 0).rows,
    ).toEqual([sales[3]]);
    expect(
      getCustomerSalesHistoryView(sales, "directas pendiente", 0).rows,
    ).toEqual([sales[2]]);
    expect(getCustomerSalesHistoryView(sales, "7.318,50", 0).rows).toEqual([
      sales[1],
    ]);
    expect(getCustomerSalesHistoryView(sales, "7318.5", 0).rows).toEqual([
      sales[1],
    ]);
  });

  it("keeps legacy terms unknown and distinguishes cancellation from delivery", () => {
    expect(saleHistoryPaymentLabel(sales[0])).toBe(
      "Sin seguimiento financiero",
    );
    expect(saleHistoryStatus(sales[3])).toBe("Anulada");
    expect(saleHistoryStatus(sales[2])).toBe("Pendiente");
    expect(saleHistoryStatus(sales[0])).toBe("—");
    expect(
      getCustomerSalesHistoryView(sales, "sin seguimiento", 0).rows,
    ).toContainEqual(sales[0]);
  });

  it("handles no results and clamps the page after filtering", () => {
    expect(getCustomerSalesHistoryView(sales, "inexistente", 1)).toMatchObject({
      rows: [],
      total: 0,
      page: 0,
      pageCount: 0,
      start: 0,
      end: 0,
    });
    expect(getCustomerSalesHistoryView(sales, "000002", 1)).toMatchObject({
      rows: [sales[1]],
      total: 1,
      page: 0,
    });
    expect(getCustomerSalesHistoryView([], "", 0).rows).toEqual([]);
  });

  it("preserves original sales and handles a zero total", () => {
    const original = structuredClone(sales);
    expect(getCustomerSalesHistoryView([sales[0]], "$0", 0).rows).toEqual([
      sales[0],
    ]);
    getCustomerSalesHistoryView(sales, "", 0);
    expect(sales).toEqual(original);
  });
});
