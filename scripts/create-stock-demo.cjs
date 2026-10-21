const { execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { existsSync, mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const backend = join(root, "backend");
const frontendDist = join(root, "frontend/dist");

function validatePort(port) {
  if (
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535 ||
    [3002, 43120].includes(port)
  ) {
    throw new Error(
      "Usá un puerto libre distinto de 3002 y 43120; 0 elige uno automáticamente.",
    );
  }
}

function parseOptions(args) {
  const options = { serve: false, port: 0 };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--serve") options.serve = true;
    else if (args[index] === "--port" && /^\d+$/.test(args[index + 1] ?? "")) {
      options.port = Number(args[++index]);
    } else {
      throw new Error(
        `Argumento no admitido: ${args[index]}. Usá --help para ver las opciones.`,
      );
    }
  }
  validatePort(options.port);
  return options;
}

function makeCatalog() {
  const groups = [
    {
      category: "Pods",
      names: ["Pod Azul", "Pod Verde", "Pod Negro", "Pod Rojo"],
      costs: [100000, 125000, 150000, 175000],
    },
    {
      category: "Cartuchos",
      names: ["Cartucho A", "Cartucho B", "Cartucho C", "Cartucho D"],
      costs: [40000, 50000, 60000, 70000],
    },
    {
      category: "Accesorios",
      names: ["Estuche", "Cable USB", "Boquilla", "Kit de limpieza"],
      costs: [20000, 30000, 40000, 50000],
    },
  ];
  return groups.flatMap((group, groupIndex) =>
    group.names.map((name, index) => ({
      name: `[DEMO] ${name}`,
      barcode: `DEMO-${String(groupIndex * 4 + index + 1).padStart(3, "0")}`,
      category: `[DEMO] ${group.category}`,
      costAmountCents: group.costs[index],
      priceAmountCents: group.costs[index] * 2,
      paidQty: groupIndex === 0 ? 10 : groupIndex === 1 ? 0 : 8,
      creditQty: groupIndex === 0 ? 0 : groupIndex === 1 ? 12 : 7,
    })),
  );
}

function dateAfter(date, days) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function priceListDocument(catalog, summary) {
  const money = (cents) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 2,
    }).format(cents / 100);
  return [
    "# Base de prueba de stock y precios mayoristas",
    "",
    "Datos ficticios. La lista General usa la cantidad combinada de cualquier producto de esta venta.",
    "Desde 3 unidades: 10 % menos que el precio habitual. Desde 6: 15 %. Desde 12: 20 %.",
    "La valuación mayorista del inventario usa siempre General, desde 3 unidades.",
    "",
    "| Código | Producto | Propio (unidades) | A crédito (unidades) | Minorista | Desde 3 | Desde 6 | Desde 12 |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...catalog.map(
      (product) =>
        `| ${product.barcode} | ${product.name} | ${product.paidQty} | ${product.creditQty} | ${money(product.priceAmountCents)} | ${money(Math.round(product.priceAmountCents * 0.9))} | ${money(Math.round(product.priceAmountCents * 0.85))} | ${money(Math.round(product.priceAmountCents * 0.8))} |`,
    ),
    "",
    "## Valores iniciales de las tarjetas",
    "",
    `- Valor stock al costo: ${money(summary.totalValueCents)}.`,
    `- Valor minorista: ${money(summary.retailValueCents)}.`,
    `- Valor mayorista: ${money(summary.wholesaleValueCents)}.`,
    `- Stock propio (valor minorista menos deuda): ${money(summary.netRetailValueCents)}.`,
    `- Deuda: ${money(summary.supplierDebtCents)}.`,
    "",
    "## Recorrido sugerido",
    "",
    "1. En Stock, revisá productos pagados, a crédito y mixtos. Ninguna unidad tiene el pago sin indicar.",
    "2. En Productos > Listas de precios, elegí General y revisá las tres escalas.",
    "3. En Nueva venta, agregá un Pod Azul y dos Cartucho A: las 3 unidades combinadas habilitan la primera escala.",
    "4. Aumentá la cantidad combinada a 6 y a 12 para ver los siguientes precios.",
    "5. En Proveedores, abrí la cuenta del distribuidor de cartuchos y registrá su pago completo. Las unidades que sigan en stock pasarán a Propio, bajará Deuda y aumentará Stock propio.",
    "",
    "Las columnas Propio y A crédito del inventario muestran unidades y costos de sus ingresos. La tarjeta Stock propio usa la fórmula acordada de valor minorista menos deuda.",
    "Esta base empieza sin ventas, reservas ni saldos de clientes. Cada ejecución del script crea otra base independiente.",
    "",
  ].join("\n");
}

async function createStockDemo({ port = 0 } = {}) {
  validatePort(port);
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 24 || minor < 15)
    throw new Error(
      "Este script requiere Node 24.15 o posterior dentro de Node 24.",
    );
  const requiredFiles = [
    join(backend, "node_modules/prisma/build/index.js"),
    join(backend, "dist/src/app.module.js"),
    join(frontendDist, "index.html"),
  ];
  if (requiredFiles.some((path) => !existsSync(path))) {
    throw new Error(
      "Faltan dependencias o compilaciones. Ejecutá npm run build antes de crear la base de prueba.",
    );
  }

  // No se admite una ruta de destino ni una API existente: siempre es una base nueva.
  const directory = mkdtempSync(join(tmpdir(), "vape-stock-demo-"));
  const databasePath = join(directory, "core.db");
  writeFileSync(databasePath, "", { flag: "wx" });
  const environment = {
    DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}`,
    BACKUP_DIR: join(directory, "backups"),
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: String(port),
    FRONTEND_DIST_DIR: frontendDist,
  };
  const previousEnv = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);
  let app;
  const close = async () => {
    try {
      await app?.close();
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };
  try {
    execFileSync(process.execPath, [requiredFiles[0], "migrate", "deploy"], {
      cwd: backend,
      env: process.env,
      stdio: "pipe",
      windowsHide: true,
      timeout: 60000,
    });
    require(join(backend, "node_modules/reflect-metadata"));
    const { NestFactory } = require(join(backend, "node_modules/@nestjs/core"));
    const { ValidationPipe } = require(
      join(backend, "node_modules/@nestjs/common"),
    );
    const { AppModule } = require(requiredFiles[1]);
    const { configureLocalFrontend } = require(
      join(backend, "dist/src/local-frontend.js"),
    );
    const { businessToday } = require(
      join(backend, "dist/src/modules/collections/finance-rules.js"),
    );
    app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    configureLocalFrontend(app, frontendDist);
    await app.listen(port, "127.0.0.1");
    const origin = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    const request = async (path, body, method = "POST") => {
      const response = await fetch(`${origin}${path}`, {
        method: body === undefined ? "GET" : method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          `${path}: HTTP ${response.status}: ${await response.text()}`,
        );
      return response.json();
    };
    if ((await request("/api/products?includeArchived=true")).length !== 0) {
      throw new Error(
        "La base de prueba debe estar vacía antes de cargar el catálogo.",
      );
    }
    await request(
      "/api/settings/business",
      { name: "Vape Society · BASE DE PRUEBA" },
      "PATCH",
    );
    const paidSupplier = await request("/api/suppliers", {
      name: "[DEMO] Distribuidor de pods y accesorios",
      phone: "0000000000",
    });
    const creditSupplier = await request("/api/suppliers", {
      name: "[DEMO] Distribuidor de cartuchos",
      phone: "0000000000",
    });
    const catalog = makeCatalog();
    const categories = new Map();
    for (const product of catalog) {
      if (!categories.has(product.category)) {
        categories.set(
          product.category,
          await request("/api/settings/categories", { name: product.category }),
        );
      }
      const created = await request("/api/products", {
        name: product.name,
        barcode: product.barcode,
        categoryId: categories.get(product.category).id,
        supplierId: product.paidQty === 0 ? creditSupplier.id : paidSupplier.id,
        costAmountCents: product.costAmountCents,
        priceAmountCents: product.priceAmountCents,
        marginPct: 100,
        physicalStock: 0,
        minStock: 3,
      });
      product.id = created.id;
    }
    const today = businessToday();
    const purchaseItems = (products, key) =>
      products
        .filter((product) => product[key] > 0)
        .map((product) => ({
          productId: product.id,
          qty: product[key],
          unitCostAmountCents: product.costAmountCents,
        }));
    await request("/api/purchases", {
      operationId: randomUUID(),
      supplierId: paidSupplier.id,
      date: today,
      status: "Registrada",
      paymentCondition: "Pagada",
      paymentDate: today,
      items: purchaseItems(catalog, "paidQty"),
    });
    await request("/api/purchases", {
      operationId: randomUUID(),
      supplierId: creditSupplier.id,
      date: today,
      status: "Registrada",
      paymentCondition: "Credito",
      dueDate: dateAfter(today, 7),
      items: purchaseItems(catalog.slice(4, 8), "creditQty"),
    });
    await request("/api/purchases", {
      operationId: randomUUID(),
      supplierId: paidSupplier.id,
      date: today,
      status: "Registrada",
      paymentCondition: "Credito",
      dueDate: dateAfter(today, 40),
      items: purchaseItems(catalog.slice(8), "creditQty"),
    });
    await request(
      "/api/price-lists/general",
      {
        tiers: [
          [3, 90],
          [6, 85],
          [12, 80],
        ].map(([minimumQty, percent]) => ({
          minimumQty,
          prices: catalog.map((product) => ({
            itemType: "Product",
            itemId: product.id,
            priceAmountCents: Math.round(
              (product.priceAmountCents * percent) / 100,
            ),
          })),
        })),
      },
      "PATCH",
    );
    const summary = await request("/api/stock/summary");
    const priceListPath = join(directory, "lista-mayorista.md");
    writeFileSync(priceListPath, priceListDocument(catalog, summary), "utf8");
    const info = {
      directory,
      databasePath,
      origin,
      priceListPath,
      createdAt: new Date().toISOString(),
      catalog,
      summary,
    };
    writeFileSync(
      join(directory, "demo.json"),
      JSON.stringify(info, null, 2) + "\n",
      "utf8",
    );
    return { ...info, close };
  } catch (error) {
    await close();
    throw new Error(
      `No se pudo preparar la base de prueba (${directory}): ${error.message}`,
      { cause: error },
    );
  }
}

async function main() {
  if (process.argv.slice(2).includes("--help")) {
    console.log(
      "Node 24: node scripts/create-stock-demo.cjs [--serve] [--port 3003]\nCrea una base nueva en una carpeta temporal, con 12 productos clasificados y General desde 3, 6 y 12 unidades.\n--serve mantiene abierta la app de prueba; Ctrl+C la detiene. No modifica la base de trabajo.",
    );
    return;
  }
  const options = parseOptions(process.argv.slice(2));
  const demo = await createStockDemo(options);
  console.log(
    JSON.stringify(
      {
        databasePath: demo.databasePath,
        priceListPath: demo.priceListPath,
        origin: demo.origin,
        products: demo.catalog.length,
        summary: demo.summary,
        serving: options.serve,
      },
      null,
      2,
    ),
  );
  if (options.serve) {
    console.log(
      `\nBase de prueba lista: ${demo.origin}/stock\nCtrl+C para detener esta instancia.`,
    );
    const stop = () => {
      void demo.close().catch(console.error);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } else {
    await demo.close();
  }
}

module.exports = { createStockDemo, parseOptions };
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
