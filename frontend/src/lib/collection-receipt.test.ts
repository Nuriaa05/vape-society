import { describe, expect, it } from "vitest";
import { buildCollectionReceiptHtml } from "./collection-receipt-view";

const receipt = {
  business: {
    name: "Vape Society",
    address: "San Martín 123",
    cuit: "20-12345678-9",
    phone: "1122334455",
  },
  receipt: { header: "", footer: "Gracias por tu pago" },
  collection: {
    id: "cobro-123",
    date: "2026-10-16",
    customerId: "cliente-1",
    customerName: "Ana Pérez",
    paymentMethodName: "Efectivo",
    amountCents: 1000000,
    cashReceivedAmountCents: 1200000,
    changeAmountCents: 200000,
  },
  allocations: [
    {
      amountCents: 1000000,
      installment: {
        number: 1,
        dueDate: "2026-10-06",
        plan: { title: "Deuda anterior" },
      },
    },
  ],
  legend: "Comprobante interno no válido como factura fiscal.",
};
const options = {
  issuedAt: "2026-10-17T15:00:00Z",
  balance: { amountCents: 3000000, asOf: "2026-10-17T15:00:00Z" },
};

describe("collection receipt", () => {
  it("identifies the payment, its installments and the current balance at printing, with both paper formats", () => {
    const html = buildCollectionReceiptHtml(receipt, options);
    expect(html).toContain("cobro-123");
    expect(html).toContain("16/10/2026");
    expect(html).toContain("Deuda anterior");
    expect(html).toContain("Cuota 1");
    expect(html).not.toContain("06/10/2026");
    expect(html).toContain("$10.000");
    expect(html).toContain("$2.000");
    expect(html).toContain("Saldo actual");
    expect(html).toContain("$30.000");
    expect(html).toContain("17/10/2026");
    expect(html).toContain('data-format="a4"');
    expect(html).toContain('data-format="ticket"');
    expect(html).not.toContain("Saldo después del pago");
  });

  it("escapes customer and business content rather than interpreting it as markup", () => {
    const unsafe = '<img src=x onerror="alert(1)">';
    const html = buildCollectionReceiptHtml(
      {
        ...receipt,
        business: { ...receipt.business, name: unsafe },
        collection: { ...receipt.collection, customerName: unsafe },
        allocations: [
          {
            ...receipt.allocations[0],
            installment: {
              ...receipt.allocations[0].installment,
              plan: { title: unsafe },
            },
          },
        ],
        receipt: { header: "", footer: unsafe },
      },
      options,
    );
    expect(html).not.toContain(unsafe);
    expect(html).toContain("&lt;img");
    expect(html).toContain("&quot;alert(1)&quot;");
  });

  it("does not imply a zero balance when the current balance could not be fetched", () => {
    const html = buildCollectionReceiptHtml(receipt, {
      issuedAt: options.issuedAt,
    });
    expect(html).toContain("Saldo actual no disponible");
    expect(html).not.toContain("Cliente al día");
  });

  it("marks a reversed payment as reversed and avoids duplicating exact cash and zero change", () => {
    const html = buildCollectionReceiptHtml(
      {
        ...receipt,
        collection: {
          ...receipt.collection,
          reversedAt: "2026-10-17T15:00:00Z",
          reversalReason: "Carga equivocada",
          cashReceivedAmountCents: 1000000,
          changeAmountCents: 0,
        },
      },
      options,
    );
    expect(html).toContain("COBRO REVERTIDO");
    expect(html).toContain("Carga equivocada");
    expect(html).not.toContain("Vuelto</dt>");
  });

  it("keeps refunds distinct from cash returned and cancelled card credits", () => {
    const html = buildCollectionReceiptHtml(
      {
        ...receipt,
        collection: undefined,
        allocations: [],
        refund: {
          id: "reintegro-1",
          date: "2026-10-16",
          customerName: "Ana Pérez",
          amountCents: 1000000,
          cashOutAmountCents: 300000,
          reason: "Venta anulada",
          cancellations: [{ grossAmountCents: 700000 }],
        },
      },
      { ...options, refund: true },
    );
    expect(html).toContain("Comprobante interno de reintegro");
    expect(html).toContain("Dinero entregado");
    expect(html).toContain("$3.000");
    expect(html).toContain("Acreditaciones pendientes canceladas");
    expect(html).toContain("$7.000");
    expect(html).toContain("Venta anulada");
  });
});
