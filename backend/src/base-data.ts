import type { PrismaClient } from "@prisma/client";

import {
  LOCAL_SUPPLIER_ID,
  LOCAL_SUPPLIER_NAME,
} from "./modules/suppliers/supplier.constants";

const PAYMENT_METHODS = [
  { id: "pm1", name: "Efectivo", surchargeBasisPoints: 0, cashHandling: true },
  {
    id: "pm2",
    name: "Transferencia",
    surchargeBasisPoints: 0,
    cashHandling: false,
  },
  { id: "pm4", name: "QR", surchargeBasisPoints: 0, cashHandling: false },
  {
    id: "pm5",
    name: "Tarjeta Debito",
    surchargeBasisPoints: 250,
    cashHandling: false,
  },
  {
    id: "pm6",
    name: "Tarjeta Credito un pago",
    surchargeBasisPoints: 250,
    cashHandling: false,
  },
  {
    id: "pm7",
    name: "Tarjeta Credito cuotas",
    surchargeBasisPoints: 250,
    cashHandling: false,
  },
];

export async function ensureBaseData(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.paymentMethod.findMany();
    const existingIds = new Set(existing.map((method) => method.id));
    const existingNames = new Set(
      existing.map((method) => method.name.trim().toLowerCase()),
    );
    for (const method of PAYMENT_METHODS) {
      if (
        existingIds.has(method.id) ||
        existingNames.has(method.name.trim().toLowerCase())
      )
        continue;
      await tx.paymentMethod.create({ data: { ...method, enabled: true } });
    }
    const legacyCard = existing.find((method) => method.id === "pm3");
    if (
      legacyCard?.enabled &&
      legacyCard.name.trim().toLowerCase() === "tarjeta"
    ) {
      await tx.paymentMethod.update({
        where: { id: legacyCard.id },
        data: { enabled: false },
      });
    }
    await tx.businessSettings.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        name: "Nuevo comercio",
        address: "",
        cuit: "",
        phone: "",
      },
    });
    await tx.receiptSettings.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        header: "",
        footer: "Comprobante interno. No válido como factura fiscal.",
      },
    });
    await tx.appSettings.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        defaultMarginPct: 45,
        comboTicketMode: "ComboLine",
      },
    });
    await tx.counter.upsert({
      where: { key: "saleReceiptNumber" },
      update: {},
      create: { key: "saleReceiptNumber", value: 0 },
    });
    await tx.supplier.upsert({
      where: { id: LOCAL_SUPPLIER_ID },
      update: {},
      create: {
        id: LOCAL_SUPPLIER_ID,
        name: LOCAL_SUPPLIER_NAME,
        phone: "-",
        email: "",
        active: true,
      },
    });
  });
}
