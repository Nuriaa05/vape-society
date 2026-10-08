const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const { basename, dirname, join, resolve } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");

const backend = resolve(__dirname, "../backend");

test("loads 20 categories and 100 products through the API, backs up existing data and preserves later edits on rerun", async () => {
  const { loadTestCatalog } = require("./load-test-catalog.cjs");
  const directory = mkdtempSync(join(tmpdir(), "vape-catalog-test-"));
  const databasePath = join(directory, "catalog.db");
  const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
  const backupDir = join(directory, "backups");
  const previousEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    BACKUP_DIR: process.env.BACKUP_DIR,
    NODE_ENV: process.env.NODE_ENV,
  };
  let app;
  let prisma;
  try {
    writeFileSync(databasePath, "");
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      BACKUP_DIR: backupDir,
      NODE_ENV: "test",
    });
    execFileSync(
      process.execPath,
      [
        join(backend, "node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
      ],
      {
        cwd: backend,
        env: process.env,
        stdio: "pipe",
        windowsHide: true,
        timeout: 60000,
      },
    );
    const { PrismaClient } = require(
      join(backend, "node_modules/@prisma/client"),
    );
    const { NestFactory } = require(join(backend, "node_modules/@nestjs/core"));
    const { ValidationPipe } = require(
      join(backend, "node_modules/@nestjs/common"),
    );
    const { AppModule } = require(join(backend, "dist/src/app.module.js"));
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.listen(0, "127.0.0.1");
    const origin = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const category = await prisma.category.create({
      data: {
        id: "existing-category",
        name: "Categoría existente",
        active: true,
      },
    });
    const existingProduct = await prisma.product.create({
      data: {
        id: "existing-product",
        name: "Producto existente",
        categoryId: category.id,
        barcode: "EXISTING",
        costAmountCents: 100,
        priceAmountCents: 150,
        marginPct: 50,
        physicalStock: 12,
        minStock: 2,
      },
    });

    const result = await loadTestCatalog(origin);
    assert.equal(result.createdCategories, 20);
    assert.equal(result.createdProducts, 100);
    assert.equal(result.existingProducts, 0);
    assert.ok(existsSync(result.backupPath));
    assert.equal(dirname(result.backupPath), backupDir);
    const backup = new DatabaseSync(result.backupPath, { readOnly: true });
    try {
      assert.equal(
        backup.prepare("SELECT COUNT(*) AS count FROM Category").get().count,
        1,
      );
      assert.equal(
        backup.prepare("SELECT COUNT(*) AS count FROM Product").get().count,
        1,
      );
      assert.equal(
        backup.prepare("PRAGMA integrity_check").get().integrity_check,
        "ok",
      );
    } finally {
      backup.close();
    }

    const categories = await prisma.category.findMany({
      where: { name: { startsWith: "[PRUEBA] " } },
      include: { products: true },
    });
    assert.equal(categories.length, 20);
    assert.ok(
      categories.every((row) => row.active && row.products.length === 5),
    );
    assert.ok(
      categories.some((row) => row.name === "[PRUEBA] Líquidos clásicos"),
    );
    const products = categories.flatMap((row) => row.products);
    assert.equal(new Set(products.map((row) => row.barcode)).size, 100);
    assert.equal(products.filter((row) => row.physicalStock === 0).length, 20);
    assert.equal(products.filter((row) => row.physicalStock === 3).length, 20);
    assert.equal(products.filter((row) => row.physicalStock === 5).length, 20);
    assert.equal(
      products.filter((row) => row.physicalStock > row.minStock).length,
      40,
    );
    assert.ok(
      products.every(
        (row) =>
          row.saleEnabled &&
          !row.archived &&
          row.name.startsWith("[PRUEBA] ") &&
          row.priceAmountCents ===
            Math.round((row.costAmountCents * (100 + row.marginPct)) / 100),
      ),
    );
    assert.equal(await prisma.stockMovement.count(), 80);
    assert.equal(await prisma.sale.count(), 0);
    assert.equal(await prisma.purchase.count(), 0);
    assert.deepEqual(
      await prisma.product.findUnique({ where: { id: existingProduct.id } }),
      existingProduct,
    );

    const editedProduct = await prisma.product.update({
      where: { barcode: "TEST-01-01" },
      data: { physicalStock: 17, priceAmountCents: 987654 },
    });
    const secondRun = await loadTestCatalog(origin);
    assert.equal(secondRun.createdCategories, 0);
    assert.equal(secondRun.createdProducts, 0);
    assert.equal(secondRun.existingProducts, 100);
    assert.equal(secondRun.backupPath, null);
    assert.equal(await prisma.category.count(), 21);
    assert.equal(await prisma.product.count(), 101);
    assert.equal(await prisma.stockMovement.count(), 80);
    assert.equal(await prisma.backupLog.count(), 1);
    assert.deepEqual(
      await prisma.product.findUnique({ where: { id: editedProduct.id } }),
      editedProduct,
    );

    await prisma.product.update({
      where: { id: editedProduct.id },
      data: { name: "Otro producto" },
    });
    await assert.rejects(loadTestCatalog(origin), /TEST-01-01.*otro producto/i);
    assert.equal(await prisma.category.count(), 21);
    assert.equal(await prisma.product.count(), 101);
    assert.equal(await prisma.backupLog.count(), 1);
  } finally {
    await prisma?.$disconnect();
    await app?.close();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const target = realpathSync(directory);
    assert.equal(dirname(target), realpathSync(tmpdir()));
    assert.ok(basename(target).startsWith("vape-catalog-test-"));
    rmSync(target, { recursive: true, force: true });
  }
});

test("stops before creating categories or products if the backup fails", async () => {
  const { loadTestCatalog } = require("./load-test-catalog.cjs");
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/health/ready")
      response.end(JSON.stringify({ status: "ready" }));
    else if (request.method === "GET") response.end("[]");
    else {
      response.statusCode = 500;
      response.end(JSON.stringify({ message: "Backup fallido" }));
    }
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    await assert.rejects(
      loadTestCatalog(`http://127.0.0.1:${server.address().port}`),
      /Backup fallido/,
    );
    assert.deepEqual(
      requests.filter((row) => row.startsWith("POST")),
      ["POST /api/backups"],
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
