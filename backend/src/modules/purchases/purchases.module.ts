import { Module } from "@nestjs/common";

import { DomainModule } from "../../domain/domain.module";
import { InventoryLotsModule } from "../../domain/inventory-lots.module";
import { SupplierPayablesModule } from "../supplier-payables/supplier-payables.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { PurchasesController } from "./purchases.controller";
import { PurchasesService } from "./purchases.service";

@Module({
  imports: [
    PrismaModule,
    DomainModule,
    InventoryLotsModule,
    SupplierPayablesModule,
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
