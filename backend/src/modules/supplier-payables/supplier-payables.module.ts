import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { SupplierPayablesController } from "./supplier-payables.controller";
import { SupplierPayablesService } from "./supplier-payables.service";

@Module({
  imports: [PrismaModule],
  controllers: [SupplierPayablesController],
  providers: [SupplierPayablesService],
  exports: [SupplierPayablesService],
})
export class SupplierPayablesModule {}
