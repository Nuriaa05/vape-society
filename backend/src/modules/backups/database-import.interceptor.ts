import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { defer, finalize, type Observable } from "rxjs";

import { DatabaseImportService } from "./database-import.service";

@Injectable()
export class DatabaseImportInterceptor implements NestInterceptor {
  constructor(private readonly imports: DatabaseImportService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    if (this.imports.isImporting) {
      throw new ServiceUnavailableException(
        "Se están importando los datos. Esperá a que termine la operación.",
      );
    }
    const request = context.switchToHttp().getRequest<IncomingMessage>();
    const isConfirmation =
      request.method === "POST" &&
      /^\/api\/backups\/import\/[^/]+\/confirm\/?(?:\?.*)?$/.test(
        request.url ?? "",
      );
    if (isConfirmation) return next.handle();

    const release = this.imports.trackRequest();
    return defer(() => next.handle()).pipe(finalize(release));
  }
}
