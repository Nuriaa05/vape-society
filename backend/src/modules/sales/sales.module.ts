import { Module } from "@nestjs/common";

import { DomainModule } from "../../domain/domain.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { CouponsModule } from "../coupons/coupons.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [PrismaModule, DomainModule, CouponsModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
