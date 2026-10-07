import { Body, Controller, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";

import {
  CreateBackupDto,
  RestorePlanDto,
  UpdateBackupAutomationDto,
} from "./dto/backup.dto";
import { BackupsService } from "./backups.service";
import { DailyBackupsService } from "./daily-backups.service";

@Controller("api/backups")
export class BackupsController {
  constructor(
    private readonly backupsService: BackupsService,
    private readonly dailyBackupsService: DailyBackupsService,
  ) {}

  @Get()
  findAll() {
    return this.backupsService.findAll();
  }

  @Get("location")
  getLocation() {
    return this.backupsService.getLocation();
  }

  @Get("automation")
  getAutomation() {
    return this.backupsService.getAutomation();
  }

  @Patch("automation")
  async updateAutomation(@Body() dto: UpdateBackupAutomationDto) {
    const settings = await this.backupsService.updateAutomation(dto.enabled);
    if (settings.enabled) void this.dailyBackupsService.runScheduledBackup();
    return settings;
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
