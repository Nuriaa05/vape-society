import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";

import {
  CreateSupplierDto,
  UpdateSupplierDto,
  UpdateSupplierStatusDto,
} from "./dto/supplier.dto";
import { SuppliersService } from "./suppliers.service";

const toBoolean = (value: string | undefined): boolean =>
  value === "true" || value === "1";

@Controller("api/suppliers")
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  findAll(@Query("activeOnly") activeOnly?: string) {
    return this.suppliersService.findAll({ activeOnly: toBoolean(activeOnly) });
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.suppliersService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateSupplierStatusDto) {
    return this.suppliersService.updateStatus(id, dto);
  }
}
