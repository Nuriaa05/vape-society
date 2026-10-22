const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { createStockDemo, parseOptions } = require("./create-stock-demo.cjs");

const backend = join(__dirname, "../backend");
const money = (cents) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(
    cents / 100,
  );
const isoDay = (date) => date.toISOString().slice(0, 10);

function buildSalesScenarios(today) {
  const parsed = new Date(`${today}T12:00:00Z`);
  assert.equal(isoDay(parsed), today, "La fecha debe ser AAAA-MM-DD.");
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  const scenarios = [];
  for (let offset = 5; offset >= 1; offset -= 1) {
    for (const day of [5, 15, 25]) {
      scenarios.push({
        day: isoDay(new Date(Date.UTC(year, month - offset, day))),
        hour: 10 + (day % 9),
        status: "Entregado",
      });
    }
  }
  for (let day = 1; day <= parsed.getUTCDate(); day += 1) {
    scenarios.push({
      day: `${today.slice(0, 8)}${String(day).padStart(2, "0")}`,
      hour: 9 + (day % 10),
      status: "Entregado",
    });
  }
  for (const hour of [8, 11, 16, 19])
    scenarios.push({ day: today, hour, status: "Entregado" });
  scenarios.push({ day: today, hour: 14, status: "Entregado", loss: true });
  for (let index = 0; index < 3; index += 1)
    scenarios.push({ day: today, hour: 12 + index, status: "Pendiente" });
  for (let index = 0; index < 2; index += 1)
    scenarios.push({ day: today, hour: 15 + index, status: "Anulada" });
  return scenarios.map((scenario, index) => ({
    ...scenario,
    combo: !scenario.loss && index % 6 === 0,
  }));
}

function writeGuide(info) {
  return [
    "# Ventas y ganancias: base de prueba",
    "",
    `Fecha de referencia (Argentina): ${info.today}. Datos ficticios en una base temporal independiente.`,
    `Base: ${info.databasePath}`,
    `Abrir: ${info.origin}/reportes`,
    "",
    `Incluye ${info.sales.length} ventas, 12 productos clasificados, 2 combos y la lista General desde 3, 6 y 12 unidades.`,
    "Hay ventas minoristas, mayoristas, combinadas, con efectivo, transferencia, QR y débito; una venta con descuento del 90 % para probar una pérdida, tres pendientes y dos anuladas.",
    "Las ganancias se calculan como venta menos costo de los productos entregados. Los movimientos y las asignaciones FIFO se generan con las operaciones del sistema.",
    "",
    "| Período | Ventas entregadas | Ventas | Costo | Ganancia |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...[
      ["Hoy", info.reports.today],
      ["Mes actual", info.reports.month],
      ["Seis meses", info.reports.months],
    ].map(
      ([label, report]) =>
        `| ${label} | ${report.summary.salesCount} | ${money(report.summary.revenueAmountCents)} | ${money(report.summary.costAmountCents)} | ${money(report.summary.profitAmountCents)} |`,
    ),
    "",
    "## Recorrido sugerido",
    "",
    "1. Dashboard: revisá Ganancia de hoy y seguí el enlace a Reportes.",
    "2. Usá las pestañas Ventas y Ganancias. En Ventas, probá el gráfico con Hoy por hora, Últimos 30 días, Últimos 90 días y Último año.",
    "3. En Ganancias, elegí Diario para ver una fila por cada día del período, Cortes de 10 días para comparar los cortes del mes, o Mensual para ver el balance del período. Elegir día, junto a Exportar, permite consultar una fecha con un clic y volver a todo el mes desde el calendario. Sin un rango indicado, se consulta desde el inicio del mes hasta hoy; el enlace del Dashboard consulta solamente hoy.",
    "4. En el detalle de ganancias, abrí Ver ventas y verificá sus costos y ganancias. Probá los CSV y la impresión.",
    "5. En Ventas, buscá los nombres marcados [DEMO]. Las pendientes y anuladas permiten comprobar su exclusión de ganancias.",
    "6. En Nueva venta, vendé productos de esta base y verificá que el dashboard y los reportes se actualicen.",
    "",
    "## Cortes de 10 días del mes actual",
    "",
    ...info.reports.cuts.buckets.map(
      (bucket) =>
        `- ${bucket.label}: ${money(bucket.profitAmountCents)} de ganancia (${bucket.salesCount} ventas).`,
    ),
    "",
    "## Casos para revisar en el historial",
    "",
    ...info.sales
      .filter(
        (sale) =>
          sale.profitAmountCents < 0 ||
          sale.status === "Anulada" ||
          sale.deliveryStatus === "Pendiente",
      )
      .map(
        (sale) =>
          `- Comprobante ${sale.number}: ${sale.status === "Anulada" ? "anulada" : sale.deliveryStatus === "Pendiente" ? "pendiente de entrega" : `venta con pérdida; venta ${money(sale.revenueAmountCents)}, costo ${money(sale.costAmountCents)}, ganancia ${money(sale.profitAmountCents)}`}.`,
      ),
    "",
    "Los importes de esta guía corresponden al estado inicial. Cambian al registrar operaciones de prueba.",
    "Cada ejecución del script crea otra base; no carga datos en una base existente ni sustituye la base de trabajo. Las fechas históricas se ajustan exclusivamente dentro de la base que el script acaba de generar.",
    "",
  ].join("\n");
}

async function createSalesDemo({ port = 0 } = {}) {
  const demo = await createStockDemo({ port });
  const { PrismaClient } = require(
    join(backend, "node_modules/@prisma/client"),
  );
  // El destino procede únicamente del generador de bases nuevas, nunca de un argumento o de DATABASE_URL.
  const prisma = new PrismaClient({
    datasources: {
      db: { url: `file:${demo.databasePath.replaceAll("\\", "/")}` },
    },
  });
  const request = async (path, body, method = "POST") => {
    const response = await fetch(`${demo.origin}${path}`, {
      method: body === undefined ? "GET" : method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(
        `${path}: HTTP ${response.status}: ${await response.text()}`,
      );
    return response.json();
  };
  try {
    assert.equal(
      await prisma.sale.count(),
      0,
      "La base recién creada debe estar sin ventas.",
    );
    const { businessToday } = require(
      join(backend, "dist/src/modules/collections/finance-rules.js"),
    );
    const today = businessToday();
    const scenarios = buildSalesScenarios(today);
    const firstMonth = `${scenarios[0].day.slice(0, 7)}-01`;
    const monthStart = `${today.slice(0, 7)}-01`;
    const firstInstant = new Date(`${firstMonth}T08:00:00-03:00`);
    // La API registra en la fecha actual. Este ajuste es exclusivo de la nueva demostración histórica.
    await prisma.$transaction([
      prisma.purchase.updateMany({
        data: {
          date: firstInstant,
          createdAt: firstInstant,
          paymentDate: firstMonth,
        },
      }),
      prisma.inventoryLot.updateMany({
        data: { receivedAt: firstInstant, createdAt: firstInstant },
      }),
      prisma.stockMovement.updateMany({ data: { createdAt: firstInstant } }),
      prisma.supplierPayable.updateMany({ data: { createdAt: firstInstant } }),
      prisma.supplierPayment.updateMany({
        data: { date: firstMonth, createdAt: firstInstant },
      }),
    ]);
    // Las compras a crédito no tienen fecha de pago; conservar esa distinción.
    await prisma.purchase.updateMany({
      where: { paymentCondition: "Credito" },
      data: { paymentDate: null },
    });
    const supplier = await prisma.supplier.findFirstOrThrow({
      where: { name: "[DEMO] Distribuidor de pods y accesorios" },
    });
    for (const [date, qty] of [
      [firstMonth, 40],
      [monthStart, 5],
    ]) {
      const purchase = await request("/api/purchases", {
        operationId: randomUUID(),
        supplierId: supplier.id,
        date,
        status: "Registrada",
        paymentCondition: "Pagada",
        paymentDate: date,
        items: demo.catalog.map((product) => ({
          productId: product.id,
          qty,
          unitCostAmountCents: product.costAmountCents,
        })),
      });
      const instant = new Date(`${date}T08:00:00-03:00`);
      await prisma.stockMovement.updateMany({
        where: { sourceType: "Purchase", sourceId: purchase.id },
        data: { createdAt: instant },
      });
    }
    const comboDefinitions = [
      {
        name: "[DEMO] Kit Pod Azul y Cartucho A",
        barcode: "DEMO-COMBO-01",
        indexes: [0, 4],
      },
      {
        name: "[DEMO] Kit Estuche y Cable",
        barcode: "DEMO-COMBO-02",
        indexes: [8, 9],
      },
    ];
    const combos = [];
    for (const definition of comboDefinitions) {
      combos.push(
        await request("/api/combos", {
          name: definition.name,
          barcode: definition.barcode,
          priceAmountCents: Math.round(
            definition.indexes.reduce(
              (sum, index) => sum + demo.catalog[index].priceAmountCents,
              0,
            ) * 0.9,
          ),
          items: definition.indexes.map((index) => ({
            productId: demo.catalog[index].id,
            qty: 1,
          })),
        }),
      );
    }
    const customers = [];
    for (const name of ["Ana Minorista", "Bruno Mayorista", "Carla Comercio"]) {
      customers.push(
        await request("/api/customers", { name: `[DEMO] ${name}` }),
      );
    }
    const coupon = await request("/api/coupons", {
      code: "DEMO-PERDIDA-90",
      discountType: "Percentage",
      discountBasisPoints: 9000,
    });
    const settings = await request("/api/settings");
    const payments = ["Efectivo", "Transferencia", "QR", "Tarjeta Debito"].map(
      (name) => {
        const payment = settings.paymentMethods.find(
          (method) => method.enabled && method.name === name,
        );
        assert.ok(payment, `Falta el medio ${name}.`);
        return payment;
      },
    );
    const costs = new Map(
      demo.catalog.map((product) => [product.id, product.costAmountCents]),
    );
    const sales = [];
    for (const [index, scenario] of scenarios.entries()) {
      const payment = payments[index % payments.length];
      const product = demo.catalog[index % demo.catalog.length];
      const items = scenario.combo
        ? [
            {
              itemType: "Combo",
              itemId: combos[Math.floor(index / 6) % combos.length].id,
              qty: 1 + (index % 2),
            },
          ]
        : [
            {
              productId: product.id,
              qty: scenario.loss ? 1 : [1, 2, 3, 6, 12][index % 5],
            },
          ];
      if (!scenario.combo && !scenario.loss && index % 4 === 2)
        items.push({
          productId: demo.catalog[(index + 5) % demo.catalog.length].id,
          qty: 1,
        });
      const payload = {
        operationId: randomUUID(),
        customerId: customers[index % customers.length].id,
        paymentTerms: "Immediate",
        paymentMethodId: payment.id,
        deliveryStatus:
          scenario.status === "Pendiente" ? "Pendiente" : "Entregado",
        items,
        ...(scenario.loss ? { couponCode: coupon.code } : {}),
      };
      const quote = await request("/api/sales/quote", payload);
      payload.expectedPricingFingerprint = quote.pricing.fingerprint;
      if (payment.cashHandling)
        payload.cashReceivedAmountCents =
          Math.ceil(quote.totalAmountCents / 100000) * 100000;
      const saved = await request("/api/sales", payload);
      const costAmountCents = saved.items.reduce(
        (sum, item) =>
          sum +
          (item.itemType === "Combo"
            ? item.components.reduce(
                (cost, component) =>
                  cost + component.qty * costs.get(component.productId),
                0,
              )
            : item.qty * costs.get(item.productId)),
        0,
      );
      if (scenario.status === "Anulada")
        await request(`/api/sales/${saved.id}/cancel`, {
          reason: "[DEMO] Anulación para verificar reportes.",
        });
      const date = new Date(
        `${scenario.day}T${String(scenario.hour).padStart(2, "0")}:30:00-03:00`,
      );
      const cancelledAt =
        scenario.status === "Anulada"
          ? new Date(date.getTime() + 300000)
          : null;
      await prisma.$transaction([
        prisma.sale.update({
          where: { id: saved.id },
          data: { date, createdAt: date, cancelledAt },
        }),
        prisma.stockMovement.updateMany({
          where: { sourceType: "Sale", sourceId: saved.id, reversalOfId: null },
          data: { createdAt: date },
        }),
        prisma.stockMovement.updateMany({
          where: {
            sourceType: "Sale",
            sourceId: saved.id,
            reversalOfId: { not: null },
          },
          data: { createdAt: cancelledAt ?? date },
        }),
        prisma.collection.updateMany({
          where: { saleId: saved.id },
          data: { date: scenario.day, createdAt: date },
        }),
        prisma.refund.updateMany({
          where: { saleId: saved.id },
          data: { date: scenario.day, createdAt: cancelledAt ?? date },
        }),
        prisma.financialOperation.updateMany({
          where: { operationId: payload.operationId },
          data: { createdAt: date },
        }),
      ]);
      sales.push({
        id: saved.id,
        number: saved.number,
        date: date.toISOString(),
        status: scenario.status === "Anulada" ? "Anulada" : "Confirmada",
        deliveryStatus: saved.deliveryStatus,
        combo: scenario.combo,
        countedUnits: saved.pricingSnapshot.countedUnits,
        revenueAmountCents: saved.totalAmountCents,
        costAmountCents,
        profitAmountCents: saved.totalAmountCents - costAmountCents,
      });
    }
    const tomorrow = new Date(`${today}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const report = (from, groupBy) =>
      request(
        `/api/reports/profit?${new URLSearchParams({ from: `${from}T00:00:00-03:00`, to: `${isoDay(tomorrow)}T00:00:00-03:00`, groupBy })}`,
      );
    const reports = {
      today: await report(today, "day"),
      month: await report(monthStart, "day"),
      cuts: await report(monthStart, "tenDays"),
      months: await report(firstMonth, "month"),
    };
    for (const result of Object.values(reports)) {
      const matching = sales.filter(
        (sale) =>
          sale.status === "Confirmada" &&
          sale.deliveryStatus === "Entregado" &&
          sale.date >= result.from &&
          sale.date < result.to,
      );
      assert.equal(result.summary.missingCostSalesCount, 0);
      assert.equal(result.summary.salesCount, matching.length);
      for (const field of [
        "revenueAmountCents",
        "costAmountCents",
        "profitAmountCents",
      ])
        assert.equal(
          result.summary[field],
          matching.reduce((sum, sale) => sum + sale[field], 0),
        );
    }
    const info = {
      ...demo,
      summary: await request("/api/stock/summary"),
      today,
      sales,
      reports,
      guidePath: join(demo.directory, "ventas-ganancias.md"),
    };
    writeFileSync(
      join(demo.directory, "ventas-ganancias.json"),
      JSON.stringify(info, null, 2) + "\n",
      "utf8",
    );
    writeFileSync(info.guidePath, writeGuide(info), "utf8");
    return info;
  } catch (error) {
    await demo.close();
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  if (process.argv.slice(2).includes("--help")) {
    console.log(
      "Node 24: node scripts/create-sales-demo.cjs [--serve] [--port 3005]\nCrea una base nueva con el catálogo clasificado y ventas de hoy, del mes y los cinco meses anteriores. Guarda una guía con resultados esperados. No modifica bases existentes.",
    );
    return;
  }
  const options = parseOptions(process.argv.slice(2));
  const demo = await createSalesDemo(options);
  console.log(
    JSON.stringify(
      {
        databasePath: demo.databasePath,
        guidePath: demo.guidePath,
        origin: demo.origin,
        sales: demo.sales.length,
        today: demo.reports.today.summary,
        month: demo.reports.month.summary,
        serving: options.serve,
      },
      null,
      2,
    ),
  );
  if (options.serve) {
    console.log(
      `\nBase de prueba lista: ${demo.origin}/reportes\nCtrl+C para detener esta instancia.`,
    );
    const stop = () => {
      void demo.close().catch(console.error);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } else await demo.close();
}

module.exports = { buildSalesScenarios, createSalesDemo };
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
