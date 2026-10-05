import { PrismaClient } from "@prisma/client";
import { ensureBaseData } from "../src/base-data";

export const seedDatabase = ensureBaseData;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
