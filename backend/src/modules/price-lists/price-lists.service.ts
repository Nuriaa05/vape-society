import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { money } from "../collections/finance-rules";
import {
  CreatePriceListDto,
  PriceTierDto,
  PreviewPriceListDto,
  UpdatePriceListDto,
} from "./price-lists.dto";
import { priceListInclude, PricingResolver } from "./pricing-resolver";

type PriceListWithTiers = Prisma.PriceListGetPayload<{
  include: typeof priceListInclude;
}>;
@Injectable()
export class PriceListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PricingResolver,
  ) {}
  async list(includeInactive = false) {
    const lists = await this.prisma.priceList.findMany({
      where: includeInactive ? {} : { active: true },
      include: priceListInclude,
      orderBy: [{ isGeneral: "desc" }, { name: "asc" }, { id: "asc" }],
    });
    return lists.map((list) => this.serialize(list));
  }
  async find(id: string) {
    return this.serialize(await this.load(this.prisma, id));
  }
  async preview(dto: PreviewPriceListDto) {
    return this.prisma.$transaction((tx) =>
      this.resolver.resolve(tx, dto.items, dto.customerId, dto.catalogItems),
    );
  }
  async create(dto: CreatePriceListDto) {
    return this.prisma.$transaction(async (tx) => {
      const tiers = await this.validateTiers(tx, dto.tiers);
      const list = await tx.priceList.create({
        data: { name: this.name(dto.name), tiers: { create: tiers } },
        include: priceListInclude,
      });
      return this.serialize(list);
    });
  }
  async update(id: string, dto: UpdatePriceListDto) {
    return this.prisma.$transaction(async (tx) => {
      const list = await this.load(tx, id);
      if (
        dto.active === false &&
        (list.isGeneral ||
          (await tx.customer.count({ where: { priceListId: id } })) > 0)
      )
        throw new ConflictException(
          "No se puede archivar General ni una lista asignada a clientes.",
        );
      const tiers =
        dto.tiers === undefined
          ? undefined
          : await this.validateTiers(tx, dto.tiers);
      if (tiers)
        await tx.priceListTier.deleteMany({ where: { priceListId: id } });
      const updated = await tx.priceList.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: this.name(dto.name) } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(tiers ? { tiers: { create: tiers } } : {}),
        },
        include: priceListInclude,
      });
      return this.serialize(updated);
    });
  }
  async duplicate(id: string, name: string) {
    return this.prisma.$transaction(async (tx) => {
      const source = this.serialize(await this.load(tx, id));
      const tiers = await this.validateTiers(tx, source.tiers);
      const copy = await tx.priceList.create({
        data: { name: this.name(name), tiers: { create: tiers } },
        include: priceListInclude,
      });
      return this.serialize(copy);
    });
  }
  private name(name: string) {
    if (!name?.trim() || name.trim().length > 100)
      throw new BadRequestException(
        "Indique un nombre de hasta 100 caracteres.",
      );
    return name.trim();
  }
  private async load(tx: Prisma.TransactionClient, id: string) {
    const list = await tx.priceList.findUnique({
      where: { id },
      include: priceListInclude,
    });
    if (!list) throw new NotFoundException("Lista de precios no encontrada.");
    return list;
  }
  private serialize(list: PriceListWithTiers) {
    return {
      id: list.id,
      name: list.name,
      isGeneral: list.isGeneral,
      active: list.active,
      tiers: list.tiers.map((tier) => ({
        minimumQty: tier.minimumQty,
        prices: tier.prices
          .map((price) => ({
            itemType: price.productId
              ? ("Product" as const)
              : ("Combo" as const),
            itemId: (price.productId ?? price.comboId)!,
            priceAmountCents: price.priceAmountCents,
          }))
          .sort((a, b) =>
            `${a.itemType}:${a.itemId}`.localeCompare(
              `${b.itemType}:${b.itemId}`,
            ),
          ),
      })),
    };
  }
  private async validateTiers(
    tx: Prisma.TransactionClient,
    tiers: PriceTierDto[],
  ) {
    if (
      !Array.isArray(tiers) ||
      new Set(tiers.map((t) => t.minimumQty)).size !== tiers.length
    )
      throw new BadRequestException("Las escalas no pueden repetirse.");
    const productIds = new Set<string>();
    const comboIds = new Set<string>();
    for (const tier of tiers) {
      if (
        !Number.isSafeInteger(tier.minimumQty) ||
        tier.minimumQty < 1 ||
        tier.minimumQty > 2147483647
      )
        throw new BadRequestException(
          "La escala debe tener una cantidad entera positiva.",
        );
      const keys = new Set<string>();
      for (const price of tier.prices) {
        money(price.priceAmountCents);
        const key = `${price.itemType}:${price.itemId}`;
        if (
          keys.has(key) ||
          !price.itemId ||
          !["Product", "Combo"].includes(price.itemType)
        )
          throw new BadRequestException(
            "Cada producto o combo admite un precio por escala.",
          );
        keys.add(key);
        (price.itemType === "Product" ? productIds : comboIds).add(
          price.itemId,
        );
      }
    }
    const [products, combos] = await Promise.all([
      tx.product.count({ where: { id: { in: [...productIds] } } }),
      tx.combo.count({ where: { id: { in: [...comboIds] } } }),
    ]);
    if (products !== productIds.size || combos !== comboIds.size)
      throw new BadRequestException(
        "La configuración contiene productos o combos inexistentes.",
      );
    return [...tiers]
      .sort((a, b) => a.minimumQty - b.minimumQty)
      .map((tier) => ({
        minimumQty: tier.minimumQty,
        prices: {
          create: tier.prices.map((p) => ({
            productId: p.itemType === "Product" ? p.itemId : null,
            comboId: p.itemType === "Combo" ? p.itemId : null,
            priceAmountCents: p.priceAmountCents,
          })),
        },
      }));
  }
}
