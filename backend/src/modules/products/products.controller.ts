import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";

import {
  ArchiveProductDto,
  CreateProductDto,
  UpdateProductDto,
} from "./dto/product.dto";
import { ProductsService } from "./products.service";

const toBoolean = (value: string | undefined): boolean =>
  value === "true" || value === "1";

const toOptionalLimit = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException("El limite debe ser un entero positivo.");
  }

  return parsed;
};

@Controller("api/products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(
    @Query("includeArchived") includeArchived?: string,
    @Query("q") query?: string,
    @Query("limit") limit?: string,
  ) {
    return this.productsService.findAll({
      includeArchived: toBoolean(includeArchived),
      query,
      limit: toOptionalLimit(limit),
    });
  }

  @Get("alerts")
  findAlerts(@Query("limit") limit?: string) {
    return this.productsService.findInventoryAlerts(toOptionalLimit(limit));
  }

  @Get("barcode/:barcode")
  findByBarcode(@Param("barcode") barcode: string) {
    return this.productsService.findByBarcode(barcode);
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.productsService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Patch(":id/archive")
  archive(@Param("id") id: string, @Body() dto: ArchiveProductDto) {
    return this.productsService.setArchived(id, dto);
  }
}
