import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  SupplierOpeningDto,
  SupplierPaymentDto,
  SupplierPayablesQueryDto,
  SupplierReasonDto,
} from "./supplier-payables.dto";
import { SupplierPayablesService } from "./supplier-payables.service";

@Controller("api/supplier-payables")
export class SupplierPayablesController {
  constructor(private readonly service: SupplierPayablesService) {}
  @Get() list(@Query() query: SupplierPayablesQueryDto) {
    return this.service.findAll(query);
  }
  @Get("summary") summary(@Query() query: SupplierPayablesQueryDto) {
    return this.service.summary(query);
  }
  @Get("account/:supplierId") account(@Param("supplierId") id: string) {
    return this.service.account(id);
  }
  @Post("opening") opening(@Body() dto: SupplierOpeningDto) {
    return this.service.createOpening(dto);
  }
  @Post(":id/payments") payment(
    @Param("id") id: string,
    @Body() dto: SupplierPaymentDto,
  ) {
    return this.service.pay(id, dto);
  }
  @Post("payments/:id/reverse") reversePayment(
    @Param("id") id: string,
    @Body() dto: SupplierReasonDto,
  ) {
    return this.service.reversePayment(id, dto.reason);
  }
  @Post(":id/refunds") refund(
    @Param("id") id: string,
    @Body() dto: SupplierPaymentDto,
  ) {
    return this.service.refund(id, dto);
  }
  @Post("refunds/:id/reverse") reverseRefund(
    @Param("id") id: string,
    @Body() dto: SupplierReasonDto,
  ) {
    return this.service.reverseRefund(id, dto.reason);
  }
  @Post(":id/cancel") cancel(
    @Param("id") id: string,
    @Body() dto: SupplierReasonDto,
  ) {
    return this.service.cancel(id, dto.reason);
  }
}
