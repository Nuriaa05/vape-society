import { Controller, Get, Param } from "@nestjs/common";

import { CatalogService } from "./catalog.service";

@Controller("api/catalog")
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("barcode/:barcode")
  findByBarcode(@Param("barcode") barcode: string) {
    return this.catalogService.findByBarcode(barcode);
  }
}
