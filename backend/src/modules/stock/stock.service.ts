import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, StockMovement } from "@prisma/client";

import { StockRulesService, type StockReadModel } from "../../domain/stock-rules.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateStockAdjustmentDto,
  ReverseStockMovementDto,
} from "./dto/stock-adjustment.dto";

export type StockMovementResponse = {
  id: string;
  date: string;
  productId: string;
  productName: string;
  type: string;
  qty: number;
  sourceType: string;
  sourceId: string;
  note: string | null;
  reversalOf: string | null;
};

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockRulesService: StockRulesService,
  ) {}

  findAll(): Promise<StockReadModel[]> {
    return this.stockRulesService.getStockForProducts();
  }

  async findMovements(): Promise<StockMovementResponse[]> {
    const movements = await this.prisma.stockMovement.findMany({
      include: {
        product: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return movements.map((movement) => this.serializeMovement(movement));
  }

  async createAdjustment(
    dto: CreateStockAdjustmentDto,
  ): Promise<StockMovementResponse> {
    const reason = dto.reason?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        select: { id: true, physicalStock: true },
      });

      if (!product) {
        throw new NotFoundException("Producto no encontrado.");
      }

      const physicalDelta = this.calculateAdjustmentDelta(
        dto,
        product.physicalStock,
      );
      const newPhysicalStock = product.physicalStock + physicalDelta;
      await this.assertAvailableStock(tx, product.id, newPhysicalStock);

      await tx.product.update({
        where: { id: product.id },
        data: { physicalStock: newPhysicalStock },
      });

      const movement = await tx.stockMovement.create({
        data: {
          productId: product.id,
          type: "Ajuste",
          sourceType: "ManualAdjustment",
          sourceId: randomUUID(),
          physicalDelta,
          note: reason,
        },
        include: {
          product: { select: { name: true } },
        },
      });

      return this.serializeMovement(movement);
    });
  }

  async reverseMovement(
    id: string,
    dto: ReverseStockMovementDto = {},
  ): Promise<StockMovementResponse> {
    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.findUnique({
        where: { id },
        include: {
          product: { select: { name: true, physicalStock: true } },
        },
      });

      if (!movement) {
        throw new NotFoundException("Movimiento no encontrado.");
      }

      if (
        movement.sourceType !== "ManualAdjustment" ||
        movement.type !== "Ajuste" ||
        movement.reversalOfId
      ) {
        throw new BadRequestException(
          "Solo se pueden revertir ajustes manuales originales.",
        );
      }

      const existingReversal = await tx.stockMovement.findFirst({
        where: { reversalOfId: movement.id },
        select: { id: true },
      });

      if (existingReversal) {
        throw new ConflictException("El ajuste manual ya fue revertido.");
      }

      const physicalDelta = -movement.physicalDelta;
      const newPhysicalStock = movement.product.physicalStock + physicalDelta;
      await this.assertAvailableStock(tx, movement.productId, newPhysicalStock);

      await tx.product.update({
        where: { id: movement.productId },
        data: { physicalStock: newPhysicalStock },
      });

      const reversal = await tx.stockMovement.create({
        data: {
          productId: movement.productId,
          type: "Reverso",
          sourceType: "ManualAdjustment",
          sourceId: randomUUID(),
          physicalDelta,
          note: dto.reason?.trim() || null,
          reversalOfId: movement.id,
        },
        include: {
          product: { select: { name: true } },
        },
      });

      return this.serializeMovement(reversal);
    });
  }

  private calculateAdjustmentDelta(
    dto: CreateStockAdjustmentDto,
    currentPhysicalStock: number,
  ): number {
    if (dto.type === "Ingreso") {
      if (!dto.qty || dto.qty <= 0) {
        throw new BadRequestException("El ingreso requiere cantidad positiva.");
      }

      return dto.qty;
    }

    if (dto.type === "Egreso") {
      if (!dto.qty || dto.qty <= 0) {
        throw new BadRequestException("El egreso requiere cantidad positiva.");
      }

      return -dto.qty;
    }

    if (dto.physicalStock === undefined || dto.physicalStock < 0) {
      throw new BadRequestException(
        "El conteo físico requiere stock físico mayor o igual a 0.",
      );
    }

    return dto.physicalStock - currentPhysicalStock;
  }

  private async assertAvailableStock(
    tx: Prisma.TransactionClient,
    productId: string,
    newPhysicalStock: number,
  ): Promise<void> {
    const reservedByProduct =
      await this.stockRulesService.getReservedStockByProductIds([productId], tx);
    const reservedStock = reservedByProduct.get(productId) ?? 0;

    if (newPhysicalStock - reservedStock < 0) {
      throw new ConflictException(
        "El ajuste no puede dejar stock disponible negativo por reservas pendientes.",
      );
    }
  }

  private serializeMovement(
    movement: StockMovement & { product: { name: string } },
  ): StockMovementResponse {
    return {
      id: movement.id,
      date: movement.createdAt.toISOString(),
      productId: movement.productId,
      productName: movement.product.name,
      type: movement.type,
      qty: movement.physicalDelta,
      sourceType: movement.sourceType,
      sourceId: movement.sourceId,
      note: movement.note,
      reversalOf: movement.reversalOfId,
    };
  }
}
