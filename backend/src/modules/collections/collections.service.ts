import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type Sale } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  AccreditationDto,
  CardScheduleDto,
  CreateCollectionDto,
  CreateCustomerDto,
  CreateRefundDto,
  FinanceQueryDto,
  OpeningBalanceDto,
  UpdateCustomerDto,
} from "./collections.dto";
import {
  businessToday,
  canonicalPayload,
  money,
  monthlySchedule,
  validateAllocations,
  validateBusinessDate,
} from "./finance-rules";
import {
  buildCardSettlementSchedule,
  type SaleFinance,
} from "../sales/sale-finance";

const installmentInclude = {
  plan: { include: { customer: true, sale: true } },
  allocations: { include: { collection: true } },
} satisfies Prisma.ReceivableInstallmentInclude;
const settlementInclude = {
  sale: true,
  accreditations: { orderBy: { createdAt: "asc" } },
  cancellations: { include: { refund: true } },
} satisfies Prisma.CardSettlementInclude;
type Installment = Prisma.ReceivableInstallmentGetPayload<{
  include: typeof installmentInclude;
}>;
type Settlement = Prisma.CardSettlementGetPayload<{
  include: typeof settlementInclude;
}>;
type CardBalanceRow = {
  schedulePending: boolean;
  remainingGrossAmountCents: number;
  remainingNetAmountCents: number | null;
};
type Tx = Prisma.TransactionClient;

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  private page<T>(items: T[], query: FinanceQueryDto) {
    const skip = query.skip ?? 0;
    const take = query.take ?? 100;
    return {
      items: items.slice(skip, skip + take),
      total: items.length,
      hasMore: skip + take < items.length,
    };
  }

  private reason(reason: string) {
    if (!reason?.trim()) throw new BadRequestException("Indique el motivo.");
    return reason.trim();
  }

  private async customer(tx: Tx, id: string) {
    const customer = await tx.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException("Cliente no encontrado.");
    return customer;
  }

  async listCustomers(query: FinanceQueryDto = {}) {
    const debtors = query.debtStatus
      ? await this.prisma.$queryRaw<Array<{ customerId: string }>>(Prisma.sql`
          SELECT DISTINCT p.customerId FROM ReceivablePlan p
          JOIN ReceivableInstallment i ON i.planId = p.id
          LEFT JOIN Sale s ON s.id = p.saleId
          WHERE p.status = 'Activo' AND (p.saleId IS NULL OR s.status = 'Confirmada')
          AND i.amountCents > (
            SELECT COALESCE(SUM(a.amountCents), 0) FROM CollectionAllocation a
            JOIN Collection c ON c.id = a.collectionId
            WHERE a.installmentId = i.id AND c.reversedAt IS NULL
          )
          ${query.debtStatus === "overdue" ? Prisma.sql`AND i.dueDate < ${businessToday()}` : Prisma.empty}
        `)
      : undefined;
    const where: Prisma.CustomerWhereInput = {
      ...(debtors ? { id: { in: debtors.map((row) => row.customerId) } } : {}),
      ...(query.includeInactive === "true" ? {} : { active: true }),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q.trim() } },
              { phone: { contains: query.q.trim() } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        include: {
          plans: {
            where: {
              status: "Activo",
              OR: [{ saleId: null }, { sale: { status: "Confirmada" } }],
            },
            select: {
              installments: {
                select: {
                  amountCents: true,
                  dueDate: true,
                  allocations: {
                    where: { collection: { reversedAt: null } },
                    select: { amountCents: true },
                  },
                },
              },
            },
          },
          sales: {
            where: { paymentTerms: "CardInstallments" },
            include: {
              cardSettlements: { include: settlementInclude },
            },
          },
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: query.take ?? 100,
        skip: query.skip ?? 0,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return {
      items: items.map(({ plans, sales, ...customer }) => {
        const settlements = sales.flatMap<CardBalanceRow>((sale) => {
          if (sale.cardSettlements.length)
            return sale.cardSettlements.map((row) => this.settlementRow(row));
          const deferred = this.deferredSettlementRow(sale);
          return deferred ? [deferred] : [];
        });
        return {
          ...customer,
          balanceAmountCents: plans.reduce(
            (sum, plan) =>
              sum +
              plan.installments.reduce(
                (balance, installment) =>
                  balance +
                  installment.amountCents -
                  installment.allocations.reduce(
                    (paid, allocation) => paid + allocation.amountCents,
                    0,
                  ),
                0,
              ),
            0,
          ),
          overdueAmountCents: plans.reduce(
            (sum, plan) =>
              sum +
              plan.installments
                .filter((installment) => installment.dueDate < businessToday())
                .reduce(
                  (balance, installment) =>
                    balance +
                    installment.amountCents -
                    installment.allocations.reduce(
                      (paid, allocation) => paid + allocation.amountCents,
                      0,
                    ),
                  0,
                ),
            0,
          ),
          ...this.cardBalances(settlements),
        };
      }),
      total,
      hasMore: (query.skip ?? 0) + items.length < total,
    };
  }

  async createCustomer(dto: CreateCustomerDto) {
    if (!dto.name?.trim())
      throw new BadRequestException("El nombre es obligatorio.");
    return this.prisma.customer.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async updateCustomer(id: string, dto: UpdateCustomerDto) {
    await this.customer(this.prisma, id);
    if (dto.name !== undefined && !dto.name.trim())
      throw new BadRequestException("El nombre es obligatorio.");
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined
          ? { phone: dto.phone?.trim() || null }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  private async operation(
    tx: Tx,
    operationId: string,
    kind: string,
    payload: unknown,
  ) {
    if (!operationId?.trim() || operationId.length > 128)
      throw new BadRequestException("Falta el identificador de operación.");
    const existing = await tx.financialOperation.findUnique({
      where: { operationId },
    });
    if (
      existing &&
      (existing.kind !== kind || existing.payload !== canonicalPayload(payload))
    )
      throw new ConflictException(
        "El identificador de operación ya se utilizó con otros datos.",
      );
    return existing;
  }

  private saveOperation(
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

  async createOpeningBalance(customerId: string, dto: OpeningBalanceDto) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.operation(
        tx,
        dto.operationId,
        "OpeningBalance",
        { customerId, ...dto },
      );
      if (previous)
        return tx.receivablePlan.findUniqueOrThrow({
          where: { id: previous.resultId },
          include: { installments: { orderBy: { number: "asc" } } },
        });
      await this.customer(tx, customerId);
      const title = this.reason(dto.title);
      const installments = monthlySchedule(
        dto.totalAmountCents,
        dto.installmentCount,
        dto.firstDueDate,
      );
      const plan = await tx.receivablePlan.create({
        data: {
          customerId,
          title,
          totalAmountCents: dto.totalAmountCents,
          installments: { create: installments },
        },
        include: { installments: { orderBy: { number: "asc" } } },
      });
      await this.saveOperation(
        tx,
        dto.operationId,
        "OpeningBalance",
        { customerId, ...dto },
        plan.id,
      );
      return plan;
    });
  }

  async cancelPlan(customerId: string, planId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.receivablePlan.findUnique({
        where: { id: planId },
      });
      if (!plan || plan.customerId !== customerId)
        throw new NotFoundException("Plan no encontrado.");
      if (plan.saleId)
        throw new BadRequestException("Anule la venta para cancelar su plan.");
      if (plan.status !== "Activo")
        throw new ConflictException("El plan ya está anulado.");
      return tx.receivablePlan.update({
        where: { id: planId },
        data: {
          status: "Anulado",
          cancelReason: this.reason(reason),
          cancelledAt: new Date(),
        },
      });
    });
  }

  private installmentRow(row: Installment) {
    const paidAmountCents = row.allocations
      .filter((a) => !a.collection.reversedAt)
      .reduce((sum, a) => sum + a.amountCents, 0);
    const cancelled =
      row.plan.status !== "Activo" || row.plan.sale?.status === "Anulada";
    const remainingAmountCents = cancelled
      ? 0
      : row.amountCents - paidAmountCents;
    const status = cancelled
      ? "Anulada"
      : remainingAmountCents === 0
        ? "Pagada"
        : row.dueDate < businessToday()
          ? "Vencida"
          : paidAmountCents > 0
            ? "Parcial"
            : "Pendiente";
    return {
      id: row.id,
      planId: row.planId,
      number: row.number,
      dueDate: row.dueDate,
      amountCents: row.amountCents,
      paidAmountCents,
      remainingAmountCents,
      status,
      customerId: row.plan.customerId,
      customerName: row.plan.customer.name,
      title: row.plan.title,
      saleId: row.plan.saleId,
      saleNumber: row.plan.sale?.number ?? null,
    };
  }

  private async installmentRows(
    query: FinanceQueryDto = {},
    tx: Tx = this.prisma,
  ) {
    const rows = await tx.receivableInstallment.findMany({
      where: {
        ...(query.month ? { dueDate: { startsWith: query.month } } : {}),
        plan: { ...(query.customerId ? { customerId: query.customerId } : {}) },
      },
      include: installmentInclude,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });
    const q = query.q?.trim().toLocaleLowerCase();
    return rows
      .map((row) => this.installmentRow(row))
      .filter(
        (row) =>
          (!query.status || row.status === query.status) &&
          (!q ||
            `${row.customerName} ${row.title} ${row.saleNumber ?? ""}`
              .toLocaleLowerCase()
              .includes(q)),
      );
  }

  async listInstallments(query: FinanceQueryDto = {}) {
    return this.page(await this.installmentRows(query), query);
  }

  async paymentForCollection(
    tx: Tx,
    paymentMethodId: string,
    amount: number,
    received?: number,
  ) {
    const method = await tx.paymentMethod.findUnique({
      where: { id: paymentMethodId },
    });
    if (!method?.enabled || !method.collectionEligible)
      throw new BadRequestException(
        "Seleccione un medio habilitado para cobranzas.",
      );
    if (method.cashHandling) {
      if (received === undefined || money(received) < amount)
        throw new BadRequestException("El efectivo recibido no alcanza.");
    } else if (received !== undefined)
      throw new BadRequestException("Este medio no permite efectivo recibido.");
    return method;
  }

  async createCollection(dto: CreateCollectionDto) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.operation(
        tx,
        dto.operationId,
        "Collection",
        dto,
      );
      if (previous)
        return tx.collection.findUniqueOrThrow({
          where: { id: previous.resultId },
          include: { allocations: true },
        });
      validateBusinessDate(dto.date, true);
      validateAllocations(dto.amountCents, dto.allocations);
      const customer = await this.customer(tx, dto.customerId);
      const method = await this.paymentForCollection(
        tx,
        dto.paymentMethodId,
        dto.amountCents,
        dto.cashReceivedAmountCents,
      );
      const installments = await tx.receivableInstallment.findMany({
        where: { id: { in: dto.allocations.map((a) => a.installmentId) } },
        include: installmentInclude,
      });
      for (const allocation of dto.allocations) {
        const installment = installments.find(
          (i) => i.id === allocation.installmentId,
        );
        if (!installment || installment.plan.customerId !== dto.customerId)
          throw new BadRequestException(
            "Las cuotas deben pertenecer al cliente elegido.",
          );
        if (
          this.installmentRow(installment).remainingAmountCents <
          allocation.amountCents
        )
          throw new ConflictException(
            "El importe supera el saldo de una cuota o el plan está anulado.",
          );
      }
      const collection = await tx.collection.create({
        data: {
          customerId: customer.id,
          customerName: customer.name,
          date: dto.date,
          paymentMethodId: method.id,
          paymentMethodName: method.name,
          amountCents: dto.amountCents,
          cashReceivedAmountCents: method.cashHandling
            ? dto.cashReceivedAmountCents
            : null,
          changeAmountCents: method.cashHandling
            ? dto.cashReceivedAmountCents! - dto.amountCents
            : null,
          allocations: { create: dto.allocations },
        },
        include: { allocations: true },
      });
      await this.saveOperation(
        tx,
        dto.operationId,
        "Collection",
        dto,
        collection.id,
      );
      return collection;
    });
  }

  async reverseCollection(id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const collection = await tx.collection.findUnique({
        where: { id },
        include: {
          sale: { select: { status: true } },
          allocations: {
            include: { installment: { include: { plan: true } } },
          },
        },
      });
      if (!collection) throw new NotFoundException("Cobranza no encontrada.");
      if (collection.reversedAt)
        throw new ConflictException("La cobranza ya está revertida.");
      if (collection.saleId && collection.sale?.status !== "Anulada") {
        throw new ConflictException(
          "Anulá primero la venta para corregir su cobro inicial o anticipo.",
        );
      }
      const sources = await this.refundSources({}, tx);
      for (const source of sources) {
        const attributed =
          collection.saleId && source.saleId === collection.saleId
            ? collection.amountCents
            : collection.allocations
                .filter((a) =>
                  source.saleId
                    ? a.installment.plan.saleId === source.saleId
                    : a.installment.planId === source.planId,
                )
                .reduce((sum, a) => sum + a.amountCents, 0);
        if (
          attributed &&
          source.paymentTerms !== "CardInstallments" &&
          source.refundableAmountCents - attributed < source.refundedAmountCents
        )
          throw new ConflictException(
            "Revierta primero las devoluciones que dependen de esta cobranza.",
          );
      }
      return tx.collection.update({
        where: { id },
        data: { reversedAt: new Date(), reversalReason: this.reason(reason) },
      });
    });
  }

  private cardBalances(rows: CardBalanceRow[]) {
    return {
      cardPendingAmountCents: rows.reduce(
        (sum, row) => sum + (row.remainingNetAmountCents ?? 0),
        0,
      ),
      cardUnscheduledAmountCents: rows
        .filter((row) => row.schedulePending)
        .reduce((sum, row) => sum + row.remainingGrossAmountCents, 0),
    };
  }

  private settlementRow(row: Settlement) {
    const creditedGrossAmountCents = row.accreditations
      .filter((a) => !a.reversedAt)
      .reduce((sum, a) => sum + a.grossAmountCents, 0);
    const creditedNetAmountCents = row.accreditations
      .filter((a) => !a.reversedAt)
      .reduce((sum, a) => sum + a.grossAmountCents - a.feeAmountCents, 0);
    const cancelledGrossAmountCents = row.cancellations
      .filter((c) => !c.refund.reversedAt)
      .reduce((sum, c) => sum + c.grossAmountCents, 0);
    const remainingGrossAmountCents =
      row.grossAmountCents -
      creditedGrossAmountCents -
      cancelledGrossAmountCents;
    const remainingNetAmountCents = Math.round(
      (remainingGrossAmountCents *
        (row.grossAmountCents - row.feeAmountCents)) /
        row.grossAmountCents,
    );
    return {
      id: row.id,
      saleId: row.saleId,
      schedulePending: false,
      saleNumber: row.sale.number,
      customerId: row.sale.customerId,
      customerName: row.sale.customerName,
      processor: row.processor,
      reference: row.reference,
      number: row.number,
      dueDate: row.dueDate,
      grossAmountCents: row.grossAmountCents,
      feeAmountCents: row.feeAmountCents,
      netAmountCents: row.grossAmountCents - row.feeAmountCents,
      creditedGrossAmountCents,
      creditedNetAmountCents,
      cancelledGrossAmountCents,
      remainingGrossAmountCents,
      remainingNetAmountCents,
      status:
        remainingGrossAmountCents === 0
          ? cancelledGrossAmountCents === row.grossAmountCents
            ? "Anulada"
            : "Acreditada"
          : creditedGrossAmountCents > 0
            ? "Parcial"
            : row.dueDate < businessToday()
              ? "Vencida"
              : "Pendiente",
      accreditations: row.accreditations.map((a) => ({
        ...a,
        netAmountCents: a.grossAmountCents - a.feeAmountCents,
      })),
    };
  }

  private async settlementRows(
    query: FinanceQueryDto = {},
    tx: Tx = this.prisma,
  ) {
    const rows = await tx.cardSettlement.findMany({
      where: {
        ...(query.month ? { dueDate: { startsWith: query.month } } : {}),
        ...(query.customerId ? { sale: { customerId: query.customerId } } : {}),
      },
      include: settlementInclude,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });
    // An unscheduled deposit has no business date yet, so it remains visible
    // in every month until the user supplies the expected calendar.
    const deferredSales = await tx.sale.findMany({
      where: {
        paymentTerms: "CardInstallments",
        cardSettlements: { none: {} },
        ...(query.customerId ? { customerId: query.customerId } : {}),
      },
      orderBy: { date: "asc" },
    });
    const pending = deferredSales.flatMap((sale) => {
      const row = this.deferredSettlementRow(sale);
      return row ? [row] : [];
    });
    const q = query.q?.trim().toLocaleLowerCase();
    return [...pending, ...rows.map((row) => this.settlementRow(row))].filter(
      (row) =>
        (!query.status || row.status === query.status) &&
        (!q ||
          `${row.customerName ?? ""} ${row.saleNumber} ${row.processor} ${row.reference ?? ""}`
            .toLocaleLowerCase()
            .includes(q)),
    );
  }

  async listSettlements(query: FinanceQueryDto = {}) {
    return this.page(await this.settlementRows(query), query);
  }

  private deferredSettlementRow(sale: Sale) {
    const finance = sale.financeSnapshot
      ? (JSON.parse(sale.financeSnapshot) as SaleFinance)
      : null;
    if (!finance?.cardPlan?.deferred) return null;
    return {
      id: `unscheduled:${sale.id}`,
      saleId: sale.id,
      saleNumber: sale.number,
      customerId: sale.customerId,
      customerName: sale.customerName,
      processor: finance.cardPlan.processor,
      reference: finance.cardPlan.reference ?? null,
      schedulePending: true,
      number: 0,
      dueDate: null,
      grossAmountCents: sale.totalAmountCents,
      feeAmountCents: null,
      netAmountCents: null,
      creditedGrossAmountCents: 0,
      creditedNetAmountCents: 0,
      cancelledGrossAmountCents: 0,
      remainingGrossAmountCents: sale.totalAmountCents,
      remainingNetAmountCents: null,
      status: "Por completar",
      accreditations: [] as ReturnType<
        CollectionsService["settlementRow"]
      >["accreditations"],
    };
  }

  async scheduleCardSale(saleId: string, dto: CardScheduleDto) {
    return this.prisma.$transaction(async (tx) => {
      const payload = { saleId, ...dto };
      const previous = await this.operation(
        tx,
        dto.operationId,
        "CardSchedule",
        payload,
      );
      if (previous)
        return tx.cardSettlement.findMany({
          where: { saleId },
          orderBy: { number: "asc" },
        });
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { cardSettlements: true },
      });
      if (
        !sale ||
        sale.paymentTerms !== "CardInstallments" ||
        !this.deferredSettlementRow(sale)
      )
        throw new BadRequestException(
          "La venta no tiene un calendario de tarjeta por completar.",
        );
      if (sale.cardSettlements.length)
        throw new ConflictException(
          "El calendario de acreditaciones ya está confirmado.",
        );
      const card = (JSON.parse(sale.financeSnapshot!) as SaleFinance).cardPlan!;
      const schedule = buildCardSettlementSchedule(
        dto.settlements,
        sale.totalAmountCents,
      );
      const rows = [];
      for (const row of schedule) {
        rows.push(
          await tx.cardSettlement.create({
            data: {
              saleId,
              processor: card.processor,
              reference: card.reference ?? null,
              number: row.number,
              dueDate: row.dueDate,
              grossAmountCents: row.grossAmountCents,
              feeAmountCents: row.feeAmountCents,
            },
          }),
        );
      }
      await this.saveOperation(
        tx,
        dto.operationId,
        "CardSchedule",
        payload,
        saleId,
      );
      return rows;
    });
  }

  async accredit(settlementId: string, dto: AccreditationDto) {
    return this.prisma.$transaction(async (tx) => {
      const payload = { settlementId, ...dto };
      const previous = await this.operation(
        tx,
        dto.operationId,
        "Accreditation",
        payload,
      );
      if (previous) {
        const accreditation = await tx.cardAccreditation.findUniqueOrThrow({
          where: { id: previous.resultId },
        });
        return {
          ...accreditation,
          netAmountCents:
            accreditation.grossAmountCents - accreditation.feeAmountCents,
        };
      }
      validateBusinessDate(dto.date, true);
      money(dto.grossAmountCents, true);
      money(dto.feeAmountCents);
      const settlement = await tx.cardSettlement.findUnique({
        where: { id: settlementId },
        include: settlementInclude,
      });
      if (!settlement)
        throw new NotFoundException("Acreditación esperada no encontrada.");
      if (
        dto.feeAmountCents > dto.grossAmountCents ||
        dto.grossAmountCents >
          this.settlementRow(settlement).remainingGrossAmountCents
      )
        throw new ConflictException(
          "El bruto supera el pendiente o la comisión supera el bruto.",
        );
      const accreditation = await tx.cardAccreditation.create({
        data: {
          settlementId,
          date: dto.date,
          grossAmountCents: dto.grossAmountCents,
          feeAmountCents: dto.feeAmountCents,
          reference: dto.reference?.trim() || null,
        },
      });
      await this.saveOperation(
        tx,
        dto.operationId,
        "Accreditation",
        payload,
        accreditation.id,
      );
      return {
        ...accreditation,
        netAmountCents:
          accreditation.grossAmountCents - accreditation.feeAmountCents,
      };
    });
  }

  async reverseAccreditation(id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.cardAccreditation.findUnique({ where: { id } });
      if (!row) throw new NotFoundException("Acreditación no encontrada.");
      if (row.reversedAt)
        throw new ConflictException("La acreditación ya está revertida.");
      return tx.cardAccreditation.update({
        where: { id },
        data: { reversedAt: new Date(), reversalReason: this.reason(reason) },
      });
    });
  }

  private async refundSources(
    query: FinanceQueryDto = {},
    tx: Tx = this.prisma,
  ) {
    const [sales, plans, collections, refunds, settlements] = await Promise.all(
      [
        tx.sale.findMany({
          where: {
            status: "Anulada",
            paymentTerms: { not: null },
            ...(query.customerId ? { customerId: query.customerId } : {}),
          },
          include: { receivablePlan: true },
        }),
        tx.receivablePlan.findMany({
          where: {
            status: "Anulado",
            saleId: null,
            ...(query.customerId ? { customerId: query.customerId } : {}),
          },
          include: { customer: true },
        }),
        tx.collection.findMany({
          where: { reversedAt: null },
          include: {
            allocations: {
              include: { installment: { include: { plan: true } } },
            },
          },
        }),
        tx.refund.findMany({ orderBy: { createdAt: "asc" } }),
        this.settlementRows({}, tx),
      ],
    );
    const sources = [
      ...sales.map((sale) => ({
        saleId: sale.id,
        planId: sale.receivablePlan?.id ?? null,
        customerId: sale.customerId,
        customerName: sale.customerName,
        title: `Venta ${sale.number}`,
        paymentTerms: sale.paymentTerms,
        cancelledAt: sale.cancelledAt,
        refundableAmountCents:
          sale.paymentTerms === "CardInstallments"
            ? sale.totalAmountCents
            : collections.reduce(
                (sum, c) =>
                  sum +
                  (c.saleId === sale.id
                    ? c.amountCents
                    : c.allocations
                        .filter((a) => a.installment.plan.saleId === sale.id)
                        .reduce((s, a) => s + a.amountCents, 0)),
                0,
              ),
        settlements: settlements.filter((s) => s.saleId === sale.id),
      })),
      ...plans.map((plan) => ({
        saleId: null,
        planId: plan.id,
        customerId: plan.customerId,
        customerName: plan.customer.name,
        title: plan.title,
        paymentTerms: "OpeningBalance",
        cancelledAt: plan.cancelledAt,
        refundableAmountCents: collections.reduce(
          (sum, c) =>
            sum +
            c.allocations
              .filter((a) => a.installment.planId === plan.id)
              .reduce((s, a) => s + a.amountCents, 0),
          0,
        ),
        settlements: [] as ReturnType<CollectionsService["settlementRow"]>[],
      })),
    ].map((source) => {
      const entries = refunds.filter((r) =>
        source.saleId
          ? r.saleId === source.saleId
          : r.planId === source.planId && !r.saleId,
      );
      const refundedAmountCents = entries
        .filter((r) => !r.reversedAt)
        .reduce((sum, r) => sum + r.amountCents, 0);
      return {
        ...source,
        refundedAmountCents,
        pendingAmountCents: source.refundableAmountCents - refundedAmountCents,
        refunds: entries,
      };
    });
    const q = query.q?.trim().toLocaleLowerCase();
    return sources.filter(
      (source) =>
        (!q ||
          `${source.customerName ?? ""} ${source.title}`
            .toLocaleLowerCase()
            .includes(q)) &&
        (!query.month ||
          (source.cancelledAt &&
            businessToday(source.cancelledAt).slice(0, 7) === query.month) ||
          source.refunds.some((r) => r.date.startsWith(query.month!))) &&
        (!query.status ||
          (query.status === "Pendiente"
            ? source.pendingAmountCents > 0
            : query.status === "Devuelta" || query.status === "Reintegrado"
              ? source.pendingAmountCents === 0
              : source.refundedAmountCents > 0 &&
                source.pendingAmountCents > 0)),
    );
  }

  async listRefunds(query: FinanceQueryDto = {}) {
    return this.page(await this.refundSources(query), query);
  }

  async createRefund(dto: CreateRefundDto) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.operation(tx, dto.operationId, "Refund", dto);
      if (previous)
        return tx.refund.findUniqueOrThrow({
          where: { id: previous.resultId },
          include: { cancellations: true },
        });
      validateBusinessDate(dto.date, true);
      money(dto.amountCents, true);
      money(dto.cashOutAmountCents);
      if (!!dto.saleId === !!dto.planId)
        throw new BadRequestException(
          "Seleccione una única venta o saldo inicial anulado.",
        );
      const source = (await this.refundSources({}, tx)).find((s) =>
        dto.saleId
          ? s.saleId === dto.saleId
          : s.planId === dto.planId && !s.saleId,
      );
      if (!source)
        throw new BadRequestException(
          "La devolución requiere una anulación comercial completa.",
        );
      if (dto.amountCents > source.pendingAmountCents)
        throw new ConflictException(
          "La devolución supera el importe disponible.",
        );
      const cancellations = dto.cancellations ?? [];
      if (
        new Set(cancellations.map((c) => c.settlementId)).size !==
        cancellations.length
      )
        throw new BadRequestException("No repita acreditaciones esperadas.");
      const cancelled = cancellations.reduce(
        (sum, c) => sum + money(c.grossAmountCents, true),
        0,
      );
      if (source.paymentTerms === "CardInstallments") {
        if (source.settlements.some((s) => s.schedulePending))
          throw new ConflictException(
            "Complete primero las acreditaciones esperadas de esta venta.",
          );
        if (dto.amountCents !== dto.cashOutAmountCents + cancelled)
          throw new BadRequestException(
            "El importe debe coincidir con dinero devuelto más acreditaciones canceladas.",
          );
        for (const cancellation of cancellations) {
          const settlement = source.settlements.find(
            (s) => s.id === cancellation.settlementId,
          );
          if (
            !settlement ||
            cancellation.grossAmountCents > settlement.remainingGrossAmountCents
          )
            throw new ConflictException(
              "Sólo se puede cancelar bruto pendiente de esta venta.",
            );
        }
      } else if (cancelled || dto.cashOutAmountCents !== dto.amountCents)
        throw new BadRequestException(
          "Esta devolución requiere devolver el importe completo en dinero.",
        );
      let paymentMethodName = "Cancelación de acreditación";
      if (dto.cashOutAmountCents > 0) {
        if (!dto.paymentMethodId)
          throw new BadRequestException("Seleccione el medio de devolución.");
        const method = await tx.paymentMethod.findUnique({
          where: { id: dto.paymentMethodId },
        });
        if (!method?.enabled || !method.collectionEligible)
          throw new BadRequestException(
            "Seleccione un medio habilitado para devoluciones.",
          );
        paymentMethodName = method.name;
      }
      const refund = await tx.refund.create({
        data: {
          saleId: source.saleId,
          planId: source.saleId ? null : source.planId,
          customerId: source.customerId,
          customerName: source.customerName,
          date: dto.date,
          amountCents: dto.amountCents,
          cashOutAmountCents: dto.cashOutAmountCents,
          paymentMethodId: dto.paymentMethodId ?? null,
          paymentMethodName,
          reason: this.reason(dto.reason),
          cancellations: { create: cancellations },
        },
        include: { cancellations: true },
      });
      await this.saveOperation(tx, dto.operationId, "Refund", dto, refund.id);
      return refund;
    });
  }

  async reverseRefund(id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.refund.findUnique({ where: { id } });
      if (!row) throw new NotFoundException("Devolución no encontrada.");
      if (row.reversedAt)
        throw new ConflictException("La devolución ya está revertida.");
      return tx.refund.update({
        where: { id },
        data: { reversedAt: new Date(), reversalReason: this.reason(reason) },
      });
    });
  }

  async getSummary(query: FinanceQueryDto = {}) {
    const [
      allInstallments,
      monthInstallments,
      settlements,
      collections,
      accreditations,
      refunds,
      sources,
    ] = await Promise.all([
      this.installmentRows({ customerId: query.customerId }),
      this.installmentRows({
        customerId: query.customerId,
        month: query.month,
      }),
      this.settlementRows({ customerId: query.customerId }),
      this.prisma.collection.findMany({
        where: {
          reversedAt: null,
          ...(query.customerId ? { customerId: query.customerId } : {}),
          ...(query.month ? { date: { startsWith: query.month } } : {}),
        },
      }),
      this.prisma.cardAccreditation.findMany({
        where: {
          reversedAt: null,
          ...(query.customerId
            ? { settlement: { sale: { customerId: query.customerId } } }
            : {}),
          ...(query.month ? { date: { startsWith: query.month } } : {}),
        },
      }),
      this.prisma.refund.findMany({
        where: {
          reversedAt: null,
          ...(query.customerId ? { customerId: query.customerId } : {}),
          ...(query.month ? { date: { startsWith: query.month } } : {}),
        },
      }),
      this.refundSources({ customerId: query.customerId }),
    ]);
    return {
      customerDebtAmountCents: allInstallments.reduce(
        (s, i) => s + i.remainingAmountCents,
        0,
      ),
      overdueAmountCents: allInstallments
        .filter((i) => i.dueDate < businessToday())
        .reduce((s, i) => s + i.remainingAmountCents, 0),
      monthCommitmentsAmountCents: monthInstallments.reduce(
        (s, i) => s + i.remainingAmountCents,
        0,
      ),
      ...this.cardBalances(settlements),
      collectedAmountCents:
        collections.reduce((s, c) => s + c.amountCents, 0) +
        accreditations.reduce(
          (s, a) => s + a.grossAmountCents - a.feeAmountCents,
          0,
        ),
      refundedAmountCents: refunds.reduce(
        (s, r) => s + r.cashOutAmountCents,
        0,
      ),
      pendingRefundAmountCents: sources.reduce(
        (s, r) => s + r.pendingAmountCents,
        0,
      ),
    };
  }

  async account(customerId: string) {
    const [
      customer,
      plans,
      installments,
      collections,
      refunds,
      sales,
      summary,
    ] = await Promise.all([
      this.customer(this.prisma, customerId),
      this.prisma.receivablePlan.findMany({
        where: { customerId },
        include: { installments: { orderBy: { number: "asc" } } },
        orderBy: { createdAt: "desc" },
      }),
      this.installmentRows({ customerId }),
      this.prisma.collection.findMany({
        where: { customerId },
        include: { allocations: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.refund.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.sale.findMany({
        where: { customerId },
        orderBy: { date: "desc" },
      }),
      this.getSummary({ customerId }),
    ]);
    return {
      customer,
      plans,
      installments,
      collections,
      refunds,
      sales,
      balanceAmountCents: summary.customerDebtAmountCents,
      overdueAmountCents: summary.overdueAmountCents,
      cardPendingAmountCents: summary.cardPendingAmountCents,
      cardUnscheduledAmountCents: summary.cardUnscheduledAmountCents,
    };
  }

  async receipt(id: string, refund = false) {
    const [business, receipt, entry] = await Promise.all([
      this.prisma.businessSettings.findUnique({ where: { id: "default" } }),
      this.prisma.receiptSettings.findUnique({ where: { id: "default" } }),
      refund
        ? this.prisma.refund.findUnique({
            where: { id },
            include: { cancellations: true },
          })
        : this.prisma.collection.findUnique({
            where: { id },
            include: {
              allocations: {
                include: { installment: { include: { plan: true } } },
              },
            },
          }),
    ]);
    if (!entry) throw new NotFoundException("Comprobante no encontrado.");
    return {
      business,
      receipt,
      ...(refund
        ? { refund: entry }
        : {
            collection: entry,
            allocations: "allocations" in entry ? entry.allocations : [],
          }),
      legend: "Comprobante interno no válido como factura fiscal.",
    };
  }
}
