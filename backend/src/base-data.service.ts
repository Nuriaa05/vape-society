import { Injectable, OnApplicationBootstrap } from "@nestjs/common";

import { ensureBaseData } from "./base-data";
import { PrismaService } from "./prisma/prisma.service";

@Injectable()
export class BaseDataService implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): Promise<void> {
    return this.ensureBaseData();
  }

  ensureBaseData(): Promise<void> {
    return ensureBaseData(this.prisma);
  }
}
