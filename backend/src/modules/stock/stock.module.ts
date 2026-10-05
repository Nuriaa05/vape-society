import { Module } from "@nestjs/common";

import { DomainModule } from "../../domain/domain.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { StockController } from "./stock.controller";
import { StockService } from "./stock.service";

@Module({
  imports: [PrismaModule, DomainModule],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
