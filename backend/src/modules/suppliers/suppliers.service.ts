import { randomUUID } from "node:crypto";

import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Supplier } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  UpdateSupplierStatusDto,
} from "./dto/supplier.dto";
import { LOCAL_SUPPLIER_ID } from "./supplier.constants";

export type SupplierResponse = Omit<Supplier, "lastPurchase"> & {
  lastPurchase: string | null;
};

export type FindSuppliersOptions = {
  activeOnly?: boolean;
};

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(options: FindSuppliersOptions = {}): Promise<SupplierResponse[]> {
    const suppliers = await this.prisma.supplier.findMany({
      where: options.activeOnly ? { active: true } : undefined,
      orderBy: { name: "asc" },
    });

    return suppliers.map((supplier) => this.serialize(supplier));
  }

  async findById(id: string): Promise<SupplierResponse> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });

    if (!supplier) {
      throw new NotFoundException("Proveedor no encontrado.");
    }

    return this.serialize(supplier);
  }

  async create(dto: CreateSupplierDto): Promise<SupplierResponse> {
    const supplier = await this.prisma.supplier.create({
      data: {
        id: randomUUID(),
        name: dto.name,
        phone: this.normalizePhone(dto.phone),
        email: this.normalizeEmail(dto.email),
        lastPurchase: this.toDate(dto.lastPurchase),
        active: dto.active ?? true,
        notes: dto.notes ?? null,
      },
    });

    return this.serialize(supplier);
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<SupplierResponse> {
    this.assertEditableSupplier(id);
    await this.findById(id);

    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: {
        name: dto.name,
        phone:
          dto.phone === undefined ? undefined : this.normalizePhone(dto.phone),
        email:
          dto.email === undefined ? undefined : this.normalizeEmail(dto.email),
        lastPurchase:
          dto.lastPurchase === null ? null : this.toDate(dto.lastPurchase),
        active: dto.active,
        notes: dto.notes,
      },
    });

    return this.serialize(supplier);
  }

  async updateStatus(
    id: string,
    dto: UpdateSupplierStatusDto,
  ): Promise<SupplierResponse> {
    this.assertEditableSupplier(id);
    await this.findById(id);

    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: { active: dto.active },
    });

    return this.serialize(supplier);
  }

  private toDate(value?: string | null): Date | undefined {
    return value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : undefined;
  }

  private normalizeEmail(value?: string | null): string {
    return value?.trim() ?? "";
  }

  private normalizePhone(value?: string): string {
    return value?.trim() || "-";
  }

  private assertEditableSupplier(id: string): void {
    if (id === LOCAL_SUPPLIER_ID) {
      throw new ConflictException("El proveedor Local es fijo y protegido.");
    }
  }

  private serialize(supplier: Supplier): SupplierResponse {
    return {
      ...supplier,
      lastPurchase: supplier.lastPurchase?.toISOString().slice(0, 10) ?? null,
    };
  }
}
