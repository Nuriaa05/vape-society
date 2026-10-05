import { Module } from "@nestjs/common";

import { DomainModule } from "../../domain/domain.module";
import { CombosModule } from "../combos/combos.module";
import { ProductsModule } from "../products/products.module";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

@Module({
  imports: [CombosModule, DomainModule, ProductsModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
