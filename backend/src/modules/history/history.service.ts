import { BadRequestException, Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";

export const HISTORY_EVENT_TYPES = [
  "sales",
  "purchases",
  "products",
  "stock",
  "suppliers",
  "combos",
  "settings",
  "backups",
] as const;

export type HistoryEventType = (typeof HISTORY_EVENT_TYPES)[number];

export type HistoryQuery = {
  month?: string;
  day?: string;
  type?: HistoryEventType;
  query?: string;
  take?: number;
  skip?: number;
};

export type HistoryEvent = {
  id: string;
  occurredAt: string;
  type: HistoryEventType;
  title: string;
  description: string;
  entityId: string;
  amountCents?: number;
  quantity?: number;
  status?: string;
};

type DateRange = { start: Date; end: Date };

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";
const monthFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: ARGENTINA_TIME_ZONE,
  month: "long",
  year: "numeric",
});
const monthKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ARGENTINA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
});

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getMonths() {
    const [
      sales,
      purchases,
      products,
      suppliers,
      combos,
      stockMovements,
      categories,
      paymentMethods,
      coupons,
      backups,
    ] = await Promise.all([
      this.prisma.sale.findMany({ select: { date: true, cancelledAt: true } }),
      this.prisma.purchase.findMany({
        select: { date: true, cancelledAt: true },
      }),
      this.prisma.product.findMany({ select: { createdAt: true } }),
      this.prisma.supplier.findMany({ select: { createdAt: true } }),
      this.prisma.combo.findMany({ select: { createdAt: true } }),
      this.prisma.stockMovement.findMany({
        where: {
          sourceType: { notIn: ["Sale", "Purchase"] },
        },
        select: { createdAt: true },
      }),
      this.prisma.category.findMany({ select: { createdAt: true } }),
      this.prisma.paymentMethod.findMany({ select: { createdAt: true } }),
      this.prisma.coupon.findMany({ select: { createdAt: true } }),
      this.prisma.backupLog.findMany({ select: { createdAt: true } }),
    ]);
    const dates = [
      ...sales.flatMap((item) =>
        item.cancelledAt ? [item.date, item.cancelledAt] : [item.date],
      ),
      ...purchases.flatMap((item) =>
        item.cancelledAt ? [item.date, item.cancelledAt] : [item.date],
      ),
      ...products.map((item) => item.createdAt),
      ...suppliers.map((item) => item.createdAt),
      ...combos.map((item) => item.createdAt),
      ...stockMovements.map((item) => item.createdAt),
      ...categories.map((item) => item.createdAt),
      ...paymentMethods.map((item) => item.createdAt),
      ...coupons.map((item) => item.createdAt),
      ...backups.map((item) => item.createdAt),
    ];
    const counts = new Map<string, { date: Date; count: number }>();

    for (const date of dates) {
      const month = getArgentinaMonthKey(date);
      const current = counts.get(month) ?? { date, count: 0 };
      current.count += 1;
      counts.set(month, current);
    }

    return [...counts.entries()]
      .map(([month, value]) => ({
        month,
        label: monthFormatter.format(value.date),
        eventCount: value.count,
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }

  async findAll(query: HistoryQuery) {
    const month = query.month ?? getArgentinaMonthKey(new Date());
    const range = query.day
      ? getArgentinaDayRange(query.day, month)
      : getArgentinaMonthRange(month);
    const take = Math.min(Math.max(query.take ?? 50, 1), 100);
    const skip = Math.max(query.skip ?? 0, 0);
    const search = normalizeSearch(query.query ?? "");
    let events = await this.loadEvents(range);

    if (query.type) {
      events = events.filter((event) => event.type === query.type);
    }
    if (search) {
      events = events.filter((event) =>
        normalizeSearch(
          `${event.title} ${event.description} ${event.status ?? ""}`,
        ).includes(search),
      );
    }

    events.sort(
      (a, b) =>
        b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id),
    );

    return {
      items: events.slice(skip, skip + take),
      total: events.length,
      hasMore: skip + take < events.length,
    };
  }

  private async loadEvents(range: DateRange): Promise<HistoryEvent[]> {
    const dateFilter = { gte: range.start, lt: range.end };
    const [
      sales,
      purchases,
      products,
      suppliers,
      combos,
      stockMovements,
      categories,
      paymentMethods,
      coupons,
      backups,
    ] = await Promise.all([
      this.prisma.sale.findMany({
        where: { OR: [{ date: dateFilter }, { cancelledAt: dateFilter }] },
        include: { items: { orderBy: { productName: "asc" } } },
      }),
      this.prisma.purchase.findMany({
        where: { OR: [{ date: dateFilter }, { cancelledAt: dateFilter }] },
        include: {
          supplier: { select: { name: true } },
          items: { orderBy: { productName: "asc" } },
        },
      }),
      this.prisma.product.findMany({
        where: { createdAt: dateFilter },
        include: { category: { select: { name: true } } },
      }),
      this.prisma.supplier.findMany({ where: { createdAt: dateFilter } }),
      this.prisma.combo.findMany({
        where: { createdAt: dateFilter },
        include: { items: true },
      }),
      this.prisma.stockMovement.findMany({
        where: {
          createdAt: dateFilter,
          sourceType: { notIn: ["Sale", "Purchase"] },
        },
        include: { product: { select: { name: true } } },
      }),
      this.prisma.category.findMany({ where: { createdAt: dateFilter } }),
      this.prisma.paymentMethod.findMany({ where: { createdAt: dateFilter } }),
      this.prisma.coupon.findMany({ where: { createdAt: dateFilter } }),
      this.prisma.backupLog.findMany({ where: { createdAt: dateFilter } }),
    ]);
    const events: HistoryEvent[] = [];

    for (const sale of sales) {
      if (isWithinRange(sale.date, range)) {
        events.push({
          id: `sale:${sale.id}:created`,
          occurredAt: sale.date.toISOString(),
          type: "sales",
          title: `Venta ${sale.number}`,
          description: sale.items
            .map((item) => `${item.qty}x ${item.productName}`)
            .join(" · "),
          entityId: sale.id,
          amountCents: sale.totalAmountCents,
          quantity: sale.items.reduce((sum, item) => sum + item.qty, 0),
          status: "Confirmada",
        });
      }
      if (sale.cancelledAt && isWithinRange(sale.cancelledAt, range)) {
        events.push({
          id: `sale:${sale.id}:cancelled`,
          occurredAt: sale.cancelledAt.toISOString(),
          type: "sales",
          title: `Venta ${sale.number} anulada`,
          description: sale.cancelReason || "Sin motivo informado",
          entityId: sale.id,
          amountCents: sale.totalAmountCents,
          status: "Anulada",
        });
      }
    }

    for (const purchase of purchases) {
      if (isWithinRange(purchase.date, range)) {
        events.push({
          id: `purchase:${purchase.id}:created`,
          occurredAt: purchase.date.toISOString(),
          type: "purchases",
          title: `Compra a ${purchase.supplier.name}`,
          description: purchase.items
            .map((item) => `${item.qty}x ${item.productName}`)
            .join(" · "),
          entityId: purchase.id,
          amountCents: purchase.totalAmountCents,
          quantity: purchase.items.reduce((sum, item) => sum + item.qty, 0),
          status:
            purchase.status === "Anulada" ? "Registrada" : purchase.status,
        });
      }
      if (purchase.cancelledAt && isWithinRange(purchase.cancelledAt, range)) {
        events.push({
          id: `purchase:${purchase.id}:cancelled`,
          occurredAt: purchase.cancelledAt.toISOString(),
          type: "purchases",
          title: `Compra a ${purchase.supplier.name} anulada`,
          description: purchase.cancelReason || "Sin motivo informado",
          entityId: purchase.id,
          amountCents: purchase.totalAmountCents,
          status: "Anulada",
        });
      }
    }

    for (const product of products) {
      events.push({
        id: `product:${product.id}:created`,
        occurredAt: product.createdAt.toISOString(),
        type: "products",
        title: "Producto creado",
        description: `${product.name} · ${product.category.name}`,
        entityId: product.id,
        status: "Creado",
      });
    }
    for (const supplier of suppliers) {
      events.push({
        id: `supplier:${supplier.id}:created`,
        occurredAt: supplier.createdAt.toISOString(),
        type: "suppliers",
        title: "Proveedor creado",
        description: supplier.name,
        entityId: supplier.id,
        status: supplier.active ? "Activo" : "Inactivo",
      });
    }
    for (const combo of combos) {
      events.push({
        id: `combo:${combo.id}:created`,
        occurredAt: combo.createdAt.toISOString(),
        type: "combos",
        title: "Combo creado",
        description: combo.name,
        entityId: combo.id,
        amountCents: combo.priceAmountCents,
        quantity: combo.items.length,
      });
    }
    for (const movement of stockMovements) {
      events.push({
        id: `stock:${movement.id}`,
        occurredAt: movement.createdAt.toISOString(),
        type: "stock",
        title:
          movement.type === "Reverso"
            ? "Reversión de stock"
            : "Ajuste de stock",
        description: `${movement.product.name}${movement.note ? ` · ${movement.note}` : ""}`,
        entityId: movement.id,
        quantity: movement.physicalDelta,
        status: movement.type,
      });
    }
    for (const category of categories) {
      events.push(
        settingsEvent(
          "category",
          category.id,
          category.createdAt,
          "Categoría creada",
          category.name,
        ),
      );
    }
    for (const method of paymentMethods) {
      events.push(
        settingsEvent(
          "payment",
          method.id,
          method.createdAt,
          "Método de pago creado",
          method.name,
        ),
      );
    }
    for (const coupon of coupons) {
      events.push(
        settingsEvent(
          "coupon",
          coupon.id,
          coupon.createdAt,
          "Cupón creado",
          coupon.code,
        ),
      );
    }
    for (const backup of backups) {
      events.push({
        id: `backup:${backup.id}`,
        occurredAt: backup.createdAt.toISOString(),
        type: "backups",
        title: "Backup creado",
        description: backup.filename,
        entityId: backup.id,
        status: backup.status,
      });
    }

    return events;
  }
}

function settingsEvent(
  entity: string,
  id: string,
  createdAt: Date,
  title: string,
  description: string,
): HistoryEvent {
  return {
    id: `${entity}:${id}:created`,
    occurredAt: createdAt.toISOString(),
    type: "settings",
    title,
    description,
    entityId: id,
  };
}

function getArgentinaMonthKey(date: Date): string {
  const parts = monthKeyFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function getArgentinaMonthRange(value: string): DateRange {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) throw new BadRequestException("Mes de historial inválido.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 3)),
    end: new Date(Date.UTC(year, month, 1, 3)),
  };
}

function getArgentinaDayRange(value: string, month: string): DateRange {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || !value.startsWith(`${month}-`)) {
    throw new BadRequestException("Día de historial inválido.");
  }
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(Date.UTC(year, monthNumber - 1, day, 3));
  if (
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== monthNumber - 1 ||
    start.getUTCDate() !== day
  ) {
    throw new BadRequestException("Día de historial inválido.");
  }
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function isWithinRange(date: Date, range: DateRange): boolean {
  return date >= range.start && date < range.end;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("es-AR");
}
