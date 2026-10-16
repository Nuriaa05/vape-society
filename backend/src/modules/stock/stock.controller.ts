import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";

import {
  ClassifyStockDto,
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

  @Get("summary")
  summary(@Query("q") q?: string) {
    return this.stockService.summary(q);
  }

  @Post("classifications")
  classify(@Body() dto: ClassifyStockDto) {
    return this.stockService.classify(dto);
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
