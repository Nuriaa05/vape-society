import { PrismaService } from "../../prisma/prisma.service";
import type { HistoryEvent } from "./history.service";

type DateRange = { start: Date; end: Date };

export async function loadFinancialHistory(
  prisma: PrismaService,
  range?: DateRange,
): Promise<HistoryEvent[]> {
  const timestamp = range ? { gte: range.start, lt: range.end } : undefined;
  const day = range
    ? {
        gte: range.start.toISOString().slice(0, 10),
        lt: range.end.toISOString().slice(0, 10),
      }
    : undefined;
  const financialWhere = range
    ? { OR: [{ date: day }, { reversedAt: timestamp }] }
    : undefined;
  const [
    customers,
    plans,
    collections,
    accreditations,
    refunds,
    cardSchedules,
  ] = await Promise.all([
    prisma.customer.findMany({
      where: timestamp ? { createdAt: timestamp } : undefined,
    }),
    prisma.receivablePlan.findMany({
      where: {
        saleId: null,
        ...(range
          ? { OR: [{ createdAt: timestamp }, { cancelledAt: timestamp }] }
          : {}),
      },
      include: { customer: { select: { name: true } } },
    }),
    prisma.collection.findMany({ where: financialWhere }),
    prisma.cardAccreditation.findMany({
      where: financialWhere,
      include: { settlement: { include: { sale: true } } },
    }),
    prisma.refund.findMany({ where: financialWhere }),
    prisma.financialOperation.findMany({
      where: {
        kind: "CardSchedule",
        ...(timestamp ? { createdAt: timestamp } : {}),
      },
    }),
  ]);
  const events: HistoryEvent[] = customers.map((customer) => ({
    id: `customer:${customer.id}:created`,
    occurredAt: customer.createdAt.toISOString(),
    type: "customers",
    title: "Cliente registrado",
    description: customer.name,
    entityId: customer.id,
  }));
  if (cardSchedules.length) {
    const sales = await prisma.sale.findMany({
      where: { id: { in: cardSchedules.map((entry) => entry.resultId) } },
      select: { id: true, number: true },
    });
    for (const schedule of cardSchedules)
      events.push({
        id: `card-schedule:${schedule.operationId}`,
        occurredAt: schedule.createdAt.toISOString(),
        type: "collections",
        title: "Acreditaciones esperadas registradas",
        description: `Venta ${sales.find((sale) => sale.id === schedule.resultId)?.number ?? schedule.resultId}`,
        entityId: schedule.resultId,
        status: "Programada",
      });
  }
  for (const plan of plans) {
    const description = `${plan.customer.name} · ${plan.title}`;
    events.push({
      id: `receivable:${plan.id}:created`,
      occurredAt: plan.createdAt.toISOString(),
      type: "collections",
      title: "Saldo anterior registrado",
      description,
      entityId: plan.id,
      amountCents: plan.totalAmountCents,
      status: "Registrado",
    });
    if (plan.cancelledAt)
      events.push({
        id: `receivable:${plan.id}:cancelled`,
        occurredAt: plan.cancelledAt.toISOString(),
        type: "collections",
        title: "Saldo anterior anulado",
        description: `${description} · ${plan.cancelReason ?? ""}`,
        entityId: plan.id,
        amountCents: plan.totalAmountCents,
        status: "Anulado",
      });
  }
  const records = [
    ...collections.map((entry) => ({
      ...entry,
      prefix: "collection",
      title: "Cobro",
      amount: entry.amountCents,
      description: [entry.customerName, entry.paymentMethodName]
        .filter(Boolean)
        .join(" · "),
    })),
    ...accreditations.map((entry) => ({
      ...entry,
      prefix: "accreditation",
      title: "Acreditación de tarjeta",
      amount: entry.grossAmountCents - entry.feeAmountCents,
      description: `${entry.settlement.processor} · Venta ${entry.settlement.sale.number}`,
    })),
    ...refunds.map((entry) => ({
      ...entry,
      prefix: "refund",
      title: "Devolución",
      amount: entry.amountCents,
      description: [entry.customerName, entry.paymentMethodName, entry.reason]
        .filter(Boolean)
        .join(" · "),
    })),
  ];
  for (const entry of records) {
    const reversedTitle =
      entry.title === "Cobro"
        ? "Cobro revertido"
        : entry.title === "Devolución"
          ? "Devolución revertida"
          : "Acreditación revertida";
    events.push({
      id: `${entry.prefix}:${entry.id}:created`,
      occurredAt: new Date(`${entry.date}T00:00:00-03:00`).toISOString(),
      type: "collections",
      title: `${entry.title} ${entry.title === "Cobro" ? "registrado" : "registrada"}`,
      description: entry.description,
      entityId: entry.id,
      amountCents: entry.amount,
      status: "Registrado",
    });
    if (entry.reversedAt)
      events.push({
        id: `${entry.prefix}:${entry.id}:reversed`,
        occurredAt: entry.reversedAt.toISOString(),
        type: "collections",
        title: reversedTitle,
        description: `${entry.description} · ${entry.reversalReason ?? ""}`,
        entityId: entry.id,
        amountCents: entry.amount,
        status: "Revertido",
      });
  }
  return range
    ? events.filter((event) => {
        const date = new Date(event.occurredAt);
        return date >= range.start && date < range.end;
      })
    : events;
}
