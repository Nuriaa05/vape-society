import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export type SalesProfitSummary = {
  salesCount: number;
  missingCostSalesCount: number;
  revenueAmountCents: number;
  costAmountCents: number | null;
  profitAmountCents: number | null;
};

export type CostedSale = {
  id: string;
  number: string;
  customerName: string | null;
  saleDate: string;
  deliveredAt: string;
  revenueAmountCents: number;
  costAmountCents: number | null;
  profitAmountCents: number | null;
  missingCost: boolean;
};

function safeAmount(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new BadRequestException(
      "La ganancia excede el importe que se puede calcular con precisión.",
    );
  }
  return value;
}

const profitSaleInclude = {
  items: { include: { components: true } },
} satisfies Prisma.SaleInclude;

const profitMovementInclude = {
  allocations: { include: { lot: true } },
} satisfies Prisma.StockMovementInclude;

type ProfitSale = Prisma.SaleGetPayload<{ include: typeof profitSaleInclude }>;
type ProfitMovement = Prisma.StockMovementGetPayload<{
  include: typeof profitMovementInclude;
}>;

function originalCost(
  sale: ProfitSale,
  movements: ProfitMovement[],
): number | null {
  const quantities = new Map<string, number>();
  for (const item of sale.items) {
    if (item.itemType === "Product" && item.productId && item.qty > 0) {
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? 0) + item.qty,
      );
    } else if (item.itemType === "Combo" && item.components.length > 0) {
      for (const component of item.components) {
        if (
          component.totalQty !== component.qtyPerCombo * item.qty ||
          component.totalQty <= 0
        )
          return null;
        quantities.set(
          component.productId,
          (quantities.get(component.productId) ?? 0) + component.totalQty,
        );
      }
    } else return null;
  }
  if (!quantities.size || !movements.length) return null;
  const covered = new Map<string, number>();
  let cost = 0;
  for (const movement of movements) {
    if (
      !quantities.has(movement.productId) ||
      movement.physicalDelta >= 0 ||
      movement.unallocatedQty !== 0
    )
      return null;
    let allocatedQty = 0;
    for (const allocation of movement.allocations) {
      if (
        allocation.qty >= 0 ||
        allocation.lot.productId !== movement.productId ||
        allocation.lot.unitCostAmountCents < 0
      )
        return null;
      allocatedQty -= allocation.qty;
      cost = safeAmount(
        cost + safeAmount(-allocation.qty * allocation.lot.unitCostAmountCents),
      );
    }
    if (allocatedQty !== -movement.physicalDelta) return null;
    covered.set(
      movement.productId,
      (covered.get(movement.productId) ?? 0) + allocatedQty,
    );
  }
  if ([...quantities].some(([id, qty]) => covered.get(id) !== qty)) return null;
  return cost;
}

export async function getSalesProfit(
  prisma: PrismaService,
  start: Date,
  end: Date,
): Promise<SalesProfitSummary> {
  return summarizeCostedSales(await getCostedSales(prisma, start, end));
}

export async function getCostedSales(
  prisma: PrismaService,
  start: Date,
  end: Date,
): Promise<CostedSale[]> {
  const originalSaleMovement = {
    sourceType: "Sale",
    type: "Venta",
    reversalOfId: null,
  } satisfies Prisma.StockMovementWhereInput;
  const delivered = await prisma.stockMovement.findMany({
    where: { ...originalSaleMovement, createdAt: { gte: start, lt: end } },
    select: { sourceId: true },
  });
  const sales = await prisma.sale.findMany({
    where: {
      status: "Confirmada",
      deliveryStatus: "Entregado",
      OR: [
        { date: { gte: start, lt: end } },
        {
          id: {
            in: [...new Set(delivered.map((movement) => movement.sourceId))],
          },
        },
      ],
    },
    include: profitSaleInclude,
  });
  const movements = sales.length
    ? await prisma.stockMovement.findMany({
        where: {
          ...originalSaleMovement,
          sourceId: { in: sales.map((sale) => sale.id) },
        },
        include: profitMovementInclude,
      })
    : [];
  const bySale = new Map<string, ProfitMovement[]>();
  for (const movement of movements) {
    const group = bySale.get(movement.sourceId) ?? [];
    group.push(movement);
    bySale.set(movement.sourceId, group);
  }

  const result: CostedSale[] = [];
  for (const sale of sales) {
    const saleMovements = bySale.get(sale.id) ?? [];
    // New sales are recognized at delivery. Legacy rows have no delivery
    // movement: keep them visible on their sale date with an unknown cost.
    const deliveredAt = saleMovements.reduce(
      (earliest, movement) => Math.min(earliest, movement.createdAt.getTime()),
      saleMovements.length ? Infinity : sale.date.getTime(),
    );
    if (deliveredAt < start.getTime() || deliveredAt >= end.getTime()) continue;
    const cost = originalCost(sale, saleMovements);
    const revenue = safeAmount(sale.totalAmountCents);
    result.push({
      id: sale.id,
      number: sale.number,
      customerName: sale.customerName,
      saleDate: sale.date.toISOString(),
      deliveredAt: new Date(deliveredAt).toISOString(),
      revenueAmountCents: revenue,
      costAmountCents: cost,
      profitAmountCents: cost === null ? null : safeAmount(revenue - cost),
      missingCost: cost === null,
    });
  }
  return result.sort((left, right) => {
    if (left.deliveredAt !== right.deliveredAt)
      return left.deliveredAt < right.deliveredAt ? 1 : -1;
    return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
  });
}

export function summarizeCostedSales(
  sales: readonly CostedSale[],
): SalesProfitSummary {
  let missingCostSalesCount = 0;
  let revenueAmountCents = 0;
  let knownCost = 0;
  for (const sale of sales) {
    revenueAmountCents = safeAmount(revenueAmountCents + sale.revenueAmountCents);
    if (sale.costAmountCents === null) missingCostSalesCount += 1;
    else knownCost = safeAmount(knownCost + sale.costAmountCents);
  }
  return {
    salesCount: sales.length,
    missingCostSalesCount,
    revenueAmountCents,
    costAmountCents: missingCostSalesCount ? null : knownCost,
    profitAmountCents: missingCostSalesCount
      ? null
      : safeAmount(revenueAmountCents - knownCost),
  };
}
