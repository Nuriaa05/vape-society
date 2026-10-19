import { Controller, Get, Param } from "@nestjs/common";
import { DataExportsService } from "./data-exports.service";

@Controller("api/data-exports")
export class DataExportsController {
  constructor(private readonly exports: DataExportsService) {}

  @Get(":section")
  rows(@Param("section") section: string) {
    return this.exports.rows(section);
  }
}
