import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";

import { CombosService } from "./combos.service";
import { ArchiveComboDto, CreateComboDto, UpdateComboDto } from "./dto/combo.dto";

@Controller("api/combos")
export class CombosController {
  constructor(private readonly combosService: CombosService) {}

  @Get()
  findAll(@Query("includeArchived") includeArchived?: string) {
    return this.combosService.findAll({
      includeArchived: includeArchived === "true",
    });
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.combosService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateComboDto) {
    return this.combosService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateComboDto) {
    return this.combosService.update(id, dto);
  }

  @Patch(":id/archive")
  setArchived(@Param("id") id: string, @Body() dto: ArchiveComboDto) {
    return this.combosService.setArchived(id, dto);
  }
}
