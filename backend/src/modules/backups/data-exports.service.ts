import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

type CsvCell = string | number | boolean | null;
type ExportRows = CsvCell[][];
const pesos = (amount: number | null): number | null =>
  amount === null ? null : amount / 100;
const calendarDate = (date: string) => date.split("-").reverse().join("/");
const dateTime = (date: Date | null) =>
  date === null
    ? null
    : new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);

@Injectable()
export class DataExportsService {
  constructor(private readonly prisma: PrismaService) {}

  async rows(section: string): Promise<ExportRows> {
    switch (section) {
      case "customer-plans":
        return this.plans();
      case "collections":
        return this.collections();
      case "collection-allocations":
        return this.collectionAllocations();
      case "card-accreditations":
        return this.accreditations();
      case "refunds":
        return this.refunds();
      case "refund-cancellations":
        return this.refundCancellations();
      case "inventory-lots":
        return this.lots();
      case "inventory-allocations":
        return this.inventoryAllocations();
      default:
        throw new NotFoundException("La sección de exportación no existe.");
    }
  }

  private async plans(): Promise<ExportRows> {
    const plans = await this.prisma.receivablePlan.findMany({
      include: {
        customer: true,
        sale: { select: { number: true, status: true } },
        installments: {
          include: {
            allocations: {
              include: { collection: { select: { reversedAt: true } } },
            },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return [
      [
        "ID plan",
        "ID cliente",
        "Cliente",
        "ID venta",
        "Comprobante",
        "Origen",
        "Concepto",
        "Importe original ARS",
        "Cobrado ARS",
        "Saldo pendiente ARS",
        "Cuotas",
        "Estado",
        "Alta",
        "Fecha de anulación",
        "Motivo de anulación",
      ],
      ...plans.map((plan) => {
        const paid = plan.installments.reduce(
          (sum, installment) =>
            sum +
            installment.allocations
              .filter((allocation) => !allocation.collection.reversedAt)
              .reduce((total, allocation) => total + allocation.amountCents, 0),
          0,
        );
        const cancelled =
          plan.status === "Anulado" || plan.sale?.status === "Anulada";
        return [
          plan.id,
          plan.customerId,
          plan.customer.name,
          plan.saleId,
          plan.sale?.number ?? null,
          plan.saleId ? "Venta" : "Saldo anterior",
          plan.title,
          pesos(plan.totalAmountCents),
          pesos(paid),
          cancelled ? 0 : pesos(plan.totalAmountCents - paid),
          plan.installments.length,
          plan.status,
          dateTime(plan.createdAt),
          dateTime(plan.cancelledAt),
          plan.cancelReason,
        ];
      }),
    ];
  }

  private async collections(): Promise<ExportRows> {
    const entries = await this.prisma.collection.findMany({
      include: { sale: { select: { number: true } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return [
      [
        "ID cobro",
        "ID cliente",
        "Cliente original",
        "ID venta",
        "Comprobante",
        "Fecha",
        "Tipo de cobro",
        "ID medio de cobro",
        "Medio de cobro original",
        "Importe ARS",
        "Importe vigente ARS",
        "Efectivo recibido ARS",
        "Vuelto ARS",
        "Revertido",
        "Fecha de reversión",
        "Motivo de reversión",
        "Registrado el",
      ],
      ...entries.map((entry) => [
        entry.id,
        entry.customerId,
        entry.customerName,
        entry.saleId,
        entry.sale?.number ?? null,
        calendarDate(entry.date),
        entry.kind === "Immediate"
          ? "Contado"
          : entry.kind === "Upfront"
            ? "Anticipo"
            : "Cuotas directas",
        entry.paymentMethodId,
        entry.paymentMethodName,
        pesos(entry.amountCents),
        entry.reversedAt ? 0 : pesos(entry.amountCents),
        pesos(entry.cashReceivedAmountCents),
        pesos(entry.changeAmountCents),
        !!entry.reversedAt,
        dateTime(entry.reversedAt),
        entry.reversalReason,
        dateTime(entry.createdAt),
      ]),
    ];
  }

  private async collectionAllocations(): Promise<ExportRows> {
    const entries = await this.prisma.collectionAllocation.findMany({
      include: {
        collection: true,
        installment: {
          include: {
            plan: { include: { sale: { select: { number: true } } } },
          },
        },
      },
      orderBy: { id: "asc" },
    });
    return [
      [
        "ID aplicación",
        "ID cobro",
        "ID cliente",
        "Cliente original",
        "Fecha del cobro",
        "ID plan",
        "Concepto",
        "ID venta",
        "Comprobante",
        "ID cuota",
        "Cuota",
        "Vencimiento",
        "Importe aplicado ARS",
        "Cobro revertido",
      ],
      ...entries.map((entry) => [
        entry.id,
        entry.collectionId,
        entry.collection.customerId,
        entry.collection.customerName,
        calendarDate(entry.collection.date),
        entry.installment.planId,
        entry.installment.plan.title,
        entry.installment.plan.saleId,
        entry.installment.plan.sale?.number ?? null,
        entry.installmentId,
        entry.installment.number,
        calendarDate(entry.installment.dueDate),
        pesos(entry.amountCents),
        !!entry.collection.reversedAt,
      ]),
    ];
  }

  private async accreditations(): Promise<ExportRows> {
    const entries = await this.prisma.cardAccreditation.findMany({
      include: {
        settlement: {
          include: {
            sale: {
              select: { number: true, customerId: true, customerName: true },
            },
          },
        },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    return [
      [
        "ID acreditación recibida",
        "ID acreditación prevista",
        "ID venta",
        "Comprobante",
        "ID cliente",
        "Cliente original",
        "Procesador",
        "Fecha",
        "Bruto liquidado ARS",
        "Comisión real ARS",
        "Neto recibido ARS",
        "Neto vigente ARS",
        "Referencia",
        "Revertida",
        "Fecha de reversión",
        "Motivo de reversión",
        "Registrada el",
      ],
      ...entries.map((entry) => [
        entry.id,
        entry.settlementId,
        entry.settlement.saleId,
        entry.settlement.sale.number,
        entry.settlement.sale.customerId,
        entry.settlement.sale.customerName,
        entry.settlement.processor,
        calendarDate(entry.date),
        pesos(entry.grossAmountCents),
        pesos(entry.feeAmountCents),
        pesos(entry.grossAmountCents - entry.feeAmountCents),
        entry.reversedAt
          ? 0
          : pesos(entry.grossAmountCents - entry.feeAmountCents),
        entry.reference,
        !!entry.reversedAt,
        dateTime(entry.reversedAt),
        entry.reversalReason,
        dateTime(entry.createdAt),
      ]),
    ];
  }

  private async refunds(): Promise<ExportRows> {
    const entries = await this.prisma.refund.findMany({
      include: {
        sale: { select: { number: true } },
        plan: { select: { title: true } },
        cancellations: true,
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    return [
      [
        "ID devolución",
        "ID cliente",
        "Cliente original",
        "ID venta",
        "Comprobante",
        "ID plan",
        "Concepto del saldo anterior",
        "Fecha",
        "Importe ARS",
        "Egreso de dinero ARS",
        "Egreso vigente ARS",
        "Acreditaciones canceladas ARS",
        "ID medio",
        "Medio original",
        "Motivo",
        "Revertida",
        "Fecha de reversión",
        "Motivo de reversión",
        "Registrada el",
      ],
      ...entries.map((entry) => [
        entry.id,
        entry.customerId,
        entry.customerName,
        entry.saleId,
        entry.sale?.number ?? null,
        entry.planId,
        entry.plan?.title ?? null,
        calendarDate(entry.date),
        pesos(entry.amountCents),
        pesos(entry.cashOutAmountCents),
        entry.reversedAt ? 0 : pesos(entry.cashOutAmountCents),
        pesos(
          entry.cancellations.reduce(
            (sum, cancellation) => sum + cancellation.grossAmountCents,
            0,
          ),
        ),
        entry.paymentMethodId,
        entry.paymentMethodName,
        entry.reason,
        !!entry.reversedAt,
        dateTime(entry.reversedAt),
        entry.reversalReason,
        dateTime(entry.createdAt),
      ]),
    ];
  }

  private async refundCancellations(): Promise<ExportRows> {
    const entries = await this.prisma.refundCancellation.findMany({
      include: {
        refund: true,
        settlement: { include: { sale: { select: { number: true } } } },
      },
      orderBy: { id: "asc" },
    });
    return [
      [
        "ID cancelación",
        "ID devolución",
        "ID acreditación prevista",
        "ID venta",
        "Comprobante",
        "Fecha de devolución",
        "Vencimiento original",
        "Procesador",
        "Bruto cancelado ARS",
        "Devolución revertida",
      ],
      ...entries.map((entry) => [
        entry.id,
        entry.refundId,
        entry.settlementId,
        entry.settlement.saleId,
        entry.settlement.sale.number,
        calendarDate(entry.refund.date),
        calendarDate(entry.settlement.dueDate),
        entry.settlement.processor,
        pesos(entry.grossAmountCents),
        !!entry.refund.reversedAt,
      ]),
    ];
  }

  private async lots(): Promise<ExportRows> {
    const lots = await this.prisma.inventoryLot.findMany({
      include: {
        product: { select: { name: true, barcode: true, archived: true } },
        purchaseItem: { select: { purchaseId: true } },
        payable: { include: { supplier: { select: { name: true } } } },
        originMovement: true,
      },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    });
    return [
      [
        "ID ingreso",
        "ID producto",
        "Producto",
        "Código de barras",
        "Producto archivado",
        "Clasificación actual",
        "Cantidad inicial",
        "Cantidad restante",
        "Costo unitario histórico ARS",
        "Valor restante al costo ARS",
        "Fecha de ingreso",
        "ID compra",
        "ID ítem de compra",
        "ID deuda",
        "Proveedor de la deuda",
        "ID movimiento de origen",
        "Tipo de origen",
        "ID origen",
        "Nota de origen",
      ],
      ...lots.map((lot) => [
        lot.id,
        lot.productId,
        lot.product.name,
        lot.product.barcode,
        lot.product.archived,
        lot.classification === "Pagada"
          ? "Pagada"
          : lot.classification === "Credito"
            ? "A crédito"
            : "Sin clasificar",
        lot.initialQty,
        lot.remainingQty,
        pesos(lot.unitCostAmountCents),
        pesos(lot.unitCostAmountCents * lot.remainingQty),
        dateTime(lot.receivedAt),
        lot.purchaseItem?.purchaseId ?? null,
        lot.purchaseItemId,
        lot.payableId,
        lot.payable?.supplier.name ?? null,
        lot.originMovementId,
        lot.originMovement?.sourceType ?? null,
        lot.originMovement?.sourceId ?? null,
        lot.originMovement?.note ?? null,
      ]),
    ];
  }

  private async inventoryAllocations(): Promise<ExportRows> {
    const entries = await this.prisma.inventoryAllocation.findMany({
      include: {
        lot: { include: { product: { select: { name: true } } } },
        stockMovement: true,
      },
      orderBy: { id: "asc" },
    });
    return [
      [
        "ID asignación",
        "ID ingreso",
        "ID producto",
        "Producto",
        "ID movimiento",
        "Fecha y hora",
        "Tipo de movimiento",
        "Tipo de origen",
        "ID origen",
        "Cantidad aplicada",
        "Costo unitario histórico ARS",
        "Valor al costo ARS",
        "Reverso del movimiento",
      ],
      ...entries.map((entry) => [
        entry.id,
        entry.lotId,
        entry.lot.productId,
        entry.lot.product.name,
        entry.stockMovementId,
        dateTime(entry.stockMovement.createdAt),
        entry.stockMovement.type,
        entry.stockMovement.sourceType,
        entry.stockMovement.sourceId,
        entry.qty,
        pesos(entry.lot.unitCostAmountCents),
        pesos(entry.qty * entry.lot.unitCostAmountCents),
        entry.stockMovement.reversalOfId,
      ]),
    ];
  }
}
