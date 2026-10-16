import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  businessToday,
  money,
  monthlySchedule,
  validateBusinessDate,
} from "../collections/finance-rules";
import { CardSettlementDto, CreateSaleDto } from "./dto/sale.dto";

export type SaleFinance = {
  paymentTerms: "Immediate" | "DirectInstallments" | "CardInstallments";
  upfrontAmountCents: number;
  financedAmountCents: number;
  installments: Array<{
    id?: string;
    number: number;
    dueDate: string;
    amountCents: number;
    paidAmountCents?: number;
    remainingAmountCents?: number;
  }>;
  cardPlan?: {
    installmentCount: number;
    processor: string;
    reference?: string;
    deferred?: boolean;
    settlements: Array<{
      id?: string;
      number: number;
      dueDate: string;
      grossAmountCents: number;
      feeAmountCents: number;
      netAmountCents: number;
    }>;
  };
};

export function buildCardSettlementSchedule(
  rows: CardSettlementDto[],
  total: number,
) {
  if (!rows.length)
    throw new BadRequestException(
      "Agregue al menos una acreditación esperada.",
    );
  const settlements = rows.map((s, index) => {
    validateBusinessDate(s.dueDate);
    money(s.grossAmountCents, true);
    money(s.feeAmountCents);
    if (s.feeAmountCents > s.grossAmountCents)
      throw new BadRequestException("La comisión no puede superar el bruto.");
    return {
      number: index + 1,
      ...s,
      netAmountCents: s.grossAmountCents - s.feeAmountCents,
    };
  });
  if (settlements.reduce((sum, s) => sum + s.grossAmountCents, 0) !== total)
    throw new BadRequestException(
      "El bruto de las acreditaciones debe coincidir con el total de la venta.",
    );
  return settlements;
}

export async function prepareSaleFinance(
  tx: Prisma.TransactionClient,
  dto: CreateSaleDto,
  total: number,
): Promise<SaleFinance | undefined> {
  if (!dto.paymentTerms) {
    if (dto.directPlan || dto.cardPlan)
      throw new BadRequestException("Seleccione la modalidad de pago.");
    return undefined;
  }
  money(total);
  if (dto.paymentTerms === "DirectInstallments") {
    if (
      !dto.customerId ||
      !dto.directPlan ||
      dto.cardPlan ||
      dto.paymentMethodId ||
      dto.cashReceivedAmountCents !== undefined
    )
      throw new BadRequestException(
        "Las cuotas directas requieren cliente y plan propio, sin medio de pago de venta.",
      );
    const plan = dto.directPlan;
    const upfront = money(plan.upfrontAmountCents ?? 0);
    if (upfront >= total)
      throw new BadRequestException("La entrega debe ser menor al total.");
    if (upfront > 0) {
      if (!plan.upfrontPaymentMethodId)
        throw new BadRequestException("Seleccione el medio de la entrega.");
      const method = await tx.paymentMethod.findUnique({
        where: { id: plan.upfrontPaymentMethodId },
      });
      if (!method?.enabled || !method.collectionEligible)
        throw new BadRequestException(
          "El medio de entrega no está habilitado para cobranzas.",
        );
      if (
        method.cashHandling &&
        (plan.upfrontCashReceivedAmountCents === undefined ||
          money(plan.upfrontCashReceivedAmountCents) < upfront)
      )
        throw new BadRequestException(
          "El efectivo recibido no alcanza para la entrega.",
        );
      if (
        !method.cashHandling &&
        plan.upfrontCashReceivedAmountCents !== undefined
      )
        throw new BadRequestException(
          "Este medio no permite efectivo recibido.",
        );
    } else if (
      plan.upfrontPaymentMethodId ||
      plan.upfrontCashReceivedAmountCents !== undefined
    )
      throw new BadRequestException("No hay una entrega para registrar.");
    return {
      paymentTerms: dto.paymentTerms,
      upfrontAmountCents: upfront,
      financedAmountCents: total - upfront,
      installments: monthlySchedule(
        total - upfront,
        plan.installmentCount,
        plan.firstDueDate,
      ),
    };
  }
  if (dto.directPlan)
    throw new BadRequestException(
      "El plan directo no corresponde a esta modalidad.",
    );
  if (dto.paymentTerms === "CardInstallments") {
    if (total === 0)
      throw new BadRequestException(
        "El total de una venta con tarjeta en cuotas debe ser mayor a cero.",
      );
    const plan = dto.cardPlan;
    const method = dto.paymentMethodId
      ? await tx.paymentMethod.findUnique({
          where: { id: dto.paymentMethodId },
        })
      : null;
    if (
      !method?.supportsInstallments ||
      method.cashHandling ||
      !plan ||
      !plan.processor.trim() ||
      !Number.isInteger(plan.installmentCount) ||
      plan.installmentCount < 1 ||
      plan.installmentCount > 120
    )
      throw new BadRequestException(
        "Seleccione un medio de tarjeta habilitado y complete el plan.",
      );
    const settlements = plan.settlements?.length
      ? buildCardSettlementSchedule(plan.settlements, total)
      : [];
    return {
      paymentTerms: dto.paymentTerms,
      upfrontAmountCents: 0,
      financedAmountCents: total,
      installments: [],
      cardPlan: {
        installmentCount: plan.installmentCount,
        processor: plan.processor.trim(),
        ...(plan.reference ? { reference: plan.reference.trim() } : {}),
        ...(!settlements.length ? { deferred: true } : {}),
        settlements,
      },
    };
  }
  if (dto.cardPlan)
    throw new BadRequestException(
      "El plan de tarjeta no corresponde a esta modalidad.",
    );
  return {
    paymentTerms: "Immediate",
    upfrontAmountCents: total,
    financedAmountCents: 0,
    installments: [],
  };
}

export async function persistSaleFinance(
  tx: Prisma.TransactionClient,
  sale: {
    id: string;
    number: string;
    customerId: string | null;
    customerName: string | null;
    totalAmountCents: number;
    paymentMethodId: string | null;
    paymentMethodName: string;
    cashReceivedAmountCents: number | null;
    changeAmountCents: number | null;
  },
  dto: CreateSaleDto,
  finance: SaleFinance,
) {
  if (finance.paymentTerms === "DirectInstallments") {
    const plan = await tx.receivablePlan.create({
      data: {
        customerId: sale.customerId!,
        saleId: sale.id,
        title: `Venta ${sale.number}`,
        totalAmountCents: finance.financedAmountCents,
        installments: {
          create: finance.installments.map(
            ({ number, dueDate, amountCents }) => ({
              number,
              dueDate,
              amountCents,
            }),
          ),
        },
      },
      include: { installments: { orderBy: { number: "asc" } } },
    });
    finance.installments = plan.installments.map((i) => ({
      id: i.id,
      number: i.number,
      dueDate: i.dueDate,
      amountCents: i.amountCents,
      paidAmountCents: 0,
      remainingAmountCents: i.amountCents,
    }));
    if (finance.upfrontAmountCents > 0) {
      const method = await tx.paymentMethod.findUniqueOrThrow({
        where: { id: dto.directPlan!.upfrontPaymentMethodId! },
      });
      const received = dto.directPlan!.upfrontCashReceivedAmountCents;
      await tx.collection.create({
        data: {
          saleId: sale.id,
          customerId: sale.customerId,
          customerName: sale.customerName,
          kind: "Upfront",
          date: businessToday(),
          paymentMethodId: method.id,
          paymentMethodName: method.name,
          amountCents: finance.upfrontAmountCents,
          cashReceivedAmountCents: method.cashHandling ? received : null,
          changeAmountCents: method.cashHandling
            ? received! - finance.upfrontAmountCents
            : null,
        },
      });
    }
  } else if (finance.paymentTerms === "CardInstallments") {
    const card = finance.cardPlan!;
    const settlements = [];
    for (const s of card.settlements) {
      const saved = await tx.cardSettlement.create({
        data: {
          saleId: sale.id,
          processor: card.processor,
          reference: card.reference ?? null,
          number: s.number,
          dueDate: s.dueDate,
          grossAmountCents: s.grossAmountCents,
          feeAmountCents: s.feeAmountCents,
        },
      });
      settlements.push({ ...s, id: saved.id });
    }
    card.settlements = settlements;
  } else {
    await tx.collection.create({
      data: {
        saleId: sale.id,
        customerId: sale.customerId,
        customerName: sale.customerName,
        kind: "Immediate",
        date: businessToday(),
        paymentMethodId: sale.paymentMethodId!,
        paymentMethodName: sale.paymentMethodName,
        amountCents: sale.totalAmountCents,
        cashReceivedAmountCents: sale.cashReceivedAmountCents,
        changeAmountCents: sale.changeAmountCents,
      },
    });
  }
  return tx.sale.update({
    where: { id: sale.id },
    data: { financeSnapshot: JSON.stringify(finance) },
  });
}
