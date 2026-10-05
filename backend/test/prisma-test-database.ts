import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { seedDatabase } from "./fixtures/catalog-seed";

export type SeededTestDatabase = {
  prisma: PrismaClient;
  url: string;
  cleanup: () => Promise<void>;
};

const backendRoot = join(__dirname, "..");
const prismaCli = join(backendRoot, "node_modules", "prisma", "build", "index.js");

const toSqliteUrl = (path: string): string => `file:${path.replace(/\\/g, "/")}`;

export async function createEmptyTestDatabase(): Promise<SeededTestDatabase> {
  const tempDir = mkdtempSync(join(tmpdir(), "lozano-test-"));
  const databasePath = join(tempDir, "test.db");
  const databaseUrl = toSqliteUrl(databasePath);

  writeFileSync(databasePath, "");

  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  return {
    prisma,
    url: databaseUrl,
    cleanup: async () => {
      await prisma.$disconnect();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

export async function createSeededTestDatabase(): Promise<SeededTestDatabase> {
  const db = await createEmptyTestDatabase();
  try {
    await seedDatabase(db.prisma);
    return db;
  } catch (error) {
    await db.cleanup();
    throw error;
  }
}
