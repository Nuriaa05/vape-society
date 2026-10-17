import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { canonicalPayload, money } from "../collections/finance-rules";
import { CreateSaleItemDto } from "../sales/dto/sale.dto";
import { CatalogPriceItemDto } from "./price-lists.dto";

export type PricingLine = {
  itemType: "Product" | "Combo";
  itemId: string;
  qty: number;
  basePriceAmountCents: number;
  appliedPriceAmountCents: number;
  origin: "Catalog" | "List";
  effectiveMinimumQty: number | null;
  components: Array<{ productId: string; qtyPerCombo: number }>;
};
export type PricingSnapshot = {
  listId: string;
  listName: string;
  countedUnits: number;
  globalMinimumQty: number | null;
  lines: PricingLine[];
  fingerprint: string;
};
export type PricingPreview = PricingSnapshot & { catalogPrices: PricingLine[] };
export const priceListInclude = {
  tiers: { include: { prices: true }, orderBy: { minimumQty: "asc" } },
} satisfies Prisma.PriceListInclude;
export function pricingFingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalPayload(value)).digest("hex");
}
export function aggregatePricingItems(items: CreateSaleItemDto[]) {
  const byItem = new Map<
    string,
    { itemType: "Product" | "Combo"; itemId: string; qty: number }
  >();
  for (const item of items) {
    const itemType = item.itemType ?? "Product";
    const itemId = item.itemId ?? item.productId;
    if (
      !itemId ||
      !["Product", "Combo"].includes(itemType) ||
      !Number.isSafeInteger(item.qty) ||
      item.qty < 1
    )
      throw new BadRequestException(
        "La línea debe indicar producto o combo y cantidad entera positiva.",
      );
    const key = `${itemType}:${itemId}`;
    const qty = (byItem.get(key)?.qty ?? 0) + item.qty;
    if (!Number.isSafeInteger(qty) || qty > 2147483647)
      throw new BadRequestException("La cantidad es demasiado grande.");
    byItem.set(key, { itemType, itemId, qty });
  }
  return [...byItem.values()].sort((a, b) =>
    `${a.itemType}:${a.itemId}`.localeCompare(`${b.itemType}:${b.itemId}`),
  );
}

@Injectable()
export class PricingResolver {
  async resolve(
    tx: Prisma.TransactionClient,
    items: CreateSaleItemDto[],
    customerId?: string,
    catalogItems: CatalogPriceItemDto[] = [],
  ): Promise<PricingPreview> {
    const cart = aggregatePricingItems(items);
    const customer = customerId
      ? await tx.customer.findUnique({ where: { id: customerId } })
      : null;
    if (customerId && !customer?.active)
      throw new BadRequestException(
        "El cliente indicado no existe o está archivado.",
      );
    const list = customer?.priceListId
      ? await tx.priceList.findUnique({
          where: { id: customer.priceListId },
          include: priceListInclude,
        })
      : await tx.priceList.findFirst({
          where: { isGeneral: true },
          include: priceListInclude,
        });
    if (!list?.active)
      throw new BadRequestException(
        "La lista de precios no existe o está archivada.",
      );
    const requested = [...cart, ...catalogItems];
    const [products, combos] = await Promise.all([
      tx.product.findMany({
        where: {
          id: {
            in: requested
              .filter((i) => i.itemType === "Product")
              .map((i) => i.itemId),
          },
        },
        select: { id: true, priceAmountCents: true, archived: true },
      }),
      tx.combo.findMany({
        where: {
          id: {
            in: requested
              .filter((i) => i.itemType === "Combo")
              .map((i) => i.itemId),
          },
        },
        include: {
          items: {
            include: { product: { select: { archived: true } } },
            orderBy: { productId: "asc" },
          },
        },
      }),
    ]);
    const productsById = new Map(products.map((p) => [p.id, p]));
    const combosById = new Map(combos.map((c) => [c.id, c]));
    const isAvailableLookup = (item: CatalogPriceItemDto): boolean => {
      if (item.itemType === "Product") {
        const product = productsById.get(item.itemId);
        return Boolean(product && !product.archived);
      }
      const combo = combosById.get(item.itemId);
      return Boolean(
        combo &&
        !combo.archived &&
        combo.items.length &&
        combo.items.every((component) => !component.product.archived),
      );
    };
    const catalog = (item: CatalogPriceItemDto) => {
      if (item.itemType === "Product") {
        const product = productsById.get(item.itemId);
        if (!product) throw new NotFoundException("Producto no encontrado.");
        if (product.archived)
          throw new BadRequestException("El producto indicado está archivado.");
        return {
          basePriceAmountCents: product.priceAmountCents,
          components: [],
        };
      }
      const combo = combosById.get(item.itemId);
      if (!combo) throw new NotFoundException("Combo no encontrado.");
      if (
        combo.archived ||
        !combo.items.length ||
        combo.items.some((i) => i.product.archived)
      )
        throw new BadRequestException(
          "El combo está archivado, vacío o contiene productos archivados.",
        );
      return {
        basePriceAmountCents: combo.priceAmountCents,
        components: combo.items.map((i) => ({
          productId: i.productId,
          qtyPerCombo: i.qty,
        })),
      };
    };
    const baseLines = cart.map((item) => ({ ...item, ...catalog(item) }));
    const countedUnits = baseLines.reduce(
      (sum, line) =>
        sum +
        line.qty *
          (line.itemType === "Combo"
            ? line.components.reduce((n, c) => n + c.qtyPerCombo, 0)
            : 1),
      0,
    );
    if (!Number.isSafeInteger(countedUnits) || countedUnits > 2147483647)
      throw new BadRequestException("La cantidad total es demasiado grande.");
    const eligible = list.tiers.filter(
      (tier) => tier.minimumQty <= countedUnits,
    );
    const priceLine = (item: CatalogPriceItemDto, qty: number): PricingLine => {
      const base = catalog(item);
      let appliedPriceAmountCents = base.basePriceAmountCents;
      let effectiveMinimumQty: number | null = null;
      for (const tier of eligible) {
        const cell = tier.prices.find((p) =>
          item.itemType === "Product"
            ? p.productId === item.itemId
            : p.comboId === item.itemId,
        );
        if (cell) {
          appliedPriceAmountCents = cell.priceAmountCents;
          effectiveMinimumQty = tier.minimumQty;
        }
      }
      money(appliedPriceAmountCents * qty);
      return {
        ...item,
        qty,
        ...base,
        appliedPriceAmountCents,
        effectiveMinimumQty,
        origin: effectiveMinimumQty === null ? "Catalog" : "List",
      };
    };
    const lines = cart.map((item) => priceLine(item, item.qty));
    const context = {
      listId: list.id,
      listName: list.name,
      countedUnits,
      globalMinimumQty: eligible.at(-1)?.minimumQty ?? null,
      lines,
    };
    // Hash only actual cart rows. Lookup-only catalog prices do not change the cart context.
    const fingerprint = pricingFingerprint({
      customerId: customerId ?? null,
      ...context,
    });
    return {
      ...context,
      fingerprint,
      // Unavailable lookup-only items are omitted. Cart validation above stays strict.
      catalogPrices: catalogItems
        .filter(isAvailableLookup)
        .map((item) => priceLine(item, 0)),
    };
  }
}
