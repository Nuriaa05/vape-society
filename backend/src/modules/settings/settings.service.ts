import { randomUUID } from "node:crypto";

import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateCategoryDto,
  CreatePaymentMethodDto,
  UpdateBusinessSettingsDto,
  UpdateCategoryDto,
  UpdateComboTicketModeDto,
  UpdateDefaultMarginDto,
  UpdatePaymentMethodDto,
  UpdateReceiptSettingsDto,
} from "./dto/settings.dto";

export type SettingsResponse = {
  business: {
    name: string;
    address: string;
    cuit: string;
    phone: string;
  };
  receipt: {
    header: string;
    footer: string;
  };
  defaultMarginPct: number;
  defaultMargin: number;
  comboTicketMode: "ComboLine" | "ComboWithComponents";
  categories: Array<{ id: string; name: string; active: boolean }>;
  paymentMethods: Array<{
    id: string;
    name: string;
    enabled: boolean;
    surchargeBasisPoints: number;
    cashHandling: boolean;
  }>;
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<SettingsResponse> {
    const [business, receipt, app, categories, paymentMethods] =
      await Promise.all([
        this.prisma.businessSettings.findUnique({ where: { id: "default" } }),
        this.prisma.receiptSettings.findUnique({ where: { id: "default" } }),
        this.prisma.appSettings.findUnique({ where: { id: "default" } }),
        this.findCategories(),
        this.findPaymentMethods(),
      ]);

    if (!business || !receipt || !app) {
      throw new NotFoundException("La configuración inicial no está cargada.");
    }

    return {
      business: {
        name: business.name,
        address: business.address,
        cuit: business.cuit,
        phone: business.phone,
      },
      receipt: {
        header: receipt.header,
        footer: receipt.footer,
      },
      defaultMarginPct: app.defaultMarginPct,
      defaultMargin: app.defaultMarginPct,
      comboTicketMode: this.toComboTicketMode(app.comboTicketMode),
      categories,
      paymentMethods,
    };
  }

  async updateBusiness(dto: UpdateBusinessSettingsDto) {
    return this.prisma.$transaction(async (tx) => {
      const previousBusiness = await tx.businessSettings.findUniqueOrThrow({
        where: { id: "default" },
        select: { name: true },
      });
      const business = await tx.businessSettings.update({
        where: { id: "default" },
        data: dto,
      });

      if (business.name !== previousBusiness.name) {
        const receipt = await tx.receiptSettings.findUnique({
          where: { id: "default" },
          select: { header: true },
        });

        if (
          receipt?.header.trim().toLowerCase() ===
          previousBusiness.name.trim().toLowerCase()
        ) {
          await tx.receiptSettings.update({
            where: { id: "default" },
            data: { header: "" },
          });
        }
      }

      return business;
    });
  }

  async updateReceipt(dto: UpdateReceiptSettingsDto) {
    return this.prisma.receiptSettings.update({
      where: { id: "default" },
      data: dto,
    });
  }

  async updateDefaultMargin(dto: UpdateDefaultMarginDto) {
    return this.prisma.appSettings.update({
      where: { id: "default" },
      data: { defaultMarginPct: dto.defaultMarginPct },
    });
  }

  async updateComboTicketMode(dto: UpdateComboTicketModeDto) {
    return this.prisma.appSettings.update({
      where: { id: "default" },
      data: { comboTicketMode: dto.comboTicketMode },
    });
  }

  async findCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({
        data: {
          id: randomUUID(),
          name: dto.name,
          active: true,
        },
        select: { id: true, name: true, active: true },
      });
    } catch (error) {
      this.handleUniqueError(error, "Ya existe una categoría con ese nombre.");
      throw error;
    }
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.assertCategoryExists(id);

    try {
      return await this.prisma.category.update({
        where: { id },
        data: dto,
        select: { id: true, name: true, active: true },
      });
    } catch (error) {
      this.handleUniqueError(error, "Ya existe una categoría con ese nombre.");
      throw error;
    }
  }

  async deleteCategory(id: string): Promise<{ id: string; deleted: true }> {
    await this.assertCategoryExists(id);

    const productsCount = await this.prisma.product.count({
      where: { categoryId: id },
    });

    if (productsCount > 0) {
      throw new ConflictException(
        "No se puede eliminar la categoría porque tiene productos asociados.",
      );
    }

    await this.prisma.category.delete({ where: { id } });

    return { id, deleted: true };
  }

  async findPaymentMethods() {
    return this.prisma.paymentMethod.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        enabled: true,
        surchargeBasisPoints: true,
        cashHandling: true,
      },
    });
  }

  async createPaymentMethod(dto: CreatePaymentMethodDto) {
    try {
      return await this.prisma.paymentMethod.create({
        data: {
          id: randomUUID(),
          name: dto.name,
          enabled: dto.enabled ?? true,
          surchargeBasisPoints: dto.surchargeBasisPoints ?? 0,
          cashHandling: dto.cashHandling ?? false,
        },
        select: {
          id: true,
          name: true,
          enabled: true,
          surchargeBasisPoints: true,
          cashHandling: true,
        },
      });
    } catch (error) {
      this.handleUniqueError(error, "Ya existe un medio de pago con ese nombre.");
      throw error;
    }
  }

  async updatePaymentMethod(id: string, dto: UpdatePaymentMethodDto) {
    await this.assertPaymentMethodExists(id);

    try {
      return await this.prisma.paymentMethod.update({
        where: { id },
        data: dto,
        select: {
          id: true,
          name: true,
          enabled: true,
          surchargeBasisPoints: true,
          cashHandling: true,
        },
      });
    } catch (error) {
      this.handleUniqueError(error, "Ya existe un medio de pago con ese nombre.");
      throw error;
    }
  }

  async deletePaymentMethod(id: string): Promise<{ id: string; deleted: true }> {
    await this.assertPaymentMethodExists(id);

    const salesCount = await this.prisma.sale.count({
      where: { paymentMethodId: id },
    });

    if (salesCount > 0) {
      throw new ConflictException(
        "No se puede eliminar el método de pago porque tiene ventas asociadas.",
      );
    }

    await this.prisma.paymentMethod.delete({ where: { id } });

    return { id, deleted: true };
  }

  private async assertCategoryExists(id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException("Categoría no encontrada.");
    }
  }

  private async assertPaymentMethodExists(id: string): Promise<void> {
    const paymentMethod = await this.prisma.paymentMethod.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!paymentMethod) {
      throw new NotFoundException("Medio de pago no encontrado.");
    }
  }

  private handleUniqueError(error: unknown, message: string): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(message);
    }
  }

  private toComboTicketMode(value: string): "ComboLine" | "ComboWithComponents" {
    return value === "ComboWithComponents" ? value : "ComboLine";
  }
}
