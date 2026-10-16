import { PrismaService } from "../../prisma/prisma.service";
import type { HistoryEvent } from "./history.service";

export async function loadSupplierHistory(
  prisma: PrismaService,
  range?: { start: Date; end: Date },
): Promise<HistoryEvent[]> {
  const timestamps = range ? { gte: range.start, lt: range.end } : undefined;
  const days = range
    ? {
        gte: range.start.toISOString().slice(0, 10),
        lt: range.end.toISOString().slice(0, 10),
      }
    : undefined;
  const where = range
    ? { OR: [{ date: days }, { reversedAt: timestamps }] }
    : undefined;
  const include = {
    payable: { include: { supplier: { select: { name: true } } } },
  };
  const [openings, payments, refunds] = await Promise.all([
    prisma.supplierPayable.findMany({
      where: {
        purchaseId: null,
        ...(range
          ? { OR: [{ createdAt: timestamps }, { cancelledAt: timestamps }] }
          : {}),
      },
      include: { supplier: { select: { name: true } } },
    }),
    prisma.supplierPayment.findMany({ where, include }),
    prisma.supplierRefund.findMany({ where, include }),
  ]);
  const events: HistoryEvent[] = [];
  for (const opening of openings) {
    events.push({
      id: `supplier-opening:${opening.id}`,
      occurredAt: opening.createdAt.toISOString(),
      type: "suppliers",
      title: "Deuda inicial registrada",
      description: `${opening.supplier.name} · ${opening.title}`,
      entityId: opening.id,
      amountCents: opening.amountCents,
      status: "Registrada",
    });
    if (opening.cancelledAt)
      events.push({
        id: `supplier-opening:${opening.id}:cancelled`,
        occurredAt: opening.cancelledAt.toISOString(),
        type: "suppliers",
        title: "Deuda inicial anulada",
        description: `${opening.supplier.name} · ${opening.cancelReason}`,
        entityId: opening.id,
        amountCents: opening.amountCents,
        status: "Anulada",
      });
  }
  for (const entry of [
    ...payments.map((p) => ({
      ...p,
      kind: "payment",
      title: "Pago a proveedor",
    })),
    ...refunds.map((r) => ({
      ...r,
      kind: "refund",
      title: "Reintegro de proveedor",
    })),
  ]) {
    const description = `${entry.payable.supplier.name} · ${entry.method}${entry.reference ? ` · ${entry.reference}` : ""}`;
    events.push({
      id: `supplier-${entry.kind}:${entry.id}`,
      occurredAt: new Date(`${entry.date}T00:00:00-03:00`).toISOString(),
      type: "suppliers",
      title: `${entry.title} registrado`,
      description,
      entityId: entry.id,
      amountCents: entry.amountCents,
      status: "Registrado",
    });
    if (entry.reversedAt)
      events.push({
        id: `supplier-${entry.kind}:${entry.id}:reversed`,
        occurredAt: entry.reversedAt.toISOString(),
        type: "suppliers",
        title: `${entry.title} revertido`,
        description: `${description} · ${entry.reversalReason}`,
        entityId: entry.id,
        amountCents: entry.amountCents,
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
