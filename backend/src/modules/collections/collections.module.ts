import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import {
  CardSettlementsController,
  CollectionsController,
  CustomersController,
} from "./collections.controller";
import { CollectionsService } from "./collections.service";

@Module({
  imports: [PrismaModule],
  controllers: [
    CustomersController,
    CollectionsController,
    CardSettlementsController,
  ],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
