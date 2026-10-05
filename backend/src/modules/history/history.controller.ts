import { Controller, Get, Query } from "@nestjs/common";

import { ListHistoryQueryDto } from "./dto/history.dto";
import { HistoryService } from "./history.service";

@Controller("api/history")
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get("months")
  getMonths() {
    return this.historyService.getMonths();
  }

  @Get()
  findAll(@Query() query: ListHistoryQueryDto) {
    return this.historyService.findAll(query);
  }
}
