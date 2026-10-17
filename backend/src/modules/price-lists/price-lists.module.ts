import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PriceListsController } from "./price-lists.controller";
import { PriceListsService } from "./price-lists.service";
import { PricingResolver } from "./pricing-resolver";
@Module({
  imports: [PrismaModule],
  controllers: [PriceListsController],
  providers: [PriceListsService, PricingResolver],
  exports: [PricingResolver],
})
export class PriceListsModule {}
