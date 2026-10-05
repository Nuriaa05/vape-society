import { PrismaClient } from "@prisma/client";

const pesosToCents = (amount: number): number => amount * 100;

const categories = [
  { id: "c0", name: "Hamburguesas" },
  { id: "c1", name: "Milanesas" },
  { id: "c2", name: "Papas" },
  { id: "c3", name: "Verduras" },
  { id: "c4", name: "Empanadas" },
  { id: "c5", name: "Medallones" },
  { id: "c6", name: "Nuggets" },
  { id: "c7", name: "Quesos" },
  { id: "c8", name: "Pizzas" },
];

const paymentMethods = [
  {
    id: "pm1",
    name: "Efectivo",
    enabled: true,
    surchargeBasisPoints: 0,
    cashHandling: true,
  },
  {
    id: "pm2",
    name: "Transferencia",
    enabled: true,
    surchargeBasisPoints: 0,
    cashHandling: false,
  },
  {
    id: "pm3",
    name: "Tarjeta",
    enabled: false,
    surchargeBasisPoints: 0,
    cashHandling: false,
  },
  {
    id: "pm4",
    name: "QR",
    enabled: true,
    surchargeBasisPoints: 0,
    cashHandling: false,
  },
  {
    id: "pm5",
    name: "Tarjeta Debito",
    enabled: true,
    surchargeBasisPoints: 250,
    cashHandling: false,
  },
  {
    id: "pm6",
    name: "Tarjeta Credito un pago",
    enabled: true,
    surchargeBasisPoints: 250,
    cashHandling: false,
  },
  {
    id: "pm7",
    name: "Tarjeta Credito cuotas",
    enabled: true,
    surchargeBasisPoints: 250,
    cashHandling: false,
  },
];

const suppliers = [
  {
    id: "s1",
    name: "Frigorífico La Pampa",
    phone: "+54 11 4555-1122",
    email: "ventas@lapampa.com.ar",
    lastPurchase: "2025-06-04",
    active: true,
    notes: "Entrega martes y viernes",
  },
  {
    id: "s2",
    name: "Distribuidora Sur SRL",
    phone: "+54 11 4720-3344",
    email: "pedidos@distsur.com.ar",
    lastPurchase: "2025-06-06",
    active: true,
  },
  {
    id: "s3",
    name: "Granja Don Mateo",
    phone: "+54 11 4881-9090",
    email: "contacto@donmateo.com.ar",
    lastPurchase: "2025-05-28",
    active: true,
  },
  {
    id: "s4",
    name: "Lácteos Andinos",
    phone: "+54 11 4322-5566",
    email: "info@lacteosandinos.com.ar",
    lastPurchase: "2025-05-20",
    active: false,
  },
];

const products = [
  product("p1", "7790001000017", "Hamburguesas de carne x4", "c0", "s1", 1850, 45, 24),
  product("p2", "7790001000024", "Milanesas de pollo x6", "c1", "s3", 3200, 40, 18),
  product("p3", "7790001000031", "Papas prefritas baston 1kg", "c2", "s2", 1450, 55, 32),
  product("p4", "7790001000048", "Verduras mix wok 500g", "c3", "s2", 1180, 50, 26),
  product("p5", "7790001000055", "Empanadas de carne x12", "c4", "s1", 2950, 42, 14),
  product("p6", "7790001000062", "Medallones de merluza x4", "c5", "s3", 2600, 48, 9),
  product("p7", "7790001000079", "Nuggets de pollo 500g", "c6", "s3", 2100, 50, 21),
  product("p8", "7790001000086", "Provoletas con orégano x4", "c7", "s4", 2800, 38, 3),
  product("p9", "7790001000093", "Pizza muzzarella congelada", "c8", "s2", 1750, 52, 28),
  product("p10", "7790001000109", "Hamburguesas premium x2", "c0", "s1", 1620, 50, 16),
  product("p11", "7790001000116", "Milanesas de carne x4", "c1", "s1", 2980, 40, 0),
  product("p12", "7790001000123", "Papas noisette 1kg", "c2", "s2", 1390, 50, 22),
];

function product(
  id: string,
  barcode: string,
  name: string,
  categoryId: string,
  supplierId: string,
  cost: number,
  marginPct: number,
  physicalStock: number,
) {
  const price = Math.round((cost * (1 + marginPct / 100)) / 10) * 10;

  return {
    id,
    barcode,
    name,
    categoryId,
    supplierId,
    costAmountCents: pesosToCents(cost),
    priceAmountCents: pesosToCents(price),
    marginPct,
    physicalStock,
    minStock: 5,
    archived: false,
  };
}

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: { name: category.name, active: true },
      create: { ...category, active: true },
    });
  }

  for (const supplier of suppliers) {
    await prisma.supplier.upsert({
      where: { id: supplier.id },
      update: {
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        lastPurchase: new Date(`${supplier.lastPurchase}T00:00:00.000Z`),
        active: supplier.active,
        notes: supplier.notes ?? null,
      },
      create: {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        lastPurchase: new Date(`${supplier.lastPurchase}T00:00:00.000Z`),
        active: supplier.active,
        notes: supplier.notes ?? null,
      },
    });
  }

  for (const paymentMethod of paymentMethods) {
    await prisma.paymentMethod.upsert({
      where: { id: paymentMethod.id },
      update: paymentMethod,
      create: paymentMethod,
    });
  }

  for (const item of products) {
    await prisma.product.upsert({
      where: { id: item.id },
      update: item,
      create: item,
    });
  }

  await prisma.businessSettings.upsert({
    where: { id: "default" },
    update: {
      name: "Lozano Congelados",
      address: "Av. Cabildo 2450, CABA",
      cuit: "30-12345678-9",
      phone: "+54 11 4555-0000",
    },
    create: {
      id: "default",
      name: "Lozano Congelados",
      address: "Av. Cabildo 2450, CABA",
      cuit: "30-12345678-9",
      phone: "+54 11 4555-0000",
    },
  });

  await prisma.receiptSettings.upsert({
    where: { id: "default" },
    update: {
      header: "LOZANO CONGELADOS - Congelados de calidad",
      footer: "Gracias por su compra. Conservar refrigerado.",
    },
    create: {
      id: "default",
      header: "LOZANO CONGELADOS - Congelados de calidad",
      footer: "Gracias por su compra. Conservar refrigerado.",
    },
  });

  await prisma.appSettings.upsert({
    where: { id: "default" },
    update: { defaultMarginPct: 45, comboTicketMode: "ComboLine" },
    create: {
      id: "default",
      defaultMarginPct: 45,
      comboTicketMode: "ComboLine",
    },
  });

  await prisma.counter.upsert({
    where: { key: "saleReceiptNumber" },
    update: {},
    create: { key: "saleReceiptNumber", value: 0 },
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
