import { Injectable, NotFoundException } from "@nestjs/common";

import { BarcodeService } from "../../domain/barcode.service";
import { CombosService, type ComboResponse } from "../combos/combos.service";
import { ProductsService, type ProductResponse } from "../products/products.service";

export type CatalogBarcodeResponse =
  | { itemType: "Product"; item: ProductResponse }
  | { itemType: "Combo"; item: ComboResponse };

@Injectable()
export class CatalogService {
  constructor(
    private readonly barcodeService: BarcodeService,
    private readonly productsService: ProductsService,
    private readonly combosService: CombosService,
  ) {}

  async findByBarcode(barcode: string): Promise<CatalogBarcodeResponse> {
    const normalized = this.barcodeService.normalize(barcode);

    if (!normalized) {
      throw new NotFoundException("Código de barras no encontrado.");
    }

    const owner = await this.barcodeService.findOwner(normalized);

    if (owner?.type === "Product") {
      return {
        itemType: "Product",
        item: await this.productsService.findByBarcode(normalized),
      };
    }

    if (owner?.type === "Combo") {
      return {
        itemType: "Combo",
        item: await this.combosService.findByBarcode(normalized),
      };
    }

    throw new NotFoundException("Código de barras no encontrado.");
  }
}
