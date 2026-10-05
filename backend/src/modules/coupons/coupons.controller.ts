import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";

import { CouponsService } from "./coupons.service";
import { CreateCouponDto, UpdateCouponDto } from "./dto/coupon.dto";

@Controller("api/coupons")
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  findAll() {
    return this.couponsService.findAll();
  }

  @Post()
  create(@Body() dto: CreateCouponDto) {
    return this.couponsService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCouponDto) {
    return this.couponsService.update(id, dto);
  }

  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.couponsService.delete(id);
  }
}
