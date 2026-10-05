import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { StockRulesService } from "../../domain/stock-rules.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CancelPurchaseDto,
  CreatePurchaseDto,
  CreatePurchaseItemDto,
  UpdatePurchaseDto,
} from "./dto/purchase.dto";

const purchaseInclude = {
  supplier: true,
  items: { orderBy: { productName: "asc" } },
} satisfies Prisma.PurchaseInclude;

type PurchaseWithRelations = Prisma.PurchaseGetPayload<{
  include: typeof purchaseInclude;
}>;

type AggregatedPurchaseItem = {
  productId: string;
  qty: number;
  unitCostAmountCents: number;
};

type ProductForPurchase = {
  id: string;
  name: string;
  physicalStock: number;
  archived: boolean;
};

export type PurchaseResponse = {
  id: string;
  supplierId: string;
  supplier: {
    id: string;
    name: string;
  };
  date: string;
  status: string;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    name: string;
    qty: number;
    unitCostAmountCents: number;
    lineTotalAmountCents: number;
  }>;
  totalAmountCents: number;
  cancelReason: string | null;
  cancelledAt: string | null;
};

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockRulesService: StockRulesService,
  ) {}

  async findAll(): Promise<PurchaseResponse[]> {
    const purchases = await this.prisma.purchase.findMany({
      include: purchaseInclude,
      orderBy: { date: "desc" },
    });

    return purchases.map((purchase) => this.serializePurchase(purchase));
  }

  async findById(id: string): Promise<PurchaseResponse> {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: purchaseInclude,
    });

    if (!purchase) {
      throw new NotFoundException("Compra no encontrada.");
    }

    return this.serializePurchase(purchase);
  }

  async create(dto: CreatePurchaseDto): Promise<PurchaseResponse> {
    return this.prisma.$transaction(async (tx) => {
      const items = this.aggregateItems(dto.items);
      await this.assertSupplierAvailable(tx, dto.supplierId);
      const products = await this.loadProductsForPurchase(tx, items);
      const totalAmountCents = this.calculateTotalAmountCents(items);

      const purchase = await tx.purchase.create({
        data: {
          supplierId: dto.supplierId,
          date: dto.date ? new Date(dto.date) : new Date(),
          status: dto.status,
          totalAmountCents,
          items: {
            create: this.toPurchaseItemCreates(items, products),
          },
        },
        include: purchaseInclude,
      });

      if (dto.status === "Registrada") {
        await this.applyRegisteredStock(tx, purchase.id, items);
        await this.refreshSupplierLastPurchase(tx, purchase.supplierId);
      }

      return this.serializePurchase(purchase);
    });
  }

  async update(id: string, dto: UpdatePurchaseDto): Promise<PurchaseResponse> {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await this.loadPurchaseInTransaction(tx, id);

      if (purchase.status !== "Pendiente") {
        throw new ConflictException("Solo se pueden editar compras pendientes.");
      }

      if (dto.supplierId) {
        await this.assertSupplierAvailable(
          tx,
          dto.supplierId,
          purchase.supplierId,
        );
      }

      const items = dto.items ? this.aggregateItems(dto.items) : undefined;
      const products = items
        ? await this.loadProductsForPurchase(tx, items)
        : undefined;

      const updated = await tx.purchase.update({
        where: { id },
        data: {
          supplierId: dto.supplierId,
          date: dto.date ? new Date(dto.date) : undefined,
          totalAmountCents: items
            ? this.calculateTotalAmountCents(items)
            : undefined,
          items:
            items && products
              ? {
                  deleteMany: {},
                  create: this.toPurchaseItemCreates(items, products),
                }
              : undefined,
        },
        include: purchaseInclude,
      });

      return this.serializePurchase(updated);
    });
  }

  async register(id: string): Promise<PurchaseResponse> {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await this.loadPurchaseInTransaction(tx, id);

      if (purchase.status === "Registrada") {
        throw new ConflictException("La compra ya está registrada.");
      }

      if (purchase.status === "Anulada") {
        throw new ConflictException("La compra está anulada.");
      }

      const items = this.aggregateItems(purchase.items);
      await this.applyRegisteredStock(tx, purchase.id, items);

      const updated = await tx.purchase.update({
        where: { id },
        data: { status: "Registrada" },
        include: purchaseInclude,
      });

      await this.refreshSupplierLastPurchase(tx, updated.supplierId);

      return this.serializePurchase(updated);
    });
  }

  async cancel(
    id: string,
    dto: CancelPurchaseDto,
  ): Promise<PurchaseResponse> {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await this.loadPurchaseInTransaction(tx, id);
      const cancelReason = dto.reason?.trim() || null;

      if (purchase.status === "Anulada") {
        throw new ConflictException("La compra ya está anulada.");
      }

      const items = this.aggregateItems(purchase.items);

      if (purchase.status === "Registrada") {
        await this.assertCanReverseRegisteredPurchase(tx, items);
        await this.reverseRegisteredStock(tx, purchase.id, items);
      }

      const updated = await tx.purchase.update({
        where: { id },
        data: {
          status: "Anulada",
          cancelReason,
          cancelledAt: new Date(),
        },
        include: purchaseInclude,
      });

      await this.refreshSupplierLastPurchase(tx, updated.supplierId);

      return this.serializePurchase(updated);
    });
  }

  async deleteDraft(id: string): Promise<{ id: string; deleted: true }> {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await this.loadPurchaseInTransaction(tx, id);

      if (purchase.status !== "Pendiente") {
        throw new ConflictException(
          "Solo se pueden eliminar compras pendientes.",
        );
      }

      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await tx.purchase.delete({ where: { id } });

      return { id, deleted: true };
    });
  }

  private aggregateItems(
    items: Array<Pick<CreatePurchaseItemDto, "productId" | "qty" | "unitCostAmountCents">>,
  ): AggregatedPurchaseItem[] {
    const byProduct = new Map<string, AggregatedPurchaseItem>();

    for (const item of items) {
      if (!Number.isInteger(item.qty) || item.qty <= 0) {
        throw new BadRequestException("La cantidad debe ser positiva.");
      }

      if (
        !Number.isInteger(item.unitCostAmountCents) ||
        item.unitCostAmountCents <= 0
      ) {
        throw new BadRequestException("El costo debe ser un entero positivo.");
      }

      const existing = byProduct.get(item.productId);

      if (existing) {
        if (existing.unitCostAmountCents !== item.unitCostAmountCents) {
          throw new BadRequestException(
            "No se puede repetir un producto con costos distintos.",
          );
        }

        existing.qty += item.qty;
      } else {
        byProduct.set(item.productId, { ...item });
      }
    }

    return [...byProduct.values()];
  }

  private async assertSupplierAvailable(
    tx: Prisma.TransactionClient,
    supplierId: string,
    currentSupplierId?: string,
  ): Promise<void> {
    const supplier = await tx.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, active: true },
    });

    if (!supplier) {
      throw new BadRequestException("El proveedor indicado no existe.");
    }

    if (!supplier.active && supplier.id !== currentSupplierId) {
      throw new ConflictException(
        "El proveedor indicado está inactivo. Activá el proveedor antes de registrar una compra.",
      );
    }
  }

  private async loadProductsForPurchase(
    tx: Prisma.TransactionClient,
    items: AggregatedPurchaseItem[],
  ): Promise<Map<string, ProductForPurchase>> {
    const products = await tx.product.findMany({
      where: { id: { in: items.map((item) => item.productId) } },
      select: {
        id: true,
        name: true,
        physicalStock: true,
        archived: true,
      },
    });
    const productsById = new Map(products.map((product) => [product.id, product]));

    for (const item of items) {
      const product = productsById.get(item.productId);

      if (!product) {
        throw new NotFoundException("Producto no encontrado.");
      }

      if (product.archived) {
        throw new BadRequestException("El producto indicado está archivado.");
      }
    }

    return productsById;
  }

  private toPurchaseItemCreates(
    items: AggregatedPurchaseItem[],
    products: Map<string, ProductForPurchase>,
  ): Prisma.PurchaseItemCreateWithoutPurchaseInput[] {
    return items.map((item) => {
      const product = products.get(item.productId);
      if (!product) {
        throw new NotFoundException("Producto no encontrado.");
      }

      return {
        product: { connect: { id: item.productId } },
        productName: product.name,
        qty: item.qty,
        unitCostAmountCents: item.unitCostAmountCents,
        lineTotalAmountCents: item.qty * item.unitCostAmountCents,
      };
    });
  }

  private calculateTotalAmountCents(items: AggregatedPurchaseItem[]): number {
    return items.reduce(
      (sum, item) => sum + item.qty * item.unitCostAmountCents,
      0,
    );
  }

  private async applyRegisteredStock(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    items: AggregatedPurchaseItem[],
  ): Promise<void> {
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { physicalStock: { increment: item.qty } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: "Compra",
          sourceType: "Purchase",
          sourceId: purchaseId,
          physicalDelta: item.qty,
        },
      });
    }
  }

  private async assertCanReverseRegisteredPurchase(
    tx: Prisma.TransactionClient,
    items: AggregatedPurchaseItem[],
  ): Promise<void> {
    const productIds = items.map((item) => item.productId);
    const [products, reservedByProduct] = await Promise.all([
      tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, physicalStock: true },
      }),
      this.stockRulesService.getReservedStockByProductIds(productIds, tx),
    ]);
    const productsById = new Map(products.map((product) => [product.id, product]));

    for (const item of items) {
      const product = productsById.get(item.productId);
      if (!product) {
        throw new NotFoundException("Producto no encontrado.");
      }

      const newPhysicalStock = product.physicalStock - item.qty;
      const reservedStock = reservedByProduct.get(item.productId) ?? 0;
      const newAvailableStock = newPhysicalStock - reservedStock;

      if (newAvailableStock < 0) {
        throw new ConflictException(
          "No se puede anular esta compra porque hay stock vendido o reservado. Realizá un ajuste manual previo.",
        );
      }
    }
  }

  private async reverseRegisteredStock(
    tx: Prisma.TransactionClient,
    purchaseId: string,
    items: AggregatedPurchaseItem[],
  ): Promise<void> {
    const originalMovements = await tx.stockMovement.findMany({
      where: {
        sourceType: "Purchase",
        sourceId: purchaseId,
        type: "Compra",
      },
      select: { id: true, productId: true },
    });
    const originalByProduct = new Map(
      originalMovements.map((movement) => [movement.productId, movement.id]),
    );

    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { physicalStock: { decrement: item.qty } },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          type: "Reverso",
          sourceType: "Purchase",
          sourceId: purchaseId,
          physicalDelta: -item.qty,
          reversalOfId: originalByProduct.get(item.productId),
        },
      });
    }
  }

  private async refreshSupplierLastPurchase(
    tx: Prisma.TransactionClient,
    supplierId: string,
  ): Promise<void> {
    const latestPurchase = await tx.purchase.findFirst({
      where: {
        supplierId,
        status: "Registrada",
      },
      orderBy: { date: "desc" },
      select: { date: true },
    });

    await tx.supplier.update({
      where: { id: supplierId },
      data: { lastPurchase: latestPurchase?.date ?? null },
    });
  }

  private async loadPurchaseInTransaction(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<PurchaseWithRelations> {
    const purchase = await tx.purchase.findUnique({
      where: { id },
      include: purchaseInclude,
    });

    if (!purchase) {
      throw new NotFoundException("Compra no encontrada.");
    }

    return purchase;
  }

  private serializePurchase(purchase: PurchaseWithRelations): PurchaseResponse {
    return {
      id: purchase.id,
      supplierId: purchase.supplierId,
      supplier: {
        id: purchase.supplier.id,
        name: purchase.supplier.name,
      },
      date: purchase.date.toISOString(),
      status: purchase.status,
      items: purchase.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        name: item.productName,
        qty: item.qty,
        unitCostAmountCents: item.unitCostAmountCents,
        lineTotalAmountCents: item.lineTotalAmountCents,
      })),
      totalAmountCents: purchase.totalAmountCents,
      cancelReason: purchase.cancelReason,
      cancelledAt: purchase.cancelledAt?.toISOString() ?? null,
    };
  }
}
