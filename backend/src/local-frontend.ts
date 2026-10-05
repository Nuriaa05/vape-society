import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";

import type { NestExpressApplication } from "@nestjs/platform-express";

type LocalFrontendRequest = {
  method: string;
  originalUrl: string;
  get: (name: string) => string | undefined;
};

type LocalFrontendResponse = {
  sendFile: (path: string, options: { dotfiles: "allow" }) => void;
};

type Next = () => void;

export type SpaNavigationRequest = {
  method: string;
  path: string;
  accept: string | undefined;
};

export function isSpaNavigationRequest({
  method,
  path,
  accept,
}: SpaNavigationRequest): boolean {
  if (method.toUpperCase() !== "GET" || !accept?.includes("text/html")) {
    return false;
  }

  const pathname = path.split(/[?#]/, 1)[0] || "/";
  if (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/health" ||
    pathname.startsWith("/health/")
  ) {
    return false;
  }

  return extname(pathname) === "";
}

export function configureLocalFrontend(
  app: NestExpressApplication,
  frontendDistDir: string | undefined,
): void {
  if (!frontendDistDir) return;

  const root = resolve(frontendDistDir);
  const indexPath = join(root, "index.html");
  if (!existsSync(indexPath)) {
    throw new Error(`Frontend local no encontrado: ${indexPath}`);
  }

  app.useStaticAssets(root, { index: false });
  app.use(
    (
      request: LocalFrontendRequest,
      response: LocalFrontendResponse,
      next: Next,
    ): void => {
      if (
        !isSpaNavigationRequest({
          method: request.method,
          path: request.originalUrl,
          accept: request.get("accept"),
        })
      ) {
        next();
        return;
      }

      response.sendFile(indexPath, { dotfiles: "allow" });
    },
  );
}
