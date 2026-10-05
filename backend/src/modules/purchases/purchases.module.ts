import { Module } from "@nestjs/common";

import { DomainModule } from "../../domain/domain.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { PurchasesController } from "./purchases.controller";
import { PurchasesService } from "./purchases.service";

@Module({
  imports: [PrismaModule, DomainModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
