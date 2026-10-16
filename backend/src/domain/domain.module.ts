import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { InventoryLotsModule } from "./inventory-lots.module";
import { BarcodeService } from "./barcode.service";
import { ReceiptNumberService } from "./receipt-number.service";
import { StockRulesService } from "./stock-rules.service";
import { TotalsService } from "./totals.service";

@Module({
  imports: [PrismaModule, InventoryLotsModule],
  providers: [
    BarcodeService,
    ReceiptNumberService,
    StockRulesService,
    TotalsService,
  ],
  exports: [
    InventoryLotsModule,
    BarcodeService,
    ReceiptNumberService,
    StockRulesService,
    TotalsService,
  ],
})
export class DomainModule {}
