import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";

import { CreateBackupDto, RestorePlanDto } from "./dto/backup.dto";
import { BackupsService } from "./backups.service";

@Controller("api/backups")
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get()
  findAll() {
    return this.backupsService.findAll();
  }

  @Get("location")
  getLocation() {
    return this.backupsService.getLocation();
  }

  @Post()
  create(@Body() _dto: CreateBackupDto) {
    return this.backupsService.createBackup();
  }

  @Post(":id/restore-plan")
  @HttpCode(200)
  getRestorePlan(@Param("id") id: string, @Body() _dto: RestorePlanDto) {
    return this.backupsService.getRestorePlan(id);
  }
}
