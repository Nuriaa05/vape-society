import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { appConfig } from "./config/app.config";
import { HealthController } from "./health.controller";
import { BackupsModule } from "./modules/backups/backups.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CombosModule } from "./modules/combos/combos.module";
import { CouponsModule } from "./modules/coupons/coupons.module";
import { HistoryModule } from "./modules/history/history.module";
import { ProductsModule } from "./modules/products/products.module";
import { PurchasesModule } from "./modules/purchases/purchases.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { SalesModule } from "./modules/sales/sales.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { StockModule } from "./modules/stock/stock.module";
import { SuppliersModule } from "./modules/suppliers/suppliers.module";
import { BaseDataService } from "./base-data.service";
import { PrismaModule } from "./prisma/prisma.module";
import { StartupChecksService } from "./startup-checks.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    BackupsModule,
    CatalogModule,
    CombosModule,
    CouponsModule,
    HistoryModule,
    PrismaModule,
    ProductsModule,
    PurchasesModule,
    ReportsModule,
    SalesModule,
    SuppliersModule,
    SettingsModule,
    StockModule,
  ],
  controllers: [HealthController],
  providers: [StartupChecksService, BaseDataService],
})
export class AppModule {}
