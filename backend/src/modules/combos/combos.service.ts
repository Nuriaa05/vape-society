import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { BarcodeService } from "../../domain/barcode.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ArchiveComboDto, CreateComboDto, UpdateComboDto } from "./dto/combo.dto";

const comboInclude = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          barcode: true,
          name: true,
          priceAmountCents: true,
          archived: true,
        },
      },
    },
    orderBy: { product: { name: "asc" } },
  },
} satisfies Prisma.ComboInclude;

export type ComboWithItems = Prisma.ComboGetPayload<{
  include: typeof comboInclude;
}>;

export type ComboResponse = {
  id: string;
  name: string;
  barcode: string | null;
  priceAmountCents: number;
  productsTotalAmountCents: number;
  discountAmountCents: number;
  archived: boolean;
  items: Array<{
    productId: string;
    productName: string;
    barcode: string | null;
    qty: number;
  }>;
};

@Injectable()
export class CombosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly barcodeService: BarcodeService,
  ) {}

  async findAll(options: { includeArchived?: boolean } = {}) {
    const combos = await this.prisma.combo.findMany({
      where: options.includeArchived ? undefined : { archived: false },
      include: comboInclude,
      orderBy: { name: "asc" },
    });

    return combos.map((combo) => this.serialize(combo));
  }

  async findById(id: string): Promise<ComboResponse> {
    return this.serialize(await this.loadCombo(id));
  }

  async findByBarcode(barcode: string): Promise<ComboResponse> {
    const normalized = this.barcodeService.normalize(barcode);

    if (!normalized) {
      throw new NotFoundException("Combo no encontrado.");
    }

    const combo = await this.prisma.combo.findFirst({
      where: { barcode: normalized, archived: false },
      include: comboInclude,
    });

    if (!combo) {
      throw new NotFoundException("Combo no encontrado.");
    }

    return this.serialize(combo);
  }

  async create(dto: CreateComboDto): Promise<ComboResponse> {
    const name = dto.name.trim();
    const barcode = this.barcodeService.normalize(dto.barcode);
    const items = this.normalizeItems(dto.items);

    if (!name) {
      throw new BadRequestException("El nombre del combo es obligatorio.");
    }

    if (items.length === 0) {
      throw new BadRequestException("El combo debe tener al menos un producto.");
    }

    return this.prisma.$transaction(async (tx) => {
      await this.barcodeService.assertAvailable(barcode, { client: tx });
      await this.assertProductsAvailable(tx, items.map((item) => item.productId));

      const combo = await tx.combo.create({
        data: {
          name,
          barcode,
          priceAmountCents: dto.priceAmountCents,
          archived: false,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              qty: item.qty,
            })),
          },
        },
        include: comboInclude,
      });

      return this.serialize(combo);
    });
  }

  async update(id: string, dto: UpdateComboDto): Promise<ComboResponse> {
    await this.loadCombo(id);

    return this.prisma.$transaction(async (tx) => {
      const barcode =
        dto.barcode === undefined
          ? undefined
          : this.barcodeService.normalize(dto.barcode);
      const items = dto.items ? this.normalizeItems(dto.items) : undefined;

      if (items && items.length === 0) {
        throw new BadRequestException("El combo debe tener al menos un producto.");
      }

      if (barcode !== undefined) {
        await this.barcodeService.assertAvailable(barcode, {
          client: tx,
          excludeComboId: id,
        });
      }

      if (items) {
        await this.assertProductsAvailable(
          tx,
          items.map((item) => item.productId),
        );
      }

      const combo = await tx.combo.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          barcode,
          priceAmountCents: dto.priceAmountCents,
          items: items
            ? {
                deleteMany: {},
                create: items.map((item) => ({
                  productId: item.productId,
                  qty: item.qty,
                })),
              }
            : undefined,
        },
        include: comboInclude,
      });

      return this.serialize(combo);
    });
  }

  async setArchived(id: string, dto: ArchiveComboDto): Promise<ComboResponse> {
    await this.loadCombo(id);

    const combo = await this.prisma.combo.update({
      where: { id },
      data: { archived: dto.archived },
      include: comboInclude,
    });

    return this.serialize(combo);
  }

  private async loadCombo(id: string): Promise<ComboWithItems> {
    const combo = await this.prisma.combo.findUnique({
      where: { id },
      include: comboInclude,
    });

    if (!combo) {
      throw new NotFoundException("Combo no encontrado.");
    }

    return combo;
  }

  private normalizeItems(items: CreateComboDto["items"]) {
    const byProduct = new Map<string, number>();

    for (const item of items) {
      byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.qty);
    }

    return [...byProduct.entries()].map(([productId, qty]) => ({
      productId,
      qty,
    }));
  }

  private async assertProductsAvailable(
    tx: Prisma.TransactionClient,
    productIds: string[],
  ): Promise<void> {
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, archived: true },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException("El combo contiene productos inexistentes.");
    }

    if (products.some((product) => product.archived)) {
      throw new BadRequestException(
        "El combo no puede contener productos archivados.",
      );
    }
  }

  private serialize(combo: ComboWithItems): ComboResponse {
    const productsTotalAmountCents = combo.items.reduce(
      (sum, item) => sum + item.qty * item.product.priceAmountCents,
      0,
    );

    return {
      id: combo.id,
      name: combo.name,
      barcode: combo.barcode,
      priceAmountCents: combo.priceAmountCents,
      productsTotalAmountCents,
      discountAmountCents: Math.max(
        0,
        productsTotalAmountCents - combo.priceAmountCents,
      ),
      archived: combo.archived,
      items: combo.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        barcode: item.product.barcode,
        qty: item.qty,
      })),
    };
  }
}
