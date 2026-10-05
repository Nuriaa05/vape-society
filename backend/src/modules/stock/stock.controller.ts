import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import {
  CreateStockAdjustmentDto,
  ReverseStockMovementDto,
} from "./dto/stock-adjustment.dto";
import { StockService } from "./stock.service";

@Controller("api/stock")
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  findAll() {
    return this.stockService.findAll();
  }

  @Get("movements")
  findMovements() {
    return this.stockService.findMovements();
  }

  @Post("adjustments")
  createAdjustment(@Body() dto: CreateStockAdjustmentDto) {
    return this.stockService.createAdjustment(dto);
  }

  @Post("movements/:id/reverse")
  reverseMovement(
    @Param("id") id: string,
    @Body() dto: ReverseStockMovementDto,
  ) {
    return this.stockService.reverseMovement(id, dto);
  }
}
