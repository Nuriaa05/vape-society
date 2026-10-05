import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

export type BarcodeClient = PrismaService | Prisma.TransactionClient;

export type BarcodeOwner =
  | { type: "Product"; id: string }
  | { type: "Combo"; id: string };

@Injectable()
export class BarcodeService {
  constructor(private readonly prisma: PrismaService) {}

  normalize(barcode?: string | null): string | null {
    const value = barcode?.trim();
    return value ? value : null;
  }

  async findOwner(
    barcode: string,
    client: BarcodeClient = this.prisma,
  ): Promise<BarcodeOwner | null> {
    const normalized = this.normalize(barcode);

    if (!normalized) {
      return null;
    }

    const [product, combo] = await Promise.all([
      client.product.findUnique({
        where: { barcode: normalized },
        select: { id: true },
      }),
      client.combo.findUnique({
        where: { barcode: normalized },
        select: { id: true },
      }),
    ]);

    if (product) {
      return { type: "Product", id: product.id };
    }

    if (combo) {
      return { type: "Combo", id: combo.id };
    }

    return null;
  }

  async assertAvailable(
    barcode: string | null,
    options: {
      excludeProductId?: string;
      excludeComboId?: string;
      client?: BarcodeClient;
    } = {},
  ): Promise<void> {
    const normalized = this.normalize(barcode);

    if (!normalized) {
      return;
    }

    const owner = await this.findOwner(normalized, options.client);

    if (!owner) {
      return;
    }

    if (owner.type === "Product" && owner.id === options.excludeProductId) {
      return;
    }

    if (owner.type === "Combo" && owner.id === options.excludeComboId) {
      return;
    }

    throw new ConflictException(
      "El código de barras ya está usado por otro producto o combo.",
    );
  }
}
