import { Module } from "@nestjs/common";
import { InventoryLotsService } from "./inventory-lots.service";

@Module({ providers: [InventoryLotsService], exports: [InventoryLotsService] })
export class InventoryLotsModule {}
