import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

export type InventoryClassification = "Pagada" | "Credito" | "SinClasificar";
export type ReceiveInventoryLot = {
  productId: string;
  qty: number;
  unitCostAmountCents: number;
  originMovementId?: string;
  purchaseItemId?: string;
  payableId?: string;
  classification?: InventoryClassification;
  receivedAt?: Date;
};

@Injectable()
export class InventoryLotsService {
  async receive(tx: Prisma.TransactionClient, input: ReceiveInventoryLot) {
    this.assertQuantity(input.qty);
    return tx.inventoryLot.create({
      data: {
        productId: input.productId,
        initialQty: input.qty,
        remainingQty: input.qty,
        unitCostAmountCents: input.unitCostAmountCents,
        classification: input.classification ?? "SinClasificar",
        originMovementId: input.originMovementId,
        purchaseItemId: input.purchaseItemId,
        payableId: input.payableId,
        receivedAt: input.receivedAt ?? new Date(),
      },
    });
  }

  async absorbLegacyDeficit(
    tx: Prisma.TransactionClient,
    lotId: string,
    movementId: string,
    deficitQty: number,
  ) {
    if (deficitQty > 0) {
      this.assertQuantity(deficitQty);
      const lot = await tx.inventoryLot.findUniqueOrThrow({
        where: { id: lotId },
      });
      const sales = await tx.sale.findMany({
        where: { status: "Confirmada", deliveryStatus: "Entregado" },
        select: { id: true },
      });
      const movements = await tx.stockMovement.findMany({
        where: {
          productId: lot.productId,
          sourceType: "Sale",
          type: "Venta",
          unallocatedQty: { gt: 0 },
          sourceId: { in: sales.map((s) => s.id) },
        },
        include: { allocations: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const reversed = await tx.stockMovement.findMany({
        where: { reversalOfId: { in: movements.map((m) => m.id) } },
        select: { reversalOfId: true },
      });
      const reversedIds = new Set(reversed.map((m) => m.reversalOfId));
      let remaining = deficitQty;
      for (const sale of movements) {
        if (!remaining) break;
        if (reversedIds.has(sale.id)) continue;
        const missing = sale.unallocatedQty;
        const covered = Math.min(remaining, Math.max(0, missing));
        if (covered) {
          await this.removeFromLot(tx, lotId, sale.id, covered);
          await tx.stockMovement.update({
            where: { id: sale.id },
            data: { unallocatedQty: { decrement: covered } },
          });
          remaining -= covered;
        }
      }
      // Inherited negative stock can predate recorded sales. Keep that deficit
      // on the incoming movement instead of inventing an earlier operation.
      if (remaining) await this.removeFromLot(tx, lotId, movementId, remaining);
    }
  }

  async consume(
    tx: Prisma.TransactionClient,
    movementId: string,
    productId: string,
    qty: number,
    options: { unclassifiedOnly?: boolean; allowShortfall?: boolean } = {},
  ) {
    this.assertQuantity(qty);
    const lots = await tx.inventoryLot.findMany({
      where: {
        productId,
        remainingQty: { gt: 0 },
        ...(options.unclassifiedOnly
          ? { classification: "SinClasificar" }
          : {}),
      },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    if (
      !options.allowShortfall &&
      lots.reduce((sum, lot) => sum + lot.remainingQty, 0) < qty
    ) {
      throw new ConflictException(
        options.unclassifiedOnly
          ? "Stock sin clasificar insuficiente para esta operación."
          : "Los lotes no alcanzan para cubrir la salida de stock.",
      );
    }
    let pending = qty;
    for (const lot of lots) {
      if (!pending) break;
      const taken = Math.min(pending, lot.remainingQty);
      await this.removeFromLot(tx, lot.id, movementId, taken);
      pending -= taken;
    }
    return pending;
  }

  async reverse(
    tx: Prisma.TransactionClient,
    originalMovementId: string,
    reversalMovementId: string,
    productId: string,
    originalDelta: number,
    unitCostAmountCents: number,
  ) {
    if (!originalDelta) {
      const sources = await tx.inventoryLot.findMany({
        where: { originMovementId: originalMovementId },
      });
      if (
        !sources.length ||
        sources.some(
          (source) =>
            source.productId !== productId ||
            source.remainingQty !== source.initialQty,
        )
      )
        throw new ConflictException(
          "No se puede revertir la clasificación: sus unidades ya fueron utilizadas.",
        );
      const allocations = await tx.inventoryAllocation.findMany({
        where: { stockMovementId: originalMovementId },
      });
      if (
        allocations.some((allocation) => allocation.qty >= 0) ||
        allocations.reduce((sum, allocation) => sum - allocation.qty, 0) !==
          sources.reduce((sum, source) => sum + source.initialQty, 0)
      )
        throw new ConflictException(
          "Las unidades de la clasificación original no coinciden.",
        );
      for (const source of sources)
        await this.removeFromLot(
          tx,
          source.id,
          reversalMovementId,
          source.remainingQty,
        );
      for (const allocation of allocations) {
        await tx.inventoryLot.update({
          where: { id: allocation.lotId },
          data: { remainingQty: { increment: -allocation.qty } },
        });
        await tx.inventoryAllocation.create({
          data: {
            lotId: allocation.lotId,
            stockMovementId: reversalMovementId,
            qty: -allocation.qty,
          },
        });
      }
      return;
    }
    if (originalDelta < 0) {
      const allocations = originalMovementId
        ? await tx.inventoryAllocation.findMany({
            where: { stockMovementId: originalMovementId },
          })
        : [];
      // Restore source units first. Any units covering another outstanding
      // negative sale are assigned to it, retaining their origin for reversal.
      const product = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { physicalStock: true },
      });
      const current = await tx.inventoryLot.aggregate({
        where: { productId },
        _sum: { remainingQty: true },
      });
      const required =
        Math.max(0, product.physicalStock) - (current._sum.remainingQty ?? 0);
      if (required < 0 || required > -originalDelta)
        throw new ConflictException(
          "El inventario no coincide con las existencias físicas.",
        );
      if (allocations.length) {
        if (
          allocations.some((a) => a.qty >= 0) ||
          allocations.reduce((sum, a) => sum - a.qty, 0) > -originalDelta
        )
          throw new ConflictException(
            "La salida original tiene asignaciones de lotes inconsistentes.",
          );
        for (const allocation of allocations) {
          const restored = -allocation.qty;
          await tx.inventoryLot.update({
            where: { id: allocation.lotId },
            data: { remainingQty: { increment: restored } },
          });
          await tx.inventoryAllocation.create({
            data: {
              lotId: allocation.lotId,
              stockMovementId: reversalMovementId,
              qty: restored,
            },
          });
        }
      }
      const restoredQty = allocations.reduce((sum, a) => sum - a.qty, 0);
      let excess = Math.max(0, restoredQty - required);
      for (const allocation of allocations) {
        if (!excess) break;
        const covered = Math.min(excess, -allocation.qty);
        await this.absorbLegacyDeficit(
          tx,
          allocation.lotId,
          reversalMovementId,
          covered,
        );
        excess -= covered;
      }
      const toRestore = Math.max(0, required - restoredQty);
      if (toRestore > 0) {
        await this.receive(tx, {
          productId,
          qty: toRestore,
          unitCostAmountCents,
          originMovementId: reversalMovementId,
        });
      }
      return;
    }
    const lot = originalMovementId
      ? await tx.inventoryLot.findFirst({
          where: { originMovementId: originalMovementId },
        })
      : null;
    if (!lot) {
      await this.consume(tx, reversalMovementId, productId, originalDelta, {
        unclassifiedOnly: true,
      });
      return;
    }
    if (
      lot.productId !== productId ||
      lot.initialQty !== originalDelta ||
      lot.remainingQty !== lot.initialQty
    )
      throw new ConflictException(
        "No se puede revertir el ingreso: sus unidades originales ya fueron utilizadas.",
      );
    await this.removeFromLot(tx, lot.id, reversalMovementId, originalDelta);
  }

  async assertPurchaseReversible(
    tx: Prisma.TransactionClient,
    purchaseId: string,
  ) {
    const items = await tx.purchaseItem.findMany({ where: { purchaseId } });
    const lots = await tx.inventoryLot.findMany({
      where: { purchaseItemId: { in: items.map((i) => i.id) } },
    });
    for (const lot of lots) {
      const item = items.find((i) => i.id === lot.purchaseItemId);
      if (!item || lot.initialQty !== item.qty || lot.remainingQty !== item.qty)
        throw new ConflictException(
          "No se puede anular la compra: sus lotes originales ya fueron utilizados.",
        );
    }
  }

  async cancelPurchase(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    movements: Array<{
      originalMovementId?: string;
      reversalMovementId: string;
      productId: string;
      qty: number;
    }>,
  ) {
    await this.assertPurchaseReversible(tx, purchaseId);
    const items = await tx.purchaseItem.findMany({ where: { purchaseId } });
    for (const movement of movements) {
      const lots = await tx.inventoryLot.findMany({
        where: {
          purchaseItemId: {
            in: items
              .filter((i) => i.productId === movement.productId)
              .map((i) => i.id),
          },
        },
      });
      if (!lots.length) {
        await this.consume(
          tx,
          movement.reversalMovementId,
          movement.productId,
          movement.qty,
          { unclassifiedOnly: true },
        );
      } else {
        if (
          lots.reduce((sum, lot) => sum + lot.remainingQty, 0) !== movement.qty
        )
          throw new ConflictException(
            "Los lotes de la compra no coinciden con la devolución.",
          );
        for (const lot of lots)
          await this.removeFromLot(
            tx,
            lot.id,
            movement.reversalMovementId,
            lot.remainingQty,
          );
      }
    }
  }

  private async removeFromLot(
    tx: Prisma.TransactionClient,
    lotId: string,
    stockMovementId: string,
    qty: number,
  ) {
    const updated = await tx.inventoryLot.updateMany({
      where: { id: lotId, remainingQty: { gte: qty } },
      data: { remainingQty: { decrement: qty } },
    });
    if (updated.count !== 1)
      throw new ConflictException(
        "El saldo del lote cambió. Actualice e intente nuevamente.",
      );
    const where = { lotId_stockMovementId: { lotId, stockMovementId } };
    const previous = await tx.inventoryAllocation.findUnique({ where });
    if (previous?.qty === qty) await tx.inventoryAllocation.delete({ where });
    else
      await tx.inventoryAllocation.upsert({
        where,
        create: { lotId, stockMovementId, qty: -qty },
        update: { qty: { decrement: qty } },
      });
  }

  private assertQuantity(qty: number) {
    if (!Number.isSafeInteger(qty) || qty < 1)
      throw new BadRequestException(
        "La cantidad del lote debe ser un entero positivo.",
      );
  }
}
