import { canonicalPayload, money } from "../collections/finance-rules";
import { InventoryLotsService } from "../../domain/inventory-lots.service";
import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Optional,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, StockMovement } from "@prisma/client";

import {
  StockRulesService,
  type StockReadModel,
} from "../../domain/stock-rules.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ClassifyStockDto,
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
  canReverse: boolean;
};

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockRulesService: StockRulesService,
    @Optional()
    private readonly inventoryLotsService: InventoryLotsService = new InventoryLotsService(),
  ) {}

  findAll(): Promise<StockReadModel[]> {
    return this.stockRulesService.getStockForProducts();
  }

  async summary(q?: string) {
    const query = q?.trim().toLocaleLowerCase("es-AR");
    const rows = (await this.findAll()).filter(
      (row) =>
        !query ||
        `${row.productName} ${row.barcode ?? ""}`
          .toLocaleLowerCase("es-AR")
          .includes(query),
    );
    return rows.reduce(
      (sum, row) => ({
        physicalStock: sum.physicalStock + row.physicalStock,
        reservedStock: sum.reservedStock + row.reservedStock,
        availableStock: sum.availableStock + row.availableStock,
        paidQty: sum.paidQty + row.paidQty,
        creditQty: sum.creditQty + row.creditQty,
        unclassifiedQty: sum.unclassifiedQty + row.unclassifiedQty,
        paidValueCents: sum.paidValueCents + row.paidValueCents,
        creditValueCents: sum.creditValueCents + row.creditValueCents,
        unclassifiedValueCents:
          sum.unclassifiedValueCents + row.unclassifiedValueCents,
        totalValueCents: sum.totalValueCents + row.totalValueCents,
      }),
      {
        physicalStock: 0,
        reservedStock: 0,
        availableStock: 0,
        paidQty: 0,
        creditQty: 0,
        unclassifiedQty: 0,
        paidValueCents: 0,
        creditValueCents: 0,
        unclassifiedValueCents: 0,
        totalValueCents: 0,
      },
    );
  }

  async classify(dto: ClassifyStockDto): Promise<StockMovementResponse> {
    if (
      !dto.operationId?.trim() ||
      !dto.reason?.trim() ||
      !Number.isSafeInteger(dto.qty) ||
      dto.qty < 1 ||
      !["Pagada", "Credito"].includes(dto.classification)
    )
      throw new BadRequestException(
        "Indique operación, motivo, clasificación y cantidad positiva.",
      );
    money(dto.unitCostAmountCents);
    if (dto.classification === "Pagada" && dto.payableId)
      throw new BadRequestException(
        "La clasificación pagada no admite una deuda vinculada.",
      );
    const payload = canonicalPayload(dto);
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.financialOperation.findUnique({
        where: { operationId: dto.operationId },
      });
      if (previous) {
        if (
          previous.kind !== "InventoryClassification" ||
          previous.payload !== payload
        )
          throw new ConflictException(
            "La operación ya fue utilizada con otros datos.",
          );
        const movement = await tx.stockMovement.findUniqueOrThrow({
          where: { id: previous.resultId },
          include: { product: { select: { name: true } } },
        });
        return this.serializeMovement(movement);
      }
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
      });
      if (!product) throw new NotFoundException("Producto no encontrado.");
      if (dto.classification === "Credito") {
        const payable = dto.payableId
          ? await tx.supplierPayable.findUnique({
              where: { id: dto.payableId },
              include: { payments: true },
            })
          : null;
        if (
          !payable ||
          payable.purchaseId !== null ||
          payable.status !== "Activa" ||
          payable.payments.some((payment) => !payment.reversedAt)
        )
          throw new ConflictException(
            "Seleccione una deuda inicial activa pendiente de pago.",
          );
        const linked = await tx.inventoryLot.findMany({
          where: { payableId: payable.id },
          select: {
            initialQty: true,
            unitCostAmountCents: true,
            originMovementId: true,
          },
        });
        const reversals = await tx.stockMovement.findMany({
          where: {
            reversalOfId: {
              in: linked.flatMap((lot) =>
                lot.originMovementId ? [lot.originMovementId] : [],
              ),
            },
          },
          select: { reversalOfId: true },
        });
        const reversedIds = new Set(
          reversals.map((movement) => movement.reversalOfId),
        );
        const committedCost = linked.reduce(
          (sum, lot) =>
            sum +
            (reversedIds.has(lot.originMovementId)
              ? 0
              : lot.initialQty * lot.unitCostAmountCents),
          0,
        );
        if (
          committedCost + dto.qty * dto.unitCostAmountCents >
          payable.amountCents
        )
          throw new ConflictException(
            "El costo de las unidades vinculadas supera la deuda inicial. Revisá el costo, la cantidad o la deuda elegida.",
          );
      }
      const movement = await tx.stockMovement.create({
        data: {
          productId: product.id,
          type: "Clasificacion",
          sourceType: "StockClassification",
          sourceId: dto.operationId,
          physicalDelta: 0,
          note: dto.reason.trim(),
        },
        include: { product: { select: { name: true } } },
      });
      await this.inventoryLotsService.consume(
        tx,
        movement.id,
        product.id,
        dto.qty,
        { unclassifiedOnly: true },
      );
      const sources = await tx.inventoryAllocation.findMany({
        where: { stockMovementId: movement.id },
        include: { lot: true },
      });
      for (const source of sources)
        await this.inventoryLotsService.receive(tx, {
          productId: product.id,
          qty: -source.qty,
          unitCostAmountCents: dto.unitCostAmountCents,
          classification: dto.classification,
          payableId: dto.payableId,
          originMovementId: movement.id,
          receivedAt: source.lot.receivedAt,
        });
      await tx.financialOperation.create({
        data: {
          operationId: dto.operationId,
          kind: "InventoryClassification",
          payload,
          resultId: movement.id,
        },
      });
      return this.serializeMovement(movement);
    });
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
    const reversedIds = new Set(
      movements.map((movement) => movement.reversalOfId).filter(Boolean),
    );
    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        originMovementId: { in: movements.map((movement) => movement.id) },
      },
      select: { originMovementId: true, initialQty: true, remainingQty: true },
    });
    const origins = new Set(lots.map((lot) => lot.originMovementId));
    const consumedOrigins = new Set(
      lots
        .filter((lot) => lot.initialQty !== lot.remainingQty)
        .map((lot) => lot.originMovementId),
    );
    return movements.map((movement) => {
      const row = this.serializeMovement(movement);
      return {
        ...row,
        canReverse:
          row.canReverse &&
          !reversedIds.has(movement.id) &&
          (movement.sourceType !== "StockClassification" ||
            origins.has(movement.id)) &&
          !consumedOrigins.has(movement.id),
      };
    });
  }

  async createAdjustment(
    dto: CreateStockAdjustmentDto,
  ): Promise<StockMovementResponse> {
    const reason = dto.reason?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        select: { id: true, physicalStock: true, costAmountCents: true },
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

      if (physicalDelta > 0) {
        const lot = await this.inventoryLotsService.receive(tx, {
          productId: product.id,
          qty: physicalDelta,
          unitCostAmountCents: product.costAmountCents,
          originMovementId: movement.id,
        });
        await this.inventoryLotsService.absorbLegacyDeficit(
          tx,
          lot.id,
          movement.id,
          Math.min(physicalDelta, Math.max(0, -product.physicalStock)),
        );
      }
      if (physicalDelta < 0)
        await this.inventoryLotsService.consume(
          tx,
          movement.id,
          product.id,
          -physicalDelta,
        );
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
          product: {
            select: { name: true, physicalStock: true, costAmountCents: true },
          },
        },
      });

      if (!movement) {
        throw new NotFoundException("Movimiento no encontrado.");
      }

      const isClassification =
        movement.sourceType === "StockClassification" &&
        movement.type === "Clasificacion";
      const isManualAdjustment =
        movement.sourceType === "ManualAdjustment" &&
        movement.type === "Ajuste";
      if ((!isClassification && !isManualAdjustment) || movement.reversalOfId) {
        throw new BadRequestException(
          "Solo se pueden revertir ajustes o clasificaciones originales.",
        );
      }

      if (isClassification && !dto.reason?.trim())
        throw new BadRequestException(
          "Indique el motivo de la reversión de clasificación.",
        );

      const existingReversal = await tx.stockMovement.findFirst({
        where: { reversalOfId: movement.id },
        select: { id: true },
      });

      if (existingReversal) {
        throw new ConflictException("El movimiento ya fue revertido.");
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
          sourceType: movement.sourceType,
          sourceId: randomUUID(),
          physicalDelta,
          note: dto.reason?.trim() || null,
          reversalOfId: movement.id,
        },
        include: {
          product: { select: { name: true } },
        },
      });

      await this.inventoryLotsService.reverse(
        tx,
        movement.id,
        reversal.id,
        movement.productId,
        movement.physicalDelta,
        movement.product.costAmountCents,
      );
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
      await this.stockRulesService.getReservedStockByProductIds(
        [productId],
        tx,
      );
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
      canReverse:
        !movement.reversalOfId &&
        (movement.sourceType === "ManualAdjustment" ||
          movement.sourceType === "StockClassification"),
    };
  }
}
