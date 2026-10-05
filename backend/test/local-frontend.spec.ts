import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { appConfig } from "../src/config/app.config";
import { createEmptyTestDatabase } from "./prisma-test-database";
import {
  configureLocalFrontend,
  isSpaNavigationRequest,
} from "../src/local-frontend";

describe("local frontend", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.FRONTEND_DIST_DIR;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("keeps static frontend serving disabled unless a directory is configured", () => {
    expect(appConfig().frontendDistDir).toBeUndefined();

    process.env.FRONTEND_DIST_DIR = "C:/runtime/frontend";

    expect(appConfig().frontendDistDir).toBe("C:/runtime/frontend");
  });

  it.each(["/", "/productos", "/nueva-venta", "/ventas?id=1"])(
    "serves the SPA document for browser navigation to %s",
    (path) => {
      expect(
        isSpaNavigationRequest({
          method: "GET",
          path,
          accept: "text/html,application/xhtml+xml",
        }),
      ).toBe(true);
    },
  );

  it.each([
    "/api/products",
    "/api",
    "/health",
    "/assets/index.js",
    "/favicon.ico",
  ])("does not intercept backend or static resource path %s", (path) => {
    expect(
      isSpaNavigationRequest({ method: "GET", path, accept: "text/html" }),
    ).toBe(false);
  });

  it("does not intercept non-GET requests or requests that do not accept HTML", () => {
    expect(
      isSpaNavigationRequest({
        method: "POST",
        path: "/productos",
        accept: "text/html",
      }),
    ).toBe(false);
    expect(
      isSpaNavigationRequest({
        method: "GET",
        path: "/productos",
        accept: "application/json",
      }),
    ).toBe(false);
  });

  it("serves the SPA before Nest handles unknown browser routes as 404", async () => {
    const db = await createEmptyTestDatabase();
    process.env.DATABASE_URL = db.url;
    const frontendDir = await mkdtemp(join(tmpdir(), "lozano-frontend-"));
    await writeFile(
      join(frontendDir, "index.html"),
      "<!doctype html><div id=\"root\">Lozano local</div>",
      "utf8",
    );
    process.env.FRONTEND_DIST_DIR = frontendDir;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    const configService = moduleRef.get(ConfigService);
    expect(configService.get<string>("frontendDistDir")).toBe(frontendDir);
    configureLocalFrontend(
      app,
      configService.get<string>("frontendDistDir"),
    );

    try {
      await app.init();
      const root = await request(app.getHttpServer())
        .get("/productos")
        .set("Accept", "text/html")
        .expect(200);
      expect(root.text).toContain("Lozano local");
      await request(app.getHttpServer()).get("/health").expect(200);
      await request(app.getHttpServer()).get("/api/not-found").expect(404);
    } finally {
      await app.close();
      await db.cleanup();
      await rm(frontendDir, { recursive: true, force: true });
    }
  });
});
