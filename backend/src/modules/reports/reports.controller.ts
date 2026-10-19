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
  getCommercialSummary(@Query("from") from?: string, @Query("to") to?: string) {
    return this.reportsService.getCommercialSummary(from, to);
  }

  @Get("sales-series")
  getSalesSeries(
    @Query("period") period?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reportsService.getSalesSeries(period, from, to);
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
  getProductConsumption(
    @Query("range") range?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reportsService.getProductConsumption(range, from, to);
  }

  @Get("sales")
  getSalesExport(
    @Query("range") range?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reportsService.getSalesExport(range, from, to);
  }

  @Get("payment-methods")
  getPaymentMethodsBreakdown(
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reportsService.getPaymentMethodsBreakdown(from, to);
  }
}
