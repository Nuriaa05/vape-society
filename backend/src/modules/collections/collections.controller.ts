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
import {
  AccreditationDto,
  CardScheduleDto,
  CreateCollectionDto,
  CreateCustomerDto,
  CreateRefundDto,
  FinanceQueryDto,
  OpeningBalanceDto,
  ReasonDto,
  UpdateCustomerDto,
} from "./collections.dto";
import { CollectionsService } from "./collections.service";

@Controller("api/customers")
export class CustomersController {
  constructor(private readonly service: CollectionsService) {}
  @Get() list(@Query() query: FinanceQueryDto) {
    return this.service.listCustomers(query);
  }
  @Post() create(@Body() dto: CreateCustomerDto) {
    return this.service.createCustomer(dto);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.service.updateCustomer(id, dto);
  }
  @Get(":id/account") account(@Param("id") id: string) {
    return this.service.account(id);
  }
  @Post(":id/opening-balances") opening(
    @Param("id") id: string,
    @Body() dto: OpeningBalanceDto,
  ) {
    return this.service.createOpeningBalance(id, dto);
  }
  @Post(":id/plans/:planId/cancel") @HttpCode(200) cancel(
    @Param("id") id: string,
    @Param("planId") planId: string,
    @Body() dto: ReasonDto,
  ) {
    return this.service.cancelPlan(id, planId, dto.reason);
  }
}

@Controller("api/collections")
export class CollectionsController {
  constructor(private readonly service: CollectionsService) {}
  @Get() list(@Query() query: FinanceQueryDto) {
    return this.service.listInstallments(query);
  }
  @Get("summary") summary(@Query() query: FinanceQueryDto) {
    return this.service.getSummary(query);
  }
  @Get("refunds") refunds(@Query() query: FinanceQueryDto) {
    return this.service.listRefunds(query);
  }
  @Post("refunds") refund(@Body() dto: CreateRefundDto) {
    return this.service.createRefund(dto);
  }
  @Post("refunds/:id/reverse") @HttpCode(200) reverseRefund(
    @Param("id") id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.service.reverseRefund(id, dto.reason);
  }
  @Get("refunds/:id/receipt") refundReceipt(@Param("id") id: string) {
    return this.service.receipt(id, true);
  }
  @Post() create(@Body() dto: CreateCollectionDto) {
    return this.service.createCollection(dto);
  }
  @Post(":id/reverse") @HttpCode(200) reverse(
    @Param("id") id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.service.reverseCollection(id, dto.reason);
  }
  @Get(":id/receipt") receipt(@Param("id") id: string) {
    return this.service.receipt(id);
  }
}

@Controller("api/card-settlements")
export class CardSettlementsController {
  constructor(private readonly service: CollectionsService) {}
  @Get() list(@Query() query: FinanceQueryDto) {
    return this.service.listSettlements(query);
  }
  @Post("sales/:saleId/schedule") schedule(
    @Param("saleId") saleId: string,
    @Body() dto: CardScheduleDto,
  ) {
    return this.service.scheduleCardSale(saleId, dto);
  }
  @Post(":id/accreditations") accredit(
    @Param("id") id: string,
    @Body() dto: AccreditationDto,
  ) {
    return this.service.accredit(id, dto);
  }
  @Post("accreditations/:id/reverse") @HttpCode(200) reverse(
    @Param("id") id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.service.reverseAccreditation(id, dto.reason);
  }
}
