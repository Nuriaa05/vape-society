import { Module } from "@nestjs/common";

import { DomainModule } from "../../domain/domain.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [PrismaModule, DomainModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
