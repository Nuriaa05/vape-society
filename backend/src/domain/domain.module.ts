import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { BarcodeService } from "./barcode.service";
import { ReceiptNumberService } from "./receipt-number.service";
import { StockRulesService } from "./stock-rules.service";
import { TotalsService } from "./totals.service";

@Module({
  imports: [PrismaModule],
  providers: [
    BarcodeService,
    ReceiptNumberService,
    StockRulesService,
    TotalsService,
  ],
  exports: [
    BarcodeService,
    ReceiptNumberService,
    StockRulesService,
    TotalsService,
  ],
})
export class DomainModule {}
