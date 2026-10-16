import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  businessToday,
  canonicalPayload,
  money,
  validateBusinessDate,
} from "../collections/finance-rules";
import {
  SupplierOpeningDto,
  SupplierPaymentDto,
  SupplierPayablesQueryDto,
} from "./supplier-payables.dto";

const payableInclude = {
  supplier: true,
  payments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  refunds: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
} satisfies Prisma.SupplierPayableInclude;
type Payable = Prisma.SupplierPayableGetPayload<{
  include: typeof payableInclude;
}>;
type Tx = Prisma.TransactionClient;

@Injectable()
export class SupplierPayablesService {
  constructor(private readonly prisma: PrismaService) {}

  serialize(payable: Payable) {
    const paid = payable.payments
      .filter((p) => !p.reversedAt)
      .reduce((sum, p) => sum + p.amountCents, 0);
    const refunded = payable.refunds
      .filter((p) => !p.reversedAt)
      .reduce((sum, p) => sum + p.amountCents, 0);
    const cancelled = payable.status === "Anulada";
    const balanceCents = cancelled
      ? 0
      : Math.max(0, payable.amountCents - paid);
    return {
      id: payable.id,
      supplierId: payable.supplierId,
      supplierName: payable.supplier.name,
      purchaseId: payable.purchaseId,
      title: payable.title,
      amountCents: payable.amountCents,
      dueDate: payable.dueDate,
      status: cancelled
        ? "Anulada"
        : balanceCents === 0
          ? "Pagada"
          : payable.dueDate < businessToday()
            ? "Vencida"
            : "Pendiente",
      balanceCents,
      refundPendingCents: cancelled ? Math.max(0, paid - refunded) : 0,
      cancelReason: payable.cancelReason,
      cancelledAt: payable.cancelledAt?.toISOString() ?? null,
      payments: payable.payments.map((p) => ({
        ...p,
        reversedAt: p.reversedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
      refunds: payable.refunds.map((p) => ({
        ...p,
        reversedAt: p.reversedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  private async rows(query: SupplierPayablesQueryDto = {}) {
    if (query.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(query.month))
      throw new BadRequestException("El mes no es válido.");
    const payables = await this.prisma.supplierPayable.findMany({
      where: {
        supplierId: query.supplierId,
        ...(query.month ? { dueDate: { startsWith: `${query.month}-` } } : {}),
        ...(query.q?.trim()
          ? {
              OR: [
                { title: { contains: query.q.trim() } },
                { supplier: { name: { contains: query.q.trim() } } },
              ],
            }
          : {}),
      },
      include: payableInclude,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });
    return payables
      .map((row) => this.serialize(row))
      .filter((row) => !query.status || row.status === query.status);
  }

  async findAll(query: SupplierPayablesQueryDto = {}) {
    const rows = await this.rows(query);
    const skip = query.skip ?? 0,
      take = query.take ?? 100;
    return {
      items: rows.slice(skip, skip + take),
      total: rows.length,
      hasMore: skip + take < rows.length,
    };
  }

  async summary(query: SupplierPayablesQueryDto = {}) {
    if (query.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(query.month))
      throw new BadRequestException("El mes no es válido.");
    const rows = await this.rows({ supplierId: query.supplierId });
    const month = query.month ?? businessToday().slice(0, 7);
    return {
      balanceCents: rows.reduce((sum, row) => sum + row.balanceCents, 0),
      overdueCents: rows.reduce(
        (sum, row) => sum + (row.status === "Vencida" ? row.balanceCents : 0),
        0,
      ),
      dueThisMonthCents: rows.reduce(
        (sum, row) =>
          sum + (row.dueDate.startsWith(`${month}-`) ? row.balanceCents : 0),
        0,
      ),
      paidAmountCents: rows.reduce(
        (sum, row) =>
          sum +
          row.payments
            .filter((p) => !p.reversedAt && p.date.startsWith(`${month}-`))
            .reduce((paid, p) => paid + p.amountCents, 0),
        0,
      ),
      refundPendingCents: rows.reduce(
        (sum, row) => sum + row.refundPendingCents,
        0,
      ),
    };
  }

  async account(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true },
    });
    if (!supplier) throw new NotFoundException("Proveedor no encontrado.");
    const payables = await this.rows({ supplierId });
    return {
      supplier,
      payables,
      balanceCents: payables.reduce((s, p) => s + p.balanceCents, 0),
      overdueCents: payables.reduce(
        (s, p) => s + (p.status === "Vencida" ? p.balanceCents : 0),
        0,
      ),
      refundPendingCents: payables.reduce(
        (s, p) => s + p.refundPendingCents,
        0,
      ),
    };
  }

  async previousOperation(
    tx: Tx,
    operationId: string,
    kind: string,
    payload: unknown,
  ) {
    if (!operationId?.trim() || operationId.length > 128)
      throw new BadRequestException("Falta el identificador de operación.");
    const previous = await tx.financialOperation.findUnique({
      where: { operationId },
    });
    if (
      previous &&
      (previous.kind !== kind || previous.payload !== canonicalPayload(payload))
    )
      throw new ConflictException(
        "El identificador de operación ya se utilizó con otros datos.",
      );
    return previous;
  }

  saveOperation(
    tx: Tx,
    operationId: string,
    kind: string,
    payload: unknown,
    resultId: string,
  ) {
    return tx.financialOperation.create({
      data: { operationId, kind, payload: canonicalPayload(payload), resultId },
    });
  }

  async createOpening(dto: SupplierOpeningDto) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.previousOperation(
        tx,
        dto.operationId,
        "SupplierOpening",
        dto,
      );
      if (previous)
        return this.serialize(await this.load(tx, previous.resultId));
      const supplier = await tx.supplier.findUnique({
        where: { id: dto.supplierId },
      });
      if (!supplier) throw new NotFoundException("Proveedor no encontrado.");
      if (!supplier.active)
        throw new ConflictException("El proveedor está inactivo.");
      if (!dto.title?.trim())
        throw new BadRequestException("Indique el concepto.");
      const row = await tx.supplierPayable.create({
        data: {
          supplierId: dto.supplierId,
          title: dto.title.trim(),
          amountCents: money(dto.amountCents, true),
          dueDate: validateBusinessDate(dto.dueDate),
        },
        include: payableInclude,
      });
      await this.saveOperation(
        tx,
        dto.operationId,
        "SupplierOpening",
        dto,
        row.id,
      );
      return this.serialize(row);
    });
  }

  async pay(id: string, dto: SupplierPaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const payload = { payableId: id, ...dto };
      const previous = await this.previousOperation(
        tx,
        dto.operationId,
        "SupplierPayment",
        payload,
      );
      if (previous) {
        const payment = await tx.supplierPayment.findUniqueOrThrow({
          where: { id: previous.resultId },
        });
        return payment;
      }
      const payable = await this.load(tx, id);
      const row = this.serialize(payable);
      if (payable.status !== "Activa" || row.balanceCents <= 0)
        throw new ConflictException(
          "La obligación no tiene un saldo activo pendiente.",
        );
      const payment = await tx.supplierPayment.create({
        data: {
          payableId: id,
          amountCents: row.balanceCents,
          ...this.paymentFields(dto),
        },
      });
      await tx.inventoryLot.updateMany({
        where: { payableId: id },
        data: { classification: "Pagada" },
      });
      await this.saveOperation(
        tx,
        dto.operationId,
        "SupplierPayment",
        payload,
        payment.id,
      );
      return payment;
    });
  }

  async reversePayment(id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.findUnique({ where: { id } });
      if (!payment) throw new NotFoundException("Pago no encontrado.");
      const payable = await this.load(tx, payment.payableId);
      if (payment.reversedAt || payable.status !== "Activa")
        throw new ConflictException(
          "El pago ya está revertido o la obligación está anulada.",
        );
      await tx.supplierPayment.update({
        where: { id },
        data: { reversedAt: new Date(), reversalReason: this.reason(reason) },
      });
      await tx.inventoryLot.updateMany({
        where: { payableId: payment.payableId },
        data: { classification: "Credito" },
      });
      return this.serialize(await this.load(tx, payment.payableId));
    });
  }

  async refund(id: string, dto: SupplierPaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const payload = { payableId: id, ...dto };
      const previous = await this.previousOperation(
        tx,
        dto.operationId,
        "SupplierRefund",
        payload,
      );
      if (previous) {
        const refund = await tx.supplierRefund.findUniqueOrThrow({
          where: { id: previous.resultId },
        });
        return refund;
      }
      const payable = await this.load(tx, id);
      const amountCents = this.serialize(payable).refundPendingCents;
      if (payable.status !== "Anulada" || amountCents <= 0)
        throw new ConflictException(
          "No hay devolución del proveedor pendiente.",
        );
      const refund = await tx.supplierRefund.create({
        data: { payableId: id, amountCents, ...this.paymentFields(dto) },
      });
      await this.saveOperation(
        tx,
        dto.operationId,
        "SupplierRefund",
        payload,
        refund.id,
      );
      return refund;
    });
  }

  async reverseRefund(id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.supplierRefund.findUnique({ where: { id } });
      if (!refund) throw new NotFoundException("Devolución no encontrada.");
      if (refund.reversedAt)
        throw new ConflictException("La devolución ya está revertida.");
      await tx.supplierRefund.update({
        where: { id },
        data: { reversedAt: new Date(), reversalReason: this.reason(reason) },
      });
      return this.serialize(await this.load(tx, refund.payableId));
    });
  }

  async cancel(id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const payable = await this.load(tx, id);
      if (payable.purchaseId)
        throw new ConflictException(
          "Anulá la compra vinculada para cancelar esta obligación.",
        );
      if (payable.status !== "Activa")
        throw new ConflictException("La obligación ya está anulada.");
      const lots = await tx.inventoryLot.findMany({
        where: { payableId: id },
        select: { originMovementId: true },
      });
      const reversed = await tx.stockMovement.findMany({
        where: {
          reversalOfId: {
            in: lots.flatMap((lot) =>
              lot.originMovementId ? [lot.originMovementId] : [],
            ),
          },
        },
        select: { reversalOfId: true },
      });
      const reversedIds = new Set(
        reversed.map((movement) => movement.reversalOfId),
      );
      if (
        lots.some(
          (lot) =>
            !lot.originMovementId || !reversedIds.has(lot.originMovementId),
        )
      )
        throw new ConflictException(
          "Revertí primero la clasificación de stock vinculada a esta deuda. Las unidades vendidas pueden volver al anular su venta.",
        );
      await tx.supplierPayable.update({
        where: { id },
        data: {
          status: "Anulada",
          cancelledAt: new Date(),
          cancelReason: this.reason(reason),
        },
      });
      return this.serialize(await this.load(tx, id));
    });
  }

  async load(tx: Tx, id: string) {
    const payable = await tx.supplierPayable.findUnique({
      where: { id },
      include: payableInclude,
    });
    if (!payable)
      throw new NotFoundException("Obligación del proveedor no encontrada.");
    return payable;
  }

  paymentFields(
    dto: Pick<SupplierPaymentDto, "date" | "method" | "reference">,
  ) {
    if (!["Efectivo", "Transferencia", "QR"].includes(dto.method))
      throw new BadRequestException("El medio de pago no es válido.");
    return {
      date: validateBusinessDate(dto.date, true),
      method: dto.method,
      reference: dto.reference?.trim() || null,
    };
  }

  private reason(reason: string) {
    if (!reason?.trim()) throw new BadRequestException("Indique el motivo.");
    return reason.trim();
  }
}
