import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

export type StockRulesClient = PrismaService | Prisma.TransactionClient;

const stockProductInclude = {
  category: true,
  supplier: true,
} satisfies Prisma.ProductInclude;

export type StockProduct = Prisma.ProductGetPayload<{
  include: typeof stockProductInclude;
}>;

export type StockValuation = {
  paidQty: number;
  creditQty: number;
  unclassifiedQty: number;
  paidValueCents: number;
  creditValueCents: number;
  unclassifiedValueCents: number;
  totalValueCents: number;
};

export type StockReadModel = StockValuation & {
  productId: string;
  barcode: string | null;
  productName: string;
  category: { id: string; name: string };
  supplier: { id: string; name: string } | null;
  costAmountCents: number;
  marginPct: number;
  priceAmountCents: number;
  physicalStock: number;
  reservedStock: number;
  availableStock: number;
  minStock: number;
  archived: boolean;
};

@Injectable()
export class StockRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async getReservedStockByProductIds(
    productIds: string[],
    client: StockRulesClient = this.prisma,
  ): Promise<Map<string, number>> {
    if (productIds.length === 0) {
      return new Map();
    }

    const [groupedProductItems, groupedComboComponents] = await Promise.all([
      client.saleItem.groupBy({
        by: ["productId"],
        where: {
          productId: { in: productIds },
          itemType: "Product",
          sale: {
            status: "Confirmada",
            deliveryStatus: "Pendiente",
          },
        },
        _sum: {
          qty: true,
        },
      }),
      client.saleItemComponent.groupBy({
        by: ["productId"],
        where: {
          productId: { in: productIds },
          saleItem: {
            sale: {
              status: "Confirmada",
              deliveryStatus: "Pendiente",
            },
          },
        },
        _sum: {
          totalQty: true,
        },
      }),
    ]);

    const reservedByProduct = new Map<string, number>();

    for (const item of groupedProductItems) {
      if (!item.productId) continue;
      reservedByProduct.set(item.productId, item._sum.qty ?? 0);
    }

    for (const component of groupedComboComponents) {
      reservedByProduct.set(
        component.productId,
        (reservedByProduct.get(component.productId) ?? 0) +
          (component._sum.totalQty ?? 0),
      );
    }

    return reservedByProduct;
  }

  async getStockForProducts(
    productIds?: string[],
    client: StockRulesClient = this.prisma,
  ): Promise<StockReadModel[]> {
    const products = await client.product.findMany({
      where: productIds ? { id: { in: productIds } } : undefined,
      include: stockProductInclude,
      orderBy: { name: "asc" },
    });
    const reservedByProduct = await this.getReservedStockByProductIds(
      products.map((product) => product.id),
      client,
    );

    const lots = await client.inventoryLot.findMany({
      where: {
        productId: { in: products.map((product) => product.id) },
        remainingQty: { gt: 0 },
      },
      select: {
        productId: true,
        classification: true,
        remainingQty: true,
        unitCostAmountCents: true,
      },
    });
    const valuations = new Map<string, StockValuation>();
    for (const lot of lots) {
      const value = valuations.get(lot.productId) ?? this.emptyValuation();
      const amount = lot.remainingQty * lot.unitCostAmountCents;
      if (lot.classification === "Pagada") {
        value.paidQty += lot.remainingQty;
        value.paidValueCents += amount;
      } else if (lot.classification === "Credito") {
        value.creditQty += lot.remainingQty;
        value.creditValueCents += amount;
      } else {
        value.unclassifiedQty += lot.remainingQty;
        value.unclassifiedValueCents += amount;
      }
      value.totalValueCents += amount;
      valuations.set(lot.productId, value);
    }
    return products.map((product) => ({
      ...this.toStockReadModel(product, reservedByProduct.get(product.id) ?? 0),
      ...(valuations.get(product.id) ?? this.emptyValuation()),
    }));
  }

  private emptyValuation(): StockValuation {
    return {
      paidQty: 0,
      creditQty: 0,
      unclassifiedQty: 0,
      paidValueCents: 0,
      creditValueCents: 0,
      unclassifiedValueCents: 0,
      totalValueCents: 0,
    };
  }

  private toStockReadModel(
    product: StockProduct,
    reservedStock: number,
  ): Omit<StockReadModel, keyof StockValuation> {
    return {
      productId: product.id,
      barcode: product.barcode,
      productName: product.name,
      category: {
        id: product.category.id,
        name: product.category.name,
      },
      supplier: product.supplier
        ? { id: product.supplier.id, name: product.supplier.name }
        : null,
      costAmountCents: product.costAmountCents,
      marginPct: product.marginPct,
      priceAmountCents: product.priceAmountCents,
      physicalStock: product.physicalStock,
      reservedStock,
      availableStock: product.physicalStock - reservedStock,
      minStock: product.minStock,
      archived: product.archived,
    };
  }
}
