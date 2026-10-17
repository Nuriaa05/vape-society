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
  CreatePriceListDto,
  DuplicatePriceListDto,
  PreviewPriceListDto,
  UpdatePriceListDto,
} from "./price-lists.dto";
import { PriceListsService } from "./price-lists.service";
@Controller("api/price-lists")
export class PriceListsController {
  constructor(private readonly service: PriceListsService) {}
  @Get()
  list(
    @Query("includeInactive")
    includeInactive?: string,
  ) {
    return this.service.list(includeInactive === "true");
  }
  @Post("preview")
  @HttpCode(200)
  preview(
    @Body()
    dto: PreviewPriceListDto,
  ) {
    return this.service.preview(dto);
  }
  @Get(":id")
  find(
    @Param("id")
    id: string,
  ) {
    return this.service.find(id);
  }
  @Post()
  create(
    @Body()
    dto: CreatePriceListDto,
  ) {
    return this.service.create(dto);
  }
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePriceListDto) {
    return this.service.update(id, dto);
  }
  @Post(":id/duplicate")
  duplicate(@Param("id") id: string, @Body() dto: DuplicatePriceListDto) {
    return this.service.duplicate(id, dto.name);
  }
}
