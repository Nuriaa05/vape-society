import { Controller, Get } from "@nestjs/common";

import { PrismaService } from "./prisma/prisma.service";

type HealthResponse = {
  status: "ok";
  service: "retail-core-backend";
  timestamp: string;
};

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "retail-core-backend",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async getReadiness() {
    const [, products, combos, sales, purchases] = await Promise.all([
      this.prisma.$queryRawUnsafe("SELECT 1 AS ok"),
      this.prisma.product.count(),
      this.prisma.combo.count(),
      this.prisma.sale.count(),
      this.prisma.purchase.count(),
    ]);

    return {
      status: "ready" as const,
      service: "retail-core-backend" as const,
      counts: { products, combos, sales, purchases },
    };
  }
}
