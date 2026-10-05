import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";

import {
  CreateCategoryDto,
  CreatePaymentMethodDto,
  UpdateBusinessSettingsDto,
  UpdateCategoryDto,
  UpdateComboTicketModeDto,
  UpdateDefaultMarginDto,
  UpdatePaymentMethodDto,
  UpdateReceiptSettingsDto,
} from "./dto/settings.dto";
import { SettingsService } from "./settings.service";

@Controller("api/settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch("business")
  updateBusiness(@Body() dto: UpdateBusinessSettingsDto) {
    return this.settingsService.updateBusiness(dto);
  }

  @Patch("receipt")
  updateReceipt(@Body() dto: UpdateReceiptSettingsDto) {
    return this.settingsService.updateReceipt(dto);
  }

  @Patch("default-margin")
  updateDefaultMargin(@Body() dto: UpdateDefaultMarginDto) {
    return this.settingsService.updateDefaultMargin(dto);
  }

  @Patch("combo-ticket-mode")
  updateComboTicketMode(@Body() dto: UpdateComboTicketModeDto) {
    return this.settingsService.updateComboTicketMode(dto);
  }

  @Get("categories")
  findCategories() {
    return this.settingsService.findCategories();
  }

  @Post("categories")
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.settingsService.createCategory(dto);
  }

  @Patch("categories/:id")
  updateCategory(@Param("id") id: string, @Body() dto: UpdateCategoryDto) {
    return this.settingsService.updateCategory(id, dto);
  }

  @Delete("categories/:id")
  deleteCategory(@Param("id") id: string) {
    return this.settingsService.deleteCategory(id);
  }

  @Get("payment-methods")
  findPaymentMethods() {
    return this.settingsService.findPaymentMethods();
  }

  @Post("payment-methods")
  createPaymentMethod(@Body() dto: CreatePaymentMethodDto) {
    return this.settingsService.createPaymentMethod(dto);
  }

  @Patch("payment-methods/:id")
  updatePaymentMethod(
    @Param("id") id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ) {
    return this.settingsService.updatePaymentMethod(id, dto);
  }

  @Delete("payment-methods/:id")
  deletePaymentMethod(@Param("id") id: string) {
    return this.settingsService.deletePaymentMethod(id);
  }
}
