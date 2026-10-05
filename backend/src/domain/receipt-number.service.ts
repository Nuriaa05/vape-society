import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

const RECEIPT_COUNTER_KEY = "saleReceiptNumber";

@Injectable()
export class ReceiptNumberService {
  async nextSaleNumber(tx: Prisma.TransactionClient): Promise<string> {
    const counter = await tx.counter.upsert({
      where: { key: RECEIPT_COUNTER_KEY },
      update: { value: { increment: 1 } },
      create: { key: RECEIPT_COUNTER_KEY, value: 1 },
    });

    return this.format(counter.value);
  }

  private format(value: number): string {
    return String(value).padStart(6, "0");
  }
}
