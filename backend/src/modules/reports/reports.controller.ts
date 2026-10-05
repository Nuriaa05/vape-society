import { Controller, Get, Query } from "@nestjs/common";

import { ReportsService } from "./reports.service";

@Controller("api/reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("dashboard")
  getDashboardSummary() {
    return this.reportsService.getDashboardSummary();
  }

  @Get("commercial")
  getCommercialSummary() {
    return this.reportsService.getCommercialSummary();
  }

  @Get("sales-series")
  getSalesSeries(@Query("period") period?: string) {
    return this.reportsService.getSalesSeries(period);
  }

  @Get("units-series")
  getSoldUnitsSeries(@Query("period") period?: string) {
    return this.reportsService.getSoldUnitsSeries(period);
  }

  @Get("top-products")
  getTopProducts(
    @Query("range") range?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("sort") sort?: string,
  ) {
    return this.reportsService.getTopProducts(range, from, to, sort);
  }

  @Get("product-consumption")
  getProductConsumption(@Query("range") range?: string) {
    return this.reportsService.getProductConsumption(range);
  }

  @Get("sales")
  getSalesExport(@Query("range") range?: string) {
    return this.reportsService.getSalesExport(range);
  }

  @Get("payment-methods")
  getPaymentMethodsBreakdown() {
    return this.reportsService.getPaymentMethodsBreakdown();
  }
}
