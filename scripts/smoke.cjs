const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve, sep } = require("node:path");

const root = resolve(__dirname, "..");
const backend = join(root, "backend");
const evidence = join(root, ".verification");
const testDirectory = mkdtempSync(join(tmpdir(), "lozano-core-smoke-"));
const database = join(testDirectory, "smoke.db");
const databaseUrl = `file:${database.replaceAll("\\", "/")}`;
const { PrismaClient } = require(join(backend, "node_modules/@prisma/client"));
const { NestFactory } = require(join(backend, "node_modules/@nestjs/core"));
const { ValidationPipe } = require(
  join(backend, "node_modules/@nestjs/common"),
);
const { chromium } = require(join(root, "frontend/node_modules/playwright"));

async function main() {
  let app;
  let browser;
  let prisma;
  try {
    writeFileSync(database, "");
    const env = {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: "0",
      DATABASE_URL: databaseUrl,
      BACKUP_DIR: join(testDirectory, "backups"),
    };
    execFileSync(
      process.execPath,
      [
        join(backend, "node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
      ],
      { cwd: backend, env, stdio: "pipe" },
    );
    Object.assign(process.env, env);
    const { AppModule } = require(join(backend, "dist/src/app.module.js"));
    const { configureLocalFrontend } = require(
      join(backend, "dist/src/local-frontend.js"),
    );
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    configureLocalFrontend(app, join(root, "frontend/dist"));
    await app.listen(0, "127.0.0.1");
    const url = `http://127.0.0.1:${app.getHttpServer().address().port}`;
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    async function request(path, method = "GET", body) {
      const response = await fetch(url + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const value = await response.json();
      assert(
        response.ok,
        `${method} ${path}: ${response.status} ${JSON.stringify(value)}`,
      );
      return value;
    }
    const ready = await request("/health/ready");
    assert.deepEqual(ready.counts, {
      products: 0,
      combos: 0,
      sales: 0,
      purchases: 0,
    });
    assert.equal((await request("/api/settings")).categories.length, 0);
    const basePaymentMethods = (await request("/api/settings")).paymentMethods;
    assert.equal(basePaymentMethods.length, 6);
    assert.equal(
      basePaymentMethods.find((method) => method.id === "pm1").cashHandling,
      true,
    );
    assert.equal(
      basePaymentMethods.find((method) => method.id === "pm5")
        .surchargeBasisPoints,
      250,
    );
    const tables = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    assert(!tables.some((table) => /Ingredient|Recipe/.test(table.name)));
    assert.equal((await fetch(url + "/api/costs/ingredients")).status, 404);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    const pageErrors = [];
    const apiErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("/api/") && response.status() >= 400)
        apiErrors.push(`${response.status()} ${response.url()}`);
    });
    const routes = [
      "/",
      "/productos",
      "/combos",
      "/nueva-venta",
      "/ventas",
      "/compras",
      "/stock",
      "/proveedores",
      "/historial",
      "/reportes",
      "/configuracion",
    ];
    for (const route of routes) {
      await page.goto(url + route);
      await page.waitForLoadState("networkidle");
      assert.equal(await page.locator("h1").count(), 1, route);
      assert.equal(
        await page
          .locator("aside button")
          .filter({ hasText: /^Costos$/ })
          .count(),
        0,
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `Horizontal overflow: ${route}`,
      );
    }

    const category = await request("/api/settings/categories", "POST", {
      name: "Perfumes",
    });
    const supplier = await request("/api/suppliers", "POST", {
      name: "Distribuidor de prueba",
      phone: "123456789",
      email: "prueba@example.invalid",
    });
    const product = await request("/api/products", "POST", {
      name: "Perfume de prueba 100 ml",
      barcode: "7791234000011",
      categoryId: category.id,
      supplierId: supplier.id,
      costAmountCents: 100000,
      priceAmountCents: 150000,
      marginPct: 50,
      physicalStock: 0,
      minStock: 2,
    });
    await request("/api/purchases", "POST", {
      supplierId: supplier.id,
      status: "Registrada",
      items: [{ productId: product.id, qty: 20, unitCostAmountCents: 100000 }],
    });
    const sale = await request("/api/sales", "POST", {
      paymentMethodId: "pm1",
      cashReceivedAmountCents: 300000,
      deliveryStatus: "Pendiente",
      items: [{ productId: product.id, qty: 2 }],
    });
    let stock = (await request("/api/stock"))[0];
    assert.equal(stock.physicalStock, 20);
    assert.equal(stock.reservedStock, 2);
    assert.equal(stock.availableStock, 18);
    await request(`/api/sales/${sale.id}/deliver`, "PATCH");
    await request("/api/settings/payment-methods/pm1", "PATCH", {
      name: "Cash",
    });
    assert.equal(
      (await request(`/api/sales/${sale.id}/receipt`)).sale.payment,
      "Efectivo",
    );
    await request(`/api/sales/${sale.id}/cancel`, "POST", {
      reason: "Anulación de prueba",
    });
    stock = (await request("/api/stock"))[0];
    assert.equal(stock.physicalStock, 20);
    assert.equal(stock.reservedStock, 0);
    const backup = await request("/api/backups", "POST", {});
    assert.equal(backup.status, "Ok");

    await page.goto(url + "/configuracion");
    await page.waitForLoadState("networkidle");
    const paymentToggle = page.getByRole("button", {
      name: "Mostrar",
      exact: true,
    });
    assert.equal(await paymentToggle.getAttribute("aria-expanded"), "false");
    await paymentToggle.click();
    assert.equal(
      await page.locator("#payment-surcharge-pm5").inputValue(),
      "2,5",
    );
    await page
      .getByRole("button", { name: "Nuevo cupón", exact: true })
      .click();
    await page.getByPlaceholder("Ej. VERANO10").fill("core10");
    await page.getByPlaceholder("Ej. 10", { exact: true }).fill("10");
    await Promise.all([
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/coupons" &&
          response.request().method() === "POST" &&
          response.status() === 201,
      ),
      page.getByRole("button", { name: "Guardar cupón", exact: true }).click(),
    ]);
    assert.equal((await request("/api/coupons"))[0].code, "CORE10");

    async function createSaleThroughUi({ payment, coupon, cash }) {
      await page.goto(url + "/nueva-venta");
      await page.waitForLoadState("networkidle");
      await page
        .getByPlaceholder("Buscar producto o combo por nombre...")
        .fill(product.name);
      await page
        .getByRole("button", { name: new RegExp(product.name) })
        .click();
      await page.getByRole("button", { name: payment, exact: true }).click();
      if (coupon) {
        await page
          .getByLabel("Cupón de descuento", { exact: true })
          .fill(coupon);
        await page
          .getByRole("button", { name: "Aplicar", exact: true })
          .click();
      }
      if (cash)
        await page.getByLabel("Dinero recibido", { exact: true }).fill(cash);
      await page.waitForLoadState("networkidle");
      const [response] = await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/sales" &&
            response.request().method() === "POST" &&
            response.status() === 201,
        ),
        page
          .getByRole("button", { name: "Confirmar venta", exact: true })
          .click(),
      ]);
      return response.json();
    }

    const cardSale = await createSaleThroughUi({
      payment: "Tarjeta Debito",
      coupon: "CORE10",
    });
    assert.equal(cardSale.subtotalAmountCents, 150000);
    assert.equal(cardSale.discountAmountCents, 15000);
    assert.equal(cardSale.surchargeAmountCents, 3375);
    assert.equal(cardSale.totalAmountCents, 138375);
    assert((await page.getByText("Cupón CORE10", { exact: true }).count()) > 0);
    const cashSale = await createSaleThroughUi({
      payment: "Cash",
      cash: "2000",
    });
    assert.equal(cashSale.cashReceivedAmountCents, 200000);
    assert.equal(cashSale.changeAmountCents, 50000);
    assert((await page.getByText("Vuelto", { exact: true }).count()) > 0);

    const topProducts = await request(
      "/api/reports/top-products?range=all&sort=quantity",
    );
    assert.equal(topProducts[0].name, product.name);
    assert.equal(topProducts[0].qty, 2);
    const consumption = await request(
      "/api/reports/product-consumption?range=all",
    );
    assert.equal(consumption[0].totalQty, 2);
    const exportSales = await request("/api/reports/sales?range=all");
    assert.equal(exportSales.length, 2);
    for (const period of ["week", "month"]) {
      const series = await request(
        `/api/reports/units-series?period=${period}`,
      );
      assert.equal(
        series.points.reduce((sum, point) => sum + point.units, 0),
        2,
      );
    }
    await page.goto(url + "/");
    await page.waitForLoadState("networkidle");
    const unitsChart = page.getByRole("region", {
      name: "Unidades vendidas",
      exact: true,
    });
    const dailyBars = unitsChart
      .getByRole("group", { name: "Unidades por día", exact: true })
      .getByRole("button");
    assert.equal(await dailyBars.count(), 7);
    assert(
      (await dailyBars.last().getAttribute("aria-label")).endsWith(
        ": 2 unidades",
      ),
    );
    assert.equal(await dailyBars.last().getAttribute("aria-pressed"), "true");
    await dailyBars.first().focus();
    assert.equal(await dailyBars.first().getAttribute("aria-pressed"), "true");
    await dailyBars.last().click();
    assert.equal(await dailyBars.last().getAttribute("aria-pressed"), "true");
    await unitsChart
      .getByRole("button", { name: "Mensual", exact: true })
      .click();
    const monthlyBars = unitsChart
      .getByRole("group", { name: "Unidades por mes", exact: true })
      .getByRole("button");
    await monthlyBars.last().waitFor();
    assert(
      (await monthlyBars.last().getAttribute("aria-label")).endsWith(
        ": 2 unidades",
      ),
    );
    await page.screenshot({
      path: join(evidence, "dashboard-units-smoke.png"),
      fullPage: true,
    });
    await page.goto(url + "/reportes");
    await page.waitForLoadState("networkidle");
    assert((await page.getByText(product.name, { exact: true }).count()) > 0);
    await page.screenshot({
      path: join(evidence, "reports-main.png"),
      fullPage: true,
    });
    for (const testSale of [cardSale, cashSale]) {
      await request(`/api/sales/${testSale.id}/cancel`, "POST", {
        reason: "Anulación de prueba de interfaz",
      });
    }
    assert.equal((await request("/api/stock"))[0].physicalStock, 20);
    await page.goto(url + "/");
    await page
      .getByText("Sin unidades vendidas en este período.", { exact: true })
      .waitFor();
    assert.equal(
      (await request("/api/reports/units-series?period=week")).points.reduce(
        (sum, point) => sum + point.units,
        0,
      ),
      0,
    );
    await page.goto(url + "/historial");
    await page.waitForLoadState("networkidle");
    await page
      .getByPlaceholder("Buscar comprobante, producto o detalle")
      .fill(cardSale.number);
    await page
      .getByText(`Venta ${cardSale.number} anulada`, { exact: true })
      .waitFor();
    assert.equal(
      await page.getByText(`Venta ${cardSale.number}`, { exact: true }).count(),
      1,
    );

    await prisma.sale.createMany({
      data: Array.from({ length: 600 }, (_, index) => ({
        id: `history-${index}`,
        number: `TEST-${index}`,
        date: new Date(Date.now() - index * 1000),
        deliveryStatus: "Entregado",
        status: "Confirmada",
        paymentMethodId: "pm1",
        paymentMethodName: "Cash",
        subtotalAmountCents: 100,
        totalAmountCents: 100,
      })),
    });
    const historyRequests = [];
    page.on("request", (request) => {
      const parsed = new URL(request.url());
      if (parsed.pathname === "/api/sales" && parsed.searchParams.has("take"))
        historyRequests.push({
          take: Number(parsed.searchParams.get("take")),
          skip: Number(parsed.searchParams.get("skip") ?? 0),
        });
    });
    await page.goto(url + "/ventas");
    for (const loaded of [200, 400, 600]) {
      const button = page.getByRole("button", {
        name: `Cargar ventas anteriores (${loaded} cargadas)`,
      });
      await button.waitFor();
      await button.click();
    }
    await page.waitForLoadState("networkidle");
    assert(historyRequests.every((request) => request.take === 200));
    assert.deepEqual(
      historyRequests.map((request) => request.skip),
      [0, 200, 400, 600],
    );
    assert.equal(
      await page
        .getByRole("button", { name: /Cargar ventas anteriores/ })
        .count(),
      0,
    );

    await page.setViewportSize({ width: 1280, height: 480 });
    const scrollChecks = [];
    for (const route of routes) {
      await page.goto(url + route);
      await page.waitForLoadState("networkidle");
      await page.mouse.move(1150, 120);
      await page.mouse.wheel(0, 10000);
      await page.waitForFunction(() => {
        const scroll = document.scrollingElement;
        return (
          Math.abs(
            scroll.scrollTop - (scroll.scrollHeight - scroll.clientHeight),
          ) <= 1
        );
      });
      const dimensions = await page.evaluate(() => ({
        top: document.scrollingElement.scrollTop,
        maximum:
          document.scrollingElement.scrollHeight -
          document.scrollingElement.clientHeight,
        horizontal: document.documentElement.scrollWidth > window.innerWidth,
      }));
      assert(!dimensions.horizontal, `Horizontal overflow: ${route}`);
      assert(
        Math.abs(dimensions.top - dimensions.maximum) <= 1,
        `Cannot reach page bottom: ${route}`,
      );
      scrollChecks.push({ route, ...dimensions });
    }
    const sidebar = page.locator("aside").first();
    const pageScrollBeforeSidebar = await page.evaluate(() => scrollY);
    await page.mouse.move(100, 200);
    await page.mouse.wheel(0, 10000);
    await page.waitForFunction(() => {
      const element = document.querySelector("aside");
      return (
        element.scrollTop + element.clientHeight >= element.scrollHeight - 1
      );
    });
    const sidebarDimensions = await sidebar.evaluate((element) => ({
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
      top: element.scrollTop,
    }));
    assert(sidebarDimensions.scrollHeight > sidebarDimensions.height);
    assert.equal(await page.evaluate(() => scrollY), pageScrollBeforeSidebar);
    await sidebar
      .getByRole("button", { name: "Configuración", exact: true })
      .click();
    await prisma.category.createMany({
      data: Array.from({ length: 30 }, (_, index) => ({
        id: `scroll-category-${index}`,
        name: `Categoria scroll ${String(index).padStart(2, "0")}`,
      })),
    });
    await page.goto(url + "/productos");
    await page.waitForLoadState("networkidle");
    await page.getByRole("combobox").filter({ hasText: "Todas" }).click();
    const listbox = page.getByRole("listbox");
    const selectDimensions = await listbox
      .locator("[data-radix-select-viewport]")
      .evaluate((element) => ({
        height: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
    assert(selectDimensions.height <= 480);
    assert(selectDimensions.scrollHeight > selectDimensions.height);
    await page.keyboard.press("End");
    await page.getByRole("option", { name: "Perfumes", exact: true }).click();
    await page
      .getByRole("button", { name: "Nuevo producto", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const dialogDimensions = await dialog.evaluate((element) => ({
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    assert(dialogDimensions.height <= 450);
    assert(dialogDimensions.scrollHeight > dialogDimensions.height);
    await dialog
      .getByRole("button", { name: "Guardar producto", exact: true })
      .scrollIntoViewIfNeeded();
    assert(await dialog.evaluate((element) => element.scrollTop > 0));
    await page.keyboard.press("Escape");
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(apiErrors, []);
    mkdirSync(evidence, { recursive: true });
    const result = {
      success: true,
      routes: routes.length,
      emptyDatabase: ready.counts,
      historicalRecords: 603,
      historyRequests,
      purchaseSaleStockCancellationBackup: "passed",
      couponCardCashChangeHistoryReportsUi: "passed",
      dashboardWeeklyMonthlyUnitsKeyboardCancellationUi: "passed",
      scrollChecks,
      sidebarDimensions,
      selectDimensions,
      dialogDimensions,
      pageErrors,
      apiErrors,
    };
    writeFileSync(
      join(evidence, "smoke.json"),
      JSON.stringify(result, null, 2) + "\n",
      "utf8",
    );
    console.log(JSON.stringify(result));
  } finally {
    await browser?.close();
    await app?.close();
    await prisma?.$disconnect();
    const resolved = resolve(testDirectory);
    if (
      !resolved.startsWith(resolve(tmpdir()) + sep) ||
      !resolved.includes("lozano-core-smoke-")
    )
      throw new Error("Unsafe test cleanup path");
    rmSync(resolved, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
