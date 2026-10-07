import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  PayloadTooLargeException,
  Post,
  Req,
} from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { Equals } from "class-validator";

import {
  DatabaseImportService,
  MAX_IMPORT_BYTES,
} from "./database-import.service";

class ConfirmImportDto {
  @Equals(true, {
    message: "Confirmá el reemplazo de los datos antes de importar.",
  })
  confirmed!: true;
}

@Controller("api/backups/import")
export class DatabaseImportController {
  constructor(private readonly imports: DatabaseImportService) {}

  @Post("validate")
  async validate(@Req() request: IncomingMessage) {
    const contentType = request.headers["content-type"]?.split(";")[0];
    if (contentType !== "application/vnd.sqlite3") {
      request.resume();
      throw new BadRequestException(
        "Seleccioná un respaldo SQLite válido (.db, .sqlite o .sqlite3).",
      );
    }
    if (Number(request.headers["content-length"]) > MAX_IMPORT_BYTES) {
      request.resume();
      throw new PayloadTooLargeException(
        "El respaldo no puede superar los 50 MB.",
      );
    }
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.length;
      if (length > MAX_IMPORT_BYTES)
        throw new PayloadTooLargeException(
          "El respaldo no puede superar los 50 MB.",
        );
      chunks.push(bytes);
    }
    return this.imports.validate(Buffer.concat(chunks));
  }

  @Post(":id/confirm")
  confirm(@Param("id") id: string, @Body() _dto: ConfirmImportDto) {
    return this.imports.confirm(id);
  }

  @Delete(":id")
  @HttpCode(204)
  discard(@Param("id") id: string) {
    return this.imports.discard(id);
  }
}
