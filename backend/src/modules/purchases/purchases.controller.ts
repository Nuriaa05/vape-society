import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from "@nestjs/common";

import {
  CancelPurchaseDto,
  CreatePurchaseDto,
  UpdatePurchaseDto,
} from "./dto/purchase.dto";
import { PurchasesService } from "./purchases.service";

@Controller("api/purchases")
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  findAll() {
    return this.purchasesService.findAll();
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.purchasesService.findById(id);
  }

  @Post()
  create(@Body() dto: CreatePurchaseDto) {
    return this.purchasesService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePurchaseDto) {
    return this.purchasesService.update(id, dto);
  }

  @Post(":id/register")
  @HttpCode(200)
  register(@Param("id") id: string) {
    return this.purchasesService.register(id);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@Param("id") id: string, @Body() dto: CancelPurchaseDto) {
    return this.purchasesService.cancel(id, dto);
  }

  @Delete(":id")
  deleteDraft(@Param("id") id: string) {
    return this.purchasesService.deleteDraft(id);
  }
}
