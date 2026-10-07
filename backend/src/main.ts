import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import { configureLocalFrontend } from "./local-frontend";

export async function bootstrap(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  configureLocalFrontend(
    app,
    configService.get<string>("frontendDistDir"),
  );

  app.enableCors({
    origin: configService.get<string>("frontendOrigin") ?? "http://127.0.0.1:8081",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  });

  const port = configService.get<number>("port") ?? 3002;
  const host = configService.get<string>("host") ?? "127.0.0.1";

  await app.listen(port, host);
  app.enableShutdownHooks();
  return app;
}

if (require.main === module) {
  void bootstrap().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
