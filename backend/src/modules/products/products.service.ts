import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { BarcodeService } from "../../domain/barcode.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ArchiveProductDto,
  CreateProductDto,
  UpdateProductDto,
} from "./dto/product.dto";

const productInclude = {
  category: true,
  supplier: true,
} satisfies Prisma.ProductInclude;

export type ProductResponse = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

export type FindProductsOptions = {
  includeArchived?: boolean;
  limit?: number;
  query?: string;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly barcodeService: BarcodeService,
  ) {}

  async findAll(options: FindProductsOptions = {}): Promise<ProductResponse[]> {
    const where: Prisma.ProductWhereInput = {};
    const query = options.query?.trim();

    if (!options.includeArchived) {
      where.archived = false;
    }

    if (query) {
      where.name = { contains: query };
    }

    return this.prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: { name: "asc" },
      take: options.limit,
    });
  }

  async findById(id: string): Promise<ProductResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException("Producto no encontrado.");
    }

    return product;
  }

  async findByBarcode(barcode: string): Promise<ProductResponse> {
    const normalizedBarcode = this.barcodeService.normalize(barcode);

    if (!normalizedBarcode) {
      throw new NotFoundException("Producto no encontrado.");
    }

    const product = await this.prisma.product.findFirst({
      where: { barcode: normalizedBarcode, archived: false, saleEnabled: true },
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException("Producto no encontrado.");
    }

    return product;
  }

  async findInventoryAlerts(limit?: number): Promise<ProductResponse[]> {
    const products = await this.findAll({});
    const alerts = products.filter(
      (product) => product.physicalStock <= product.minStock,
    );

    return typeof limit === "number" ? alerts.slice(0, limit) : alerts;
  }

  async create(dto: CreateProductDto): Promise<ProductResponse> {
    await this.assertCategoryExists(dto.categoryId);
    await this.assertSupplierExists(dto.supplierId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const productId = randomUUID();
        const barcode = this.barcodeService.normalize(dto.barcode);

        await this.barcodeService.assertAvailable(barcode, { client: tx });

        const product = await tx.product.create({
          data: {
            id: productId,
            barcode,
            name: dto.name,
            costAmountCents: dto.costAmountCents,
            priceAmountCents: dto.priceAmountCents,
            marginPct: dto.marginPct,
            physicalStock: dto.physicalStock,
            minStock: dto.minStock,
            archived: false,
            category: { connect: { id: dto.categoryId } },
            supplier: dto.supplierId
              ? { connect: { id: dto.supplierId } }
              : undefined,
          },
          include: productInclude,
        });

        if (dto.physicalStock !== 0) {
          await tx.stockMovement.create({
            data: {
              productId,
              type: "Ajuste",
              sourceType: "ProductInitialStock",
              sourceId: productId,
              physicalDelta: dto.physicalStock,
              note: "Stock inicial del producto",
            },
          });
        }

        return product;
      });
    } catch (error) {
      this.handleKnownPrismaError(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponse> {
    await this.findById(id);
    await this.assertCategoryExists(dto.categoryId);
    await this.assertSupplierExists(dto.supplierId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const barcode =
          dto.barcode === undefined
            ? undefined
            : this.barcodeService.normalize(dto.barcode);

        if (barcode !== undefined) {
          await this.barcodeService.assertAvailable(barcode, {
            client: tx,
            excludeProductId: id,
          });
        }

        return tx.product.update({
          where: { id },
          data: {
            barcode,
            name: dto.name,
            costAmountCents: dto.costAmountCents,
            priceAmountCents: dto.priceAmountCents,
            marginPct: dto.marginPct,
            minStock: dto.minStock,
            category: dto.categoryId
              ? { connect: { id: dto.categoryId } }
              : undefined,
            supplier:
              dto.supplierId === null
                ? { disconnect: true }
                : dto.supplierId
                  ? { connect: { id: dto.supplierId } }
                  : undefined,
          },
          include: productInclude,
        });
      });
    } catch (error) {
      this.handleKnownPrismaError(error);
      throw error;
    }
  }

  async archive(id: string): Promise<ProductResponse> {
    return this.setArchived(id, { archived: true });
  }

  async setArchived(
    id: string,
    dto: ArchiveProductDto,
  ): Promise<ProductResponse> {
    await this.findById(id);

    return this.prisma.product.update({
      where: { id },
      data: { archived: dto.archived },
      include: productInclude,
    });
  }

  private async assertCategoryExists(categoryId?: string): Promise<void> {
    if (!categoryId) {
      return;
    }

    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException("La categoría indicada no existe.");
    }
  }

  private async assertSupplierExists(supplierId?: string | null): Promise<void> {
    if (!supplierId) {
      return;
    }

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true },
    });

    if (!supplier) {
      throw new BadRequestException("El proveedor indicado no existe.");
    }
  }

  private handleKnownPrismaError(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        throw new ConflictException("Ya existe un producto con esos datos.");
      }
    }
  }
}
