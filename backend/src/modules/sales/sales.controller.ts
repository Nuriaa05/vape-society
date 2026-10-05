import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { CancelSaleDto, CreateSaleDto, ListSalesQueryDto } from "./dto/sale.dto";
import { SalesService } from "./sales.service";

@Controller("api/sales")
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  findAll(@Query() query: ListSalesQueryDto) {
    return this.salesService.findAll(query);
  }

  @Get(":id/receipt")
  getReceipt(@Param("id") id: string) {
    return this.salesService.getReceiptData(id);
  }

  @Post("quote")
  @HttpCode(200)
  quote(@Body() dto: CreateSaleDto) {
    return this.salesService.quote(dto);
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.salesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateSaleDto) {
    return this.salesService.create(dto);
  }

  @Patch(":id/deliver")
  deliver(@Param("id") id: string) {
    return this.salesService.deliver(id);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@Param("id") id: string, @Body() dto: CancelSaleDto) {
    return this.salesService.cancel(id, dto);
  }
}
