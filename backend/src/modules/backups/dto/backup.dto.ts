import { IsBoolean } from "class-validator";

export class CreateBackupDto {}

export class RestorePlanDto {}

export class UpdateBackupAutomationDto {
  @IsBoolean()
  enabled!: boolean;
}
