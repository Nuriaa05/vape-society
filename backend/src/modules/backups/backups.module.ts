import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { PrismaModule } from "../../prisma/prisma.module";
import { BackupsController } from "./backups.controller";
import { BackupsService } from "./backups.service";
import { DailyBackupsService } from "./daily-backups.service";
import { DatabaseImportController } from "./database-import.controller";
import { DatabaseImportInterceptor } from "./database-import.interceptor";
import { DatabaseImportService } from "./database-import.service";
import { DataExportsController } from "./data-exports.controller";
import { DataExportsService } from "./data-exports.service";

@Module({
  imports: [PrismaModule],
  controllers: [
    BackupsController,
    DatabaseImportController,
    DataExportsController,
  ],
  providers: [
    BackupsService,
    DailyBackupsService,
    DatabaseImportService,
    DataExportsService,
    { provide: APP_INTERCEPTOR, useClass: DatabaseImportInterceptor },
  ],
  exports: [BackupsService],
})
export class BackupsModule {}
