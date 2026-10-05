const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const root = path.resolve(__dirname, "..");
const databasePath = path.join(root, "backend/prisma/core.db");
const manifestPath = path.join(root, ".verification/test-data-100.json");
const origin = "http://127.0.0.1:3002";
const count = 100;

function snapshotDatabase() {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all();
    return Object.fromEntries(
      tables.map(({ name }) => [
        name,
        database
          .prepare(
            `SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`,
          )
          .all(),
      ]),
    );
  } finally {
    database.close();
  }
}

async function request(endpoint, method = "GET", body) {
  const response = await fetch(origin + endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(
      `${method} ${endpoint}: ${response.status} ${JSON.stringify(result)}`,
    );
  }
  return result;
}

function save(manifest) {
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
}

async function main() {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  if (fs.existsSync(manifestPath)) {
    const previous = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (previous.status === "completed") {
      console.log("Esta carga ya se ejecutó. No se agregaron duplicados.");
      console.log(JSON.stringify(previous.result));
      return;
    }
    throw new Error(
      `Existe una carga incompleta. Revisar sus registros antes de repetir: ${manifestPath}`,
    );
  }

  const before = snapshotDatabase();
  const ready = await request("/health/ready");
  assert.equal(ready.service, "retail-core-backend");
  assert.equal(ready.counts.products, before.Product.length);
  assert.equal(ready.counts.sales, before.Sale.length);
  const settings = await request("/api/settings");
  const categories = settings.categories.filter((category) => category.active);
  const payments = settings.paymentMethods.filter((payment) => payment.enabled);
  assert(categories.length > 0, "Debe existir una categoría activa.");
  assert(payments.length > 0, "Debe existir un medio de pago activo.");

  const backup = await request("/api/backups", "POST", {});
  assert.equal(backup.status, "Ok");
  const backupPath = path.join(
    root,
    "backend/backups",
    path.basename(backup.filename),
  );
  assert(
    fs.statSync(backupPath).size > 0,
    "El respaldo previo no está disponible.",
  );
  const runId = new Date().toISOString().replace(/\D/g, "");
  const manifest = {
    runId,
    status: "loading",
    startedAt: new Date().toISOString(),
    databasePath,
    backupPath,
    before,
    products: [],
    sales: [],
  };
  save(manifest);
  console.log(`Respaldo previo: ${backupPath}`);

  try {
    for (let index = 0; index < count; index++) {
      const category = categories[index % categories.length];
      const number = String(index + 1).padStart(3, "0");
      const perfume = /perfum|fragancia/i.test(category.name);
      const qty = 1 + (index % 4);
      const costAmountCents =
        (perfume ? 1600000 : 800000) + (index % 10) * 100000;
      const physicalStock =
        index % 10 === 0
          ? qty
          : index % 10 === 1
            ? qty + 2
            : 30 + (index % 8) * 5;
      const product = await request("/api/products", "POST", {
        name: `[PRUEBA] ${perfume ? "Perfume" : "Pod"} ${number} - ${perfume ? `${[30, 50, 100][index % 3]} ml` : `Sabor ${1 + (index % 10)}`}`,
        barcode: `TEST-${runId}-${number}`,
        categoryId: category.id,
        costAmountCents,
        priceAmountCents: costAmountCents * 1.5,
        marginPct: 50,
        physicalStock,
        minStock: 5,
      });
      manifest.products.push({
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        initialStock: physicalStock,
      });
      save(manifest);
      if ((index + 1) % 25 === 0)
        console.log(`Productos: ${index + 1}/${count}`);
    }

    for (let index = 0; index < count; index++) {
      const payment = payments[index % payments.length];
      const qty = 1 + (index % 4);
      const payload = {
        paymentMethodId: payment.id,
        deliveryStatus: index % 5 === 0 ? "Pendiente" : "Entregado",
        items: [{ productId: manifest.products[index].id, qty }],
      };
      if (payment.cashHandling) {
        const quote = await request("/api/sales/quote", "POST", payload);
        payload.cashReceivedAmountCents =
          Math.ceil(quote.totalAmountCents / 100000) * 100000;
      }
      const sale = await request("/api/sales", "POST", payload);
      assert.equal(sale.status, "Confirmada");
      manifest.sales.push({
        id: sale.id,
        number: sale.number,
        productId: manifest.products[index].id,
        qty,
        deliveryStatus: sale.deliveryStatus,
        totalAmountCents: sale.totalAmountCents,
      });
      save(manifest);
      if ((index + 1) % 25 === 0) console.log(`Ventas: ${index + 1}/${count}`);
    }

    const after = snapshotDatabase();
    const productIds = new Set(manifest.products.map((product) => product.id));
    const saleIds = new Set(manifest.sales.map((sale) => sale.id));
    assert.equal(
      after.Product.filter((product) => productIds.has(product.id)).length,
      count,
    );
    assert.equal(
      after.Sale.filter((sale) => saleIds.has(sale.id)).length,
      count,
    );
    for (const sale of manifest.sales) {
      const product = after.Product.find(
        (product) => product.id === sale.productId,
      );
      const initial = manifest.products.find(
        (product) => product.id === sale.productId,
      );
      assert.equal(
        product.physicalStock,
        initial.initialStock -
          (sale.deliveryStatus === "Entregado" ? sale.qty : 0),
      );
      assert.equal(
        after.SaleItem.filter((item) => item.saleId === sale.id).reduce(
          (sum, item) => sum + item.qty,
          0,
        ),
        sale.qty,
      );
    }
    const changedExistingRecords = [];
    for (const [table, rows] of Object.entries(before)) {
      if (table === "Counter") continue;
      const current = new Map(
        after[table].map((row) => [row.id ?? row.migration_name, row]),
      );
      for (const row of rows) {
        if (
          JSON.stringify(current.get(row.id ?? row.migration_name)) !==
          JSON.stringify(row)
        )
          changedExistingRecords.push({
            table,
            id: row.id ?? row.migration_name,
          });
      }
    }
    const stock = await request("/api/stock");
    for (const sale of manifest.sales) {
      const product = stock.find(
        (product) => product.productId === sale.productId,
      );
      assert.equal(
        product.reservedStock,
        sale.deliveryStatus === "Pendiente" ? sale.qty : 0,
      );
      assert(product.availableStock >= 0);
    }
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(
        database.prepare("PRAGMA integrity_check").get().integrity_check,
        "ok",
      );
    } finally {
      database.close();
    }
    manifest.status = "completed";
    manifest.result = {
      addedProducts: count,
      addedSales: count,
      delivered: manifest.sales.filter(
        (sale) => sale.deliveryStatus === "Entregado",
      ).length,
      pending: manifest.sales.filter(
        (sale) => sale.deliveryStatus === "Pendiente",
      ).length,
      soldUnits: manifest.sales.reduce((sum, sale) => sum + sale.qty, 0),
      totalProducts: after.Product.length,
      totalSales: after.Sale.length,
      changedExistingRecords,
      backupPath,
      manifestPath,
    };
    manifest.completedAt = new Date().toISOString();
    save(manifest);
    console.log(JSON.stringify(manifest.result));
  } catch (error) {
    manifest.status = "incomplete";
    manifest.error = error.message;
    save(manifest);
    throw error;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
