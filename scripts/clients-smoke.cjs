const assert = require("node:assert/strict");
const { mkdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

module.exports = async function clientsSmoke({
  page,
  url,
  request,
  prisma,
  category,
  supplier,
  evidence,
}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const product = await request("/api/products", "POST", {
    name: "Vape cuotas humo",
    barcode: "7791234000028",
    categoryId: category.id,
    supplierId: supplier.id,
    costAmountCents: 100000,
    priceAmountCents: 150000,
    marginPct: 50,
    physicalStock: 20,
    minStock: 1,
  });
  const responseFor = (path) =>
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === path &&
        response.request().method() === "POST" &&
        response.ok(),
    );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url + "/clientes-cobranzas");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("heading", { name: "Clientes y cuotas", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("table").count(), 0);
  assert.equal(
    await page.getByRole("tab", { name: "Cobranzas", exact: true }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "Nuevo cliente", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Nombre", { exact: true })
    .fill("Cliente cuotas humo");
  await page
    .getByRole("dialog")
    .getByLabel("Teléfono", { exact: true })
    .fill("110001122");
  const [customerResponse] = await Promise.all([
    responseFor("/api/customers"),
    page.getByRole("button", { name: "Guardar cliente", exact: true }).click(),
  ]);
  const customer = await customerResponse.json();
  const customerRow = () =>
    page
      .getByRole("region", { name: "Clientes", exact: true })
      .getByRole("row")
      .filter({
        has: page.getByRole("cell", {
          name: "Cliente cuotas humo",
          exact: true,
        }),
      });
  const accountModal = page.getByRole("dialog", {
    name: "Cuenta de Cliente cuotas humo",
    exact: true,
  });
  await customerRow()
    .getByRole("button", { name: "Cuenta", exact: true })
    .click();
  await accountModal.waitFor();
  assert.equal(await page.getByRole("dialog").count(), 1);
  assert(
    await accountModal
      .getByRole("button", { name: "Registrar cobro", exact: true })
      .isDisabled(),
  );
  assert.equal(
    await page.getByRole("table", { includeHidden: true }).count(),
    1,
  );
  await page
    .getByRole("button", { name: "Deuda inicial", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Concepto", { exact: true })
    .fill("Saldo de ventas anteriores");
  await dialog.getByLabel("Deuda inicial", { exact: true }).fill("1000,01");
  await dialog.getByLabel("Cantidad de cuotas", { exact: true }).fill("3");
  await dialog
    .getByLabel("Primer vencimiento", { exact: true })
    .fill("2026-01-31");
  const [openingResponse] = await Promise.all([
    responseFor(`/api/customers/${customer.id}/opening-balances`),
    dialog
      .getByRole("button", { name: "Registrar deuda inicial", exact: true })
      .click(),
  ]);
  const opening = await openingResponse.json();
  assert.equal(opening.totalAmountCents, 100001);
  await customerRow()
    .getByRole("button", { name: "Cuenta", exact: true })
    .click();
  await accountModal
    .getByLabel("Mes de las cuotas", { exact: true })
    .fill("2026-01");
  await accountModal
    .getByText("Saldo anterior · Saldo de ventas anteriores · Cuota 1", {
      exact: true,
    })
    .waitFor();
  await accountModal
    .getByLabel("Estado de las cuotas", { exact: true })
    .selectOption("Pagada");
  await accountModal
    .getByText("No hay cuotas para estos filtros.", { exact: true })
    .waitFor();
  await accountModal
    .getByLabel("Estado de las cuotas", { exact: true })
    .selectOption("");
  await accountModal
    .getByRole("button", { name: "Cerrar", exact: true })
    .click();
  await accountModal.waitFor({ state: "hidden" });
  assert(
    await customerRow()
      .getByRole("button", { name: "Cuenta", exact: true })
      .evaluate((button) => button === document.activeElement),
  );
  await page
    .getByLabel("Buscar clientes", { exact: true })
    .fill("Sin coincidencias");
  await page
    .getByRole("region", { name: "Clientes", exact: true })
    .getByText("No hay registros para estos filtros.", { exact: true })
    .waitFor();
  assert.equal(await accountModal.count(), 0);
  await page.getByLabel("Buscar clientes", { exact: true }).fill("");
  await customerRow()
    .getByRole("button", { name: "Cuenta", exact: true })
    .click();
  await accountModal
    .getByRole("button", { name: "Registrar cobro", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  assert.equal(await dialog.count(), 1);
  await dialog
    .getByLabel("Importe cuota 1 de Saldo de ventas anteriores", {
      exact: true,
    })
    .fill("100");
  await dialog.getByLabel("Medio de pago", { exact: true }).selectOption("pm2");
  const [collectionResponse] = await Promise.all([
    responseFor("/api/collections"),
    dialog
      .getByRole("button", { name: "Registrar cobro", exact: true })
      .click(),
  ]);
  const collection = await collectionResponse.json();
  assert.equal(collection.amountCents, 10000);
  let account = await request(`/api/customers/${customer.id}/account`);
  assert.equal(account.balanceAmountCents, 90001);

  async function chooseCustomer() {
    await page
      .getByRole("combobox", { name: "Buscar o crear cliente", exact: true })
      .click();
    await page
      .getByRole("textbox", {
        name: "Buscar por nombre o celular",
        exact: true,
      })
      .fill(customer.name);
    await page
      .getByRole("option", {
        name: `${customer.name} ${customer.phone}`,
        exact: true,
      })
      .click();
  }
  async function addProduct(selectCustomer = true) {
    await page.goto(url + "/nueva-venta");
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("textbox", {
        name: "Buscar producto o combo por nombre o código",
      })
      .fill(product.name);
    await page.getByRole("button", { name: new RegExp(product.name) }).click();
    if (selectCustomer) await chooseCustomer();
  }
  await addProduct(false);
  await page
    .getByRole("radio", { name: "Cuotas directas", exact: true })
    .check();
  await page.waitForLoadState("networkidle");
  const checkout = page.getByRole("region", {
    name: "Resumen de venta",
    exact: true,
  });
  assert(
    (await page.getByTestId("sale-total").innerText()).includes("1.500"),
    "The total stays visible before the financing form is complete",
  );
  await checkout
    .getByRole("status")
    .filter({ hasText: /seleccioná.*cliente/i })
    .waitFor();
  assert(
    await page
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .isDisabled(),
  );
  await chooseCustomer();
  await page.getByLabel("Primer vencimiento", { exact: true }).fill("");
  await checkout.getByText(/fecha válida.*primera cuota/i).waitFor();
  assert((await page.getByTestId("sale-total").innerText()).includes("1.500"));
  assert(
    await page
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .isDisabled(),
  );
  await page.getByLabel("Cantidad de cuotas", { exact: true }).fill("3");
  await page.getByLabel("Anticipo ($)", { exact: true }).fill("300");
  await page
    .getByLabel("Medio del anticipo", { exact: true })
    .selectOption("pm2");
  await page
    .getByLabel("Recargo de financiación (%)", { exact: true })
    .fill("10");
  await page
    .getByLabel("Primer vencimiento", { exact: true })
    .fill("2026-01-31");
  await page.waitForLoadState("networkidle");
  // Invalid visible inputs must prevent a stale, previously valid quote from being confirmed.
  await page.getByLabel("Anticipo ($)", { exact: true }).fill("abc");
  assert(
    await page
      .getByRole("button", { name: "Confirmar venta", exact: true })
      .isDisabled(),
  );
  await page.getByLabel("Anticipo ($)", { exact: true }).fill("300");
  await page.waitForLoadState("networkidle");
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({
    path: join(evidence, "new-sale-direct-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: join(evidence, "new-sale-direct-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  const [directResponse] = await Promise.all([
    responseFor("/api/sales"),
    page.getByRole("button", { name: "Confirmar venta", exact: true }).click(),
  ]);
  const direct = await directResponse.json();
  assert.equal(direct.paymentMethodId, null);
  assert.equal(direct.totalAmountCents, 165000);
  assert.deepEqual(
    direct.finance.installments.map((i) => i.dueDate),
    ["2026-01-31", "2026-02-28", "2026-03-31"],
  );
  assert.equal(direct.finance.financedAmountCents, 135000);
  const receipt = await request(`/api/sales/${direct.id}/receipt`);
  assert.equal(receipt.sale.finance.upfrontAmountCents, 30000);

  await page
    .getByRole("button", { name: "Nueva venta", exact: true })
    .last()
    .click();
  await addProduct();
  await page
    .getByRole("radio", { name: "Cuotas con tarjeta", exact: true })
    .check();
  await page.waitForLoadState("networkidle");
  assert.equal(
    await page
      .getByRole("button", { name: "Tarjeta Credito cuotas", exact: true })
      .getAttribute("aria-pressed"),
    "true",
    "Switching to card selects a compatible method",
  );
  await page
    .getByTestId("sale-total")
    .filter({ hasText: "$1.537,50" })
    .waitFor();
  await page.getByLabel("Cuotas del cliente", { exact: true }).fill("6");
  await page.getByLabel("Referencia", { exact: true }).fill("OPERACION-HUMO");
  assert.equal(
    await page
      .getByRole("button", {
        name: "Agregar acreditación esperada",
        exact: true,
      })
      .count(),
    0,
  );
  await page
    .getByLabel("Procesador / adquirente", { exact: true })
    .fill("Procesador de humo");
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: join(evidence, "new-sale-card-desktop.png"),
    fullPage: true,
  });
  const [cardResponse] = await Promise.all([
    responseFor("/api/sales"),
    page.getByRole("button", { name: "Confirmar venta", exact: true }).click(),
  ]);
  const card = await cardResponse.json();
  assert.equal(card.totalAmountCents, 153750);
  assert.equal(card.finance.cardPlan.deferred, true);
  assert.equal(card.finance.cardPlan.settlements.length, 0);

  await page.goto(url + "/clientes-cobranzas");
  await customerRow()
    .getByRole("button", { name: "Cuenta", exact: true })
    .click();
  await accountModal
    .getByRole("region", { name: "Tarjetas del cliente", exact: true })
    .getByRole("button", { name: "Ver tarjetas", exact: true })
    .click();
  const pendingCard = page.getByRole("row").filter({ hasText: card.number });
  await pendingCard
    .getByText("Por completar", { exact: true })
    .first()
    .waitFor();
  assert.equal(await page.getByRole("table").count(), 1);
  await pendingCard
    .getByRole("button", { name: "Completar acreditaciones", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Acreditación 1: fecha", { exact: true }).fill(today);
  await dialog.getByLabel("Bruto ($)", { exact: true }).fill("1537,50");
  await dialog.getByLabel("Comisión ($)", { exact: true }).fill("37,50");
  await page.screenshot({
    path: join(evidence, "card-calendar-from-collections.png"),
    fullPage: true,
  });
  await Promise.all([
    responseFor("/api/card-settlements/sales/" + card.id + "/schedule"),
    dialog
      .getByRole("button", {
        name: "Guardar acreditaciones esperadas",
        exact: true,
      })
      .click(),
  ]);
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await prisma.cardAccreditation.count({
      where: { settlement: { saleId: card.id } },
    }),
    0,
  );
  await page.getByRole("button", { name: "Acreditar", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Bruto acreditado", { exact: true }).fill("1000");
  await dialog.getByLabel("Comisión real", { exact: true }).fill("40");
  const settlements = await request("/api/card-settlements");
  const settlement = settlements.items.find((s) => s.saleId === card.id);
  const [accreditationResponse] = await Promise.all([
    responseFor(`/api/card-settlements/${settlement.id}/accreditations`),
    dialog
      .getByRole("button", { name: "Registrar acreditación", exact: true })
      .click(),
  ]);
  assert.equal((await accreditationResponse.json()).netAmountCents, 96000);
  await request(`/api/sales/${card.id}/cancel`, "POST", {
    reason: "Cancelación de prueba",
  });
  await page.reload();
  await page
    .getByLabel("Tipo de movimiento", { exact: true })
    .selectOption("Reintegros");
  await page
    .getByRole("row")
    .filter({ hasText: `Venta ${card.number}` })
    .getByRole("button", { name: "Reintegrar", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Dinero que sale de caja", { exact: true })
    .fill("1000");
  await dialog.getByLabel(/^Cancelar acreditación pendiente 1/).fill("537,50");
  await dialog.getByLabel("Medio de pago", { exact: true }).selectOption("pm2");
  await dialog.getByLabel("Motivo", { exact: true }).fill("Devolución total");
  const [refundResponse] = await Promise.all([
    responseFor("/api/collections/refunds"),
    dialog
      .getByRole("button", { name: "Registrar reintegro", exact: true })
      .click(),
  ]);
  const refund = await refundResponse.json();
  assert.equal(refund.amountCents, 153750);
  assert.equal(refund.cashOutAmountCents, 100000);
  const finance = await request(
    `/api/collections/summary?month=${today.slice(0, 7)}&customerId=${customer.id}`,
  );
  assert.equal(finance.cardPendingAmountCents, 0);
  assert.equal(finance.pendingRefundAmountCents, 0);
  assert.equal(finance.refundedAmountCents, 100000);
  const saleCount = await prisma.sale.count();
  assert(saleCount > 0);
  const backup = await request("/api/backups", "POST", {});
  assert(backup.id);
  const backupLog = await prisma.backupLog.findUniqueOrThrow({
    where: { id: backup.id },
  });
  const previewResponse = await fetch(url + "/api/backups/import/validate", {
    method: "POST",
    headers: { "Content-Type": "application/vnd.sqlite3" },
    body: readFileSync(backupLog.path),
  });
  const preview = await previewResponse.json();
  assert(previewResponse.ok, JSON.stringify(preview));
  assert.equal(preview.counts.customers, 1);
  assert.equal(preview.counts.receivablePlans, 2);
  assert.equal(preview.counts.cardSettlements, 1);
  assert.equal(preview.counts.refunds, 1);
  assert.equal(
    (
      await request(`/api/backups/import/${preview.id}/confirm`, "POST", {
        confirmed: true,
      })
    ).imported,
    true,
  );
  assert.equal(await prisma.sale.count(), saleCount);
  assert.equal(
    (await request(`/api/customers/${customer.id}/account`)).balanceAmountCents,
    225001,
  );
  await page.goto(url + "/clientes-cobranzas");
  await customerRow()
    .getByRole("button", { name: "Cuenta", exact: true })
    .click();
  await page.evaluate(() => {
    const open = window.open;
    window.open = function (...args) {
      const popup = open.apply(this, args);
      if (popup) {
        popup.print = () => {
          popup.document.body.dataset.printRequested = "true";
        };
      }
      return popup;
    };
  });
  const printButtons = page
    .getByRole("dialog", { name: "Cuenta de Cliente cuotas humo", exact: true })
    .getByRole("button", { name: "Imprimir", exact: true });
  for (const [button, title, content] of [
    [
      printButtons.first(),
      "Comprobante interno de cobro",
      "Cliente cuotas humo",
    ],
    [
      printButtons.last(),
      "Comprobante interno de reintegro",
      "Dinero entregado",
    ],
  ]) {
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      button.click(),
    ]);
    await popup.waitForFunction(
      () => document.body.dataset.printRequested === "true",
    );
    assert.equal(await popup.title(), title);
    assert((await popup.locator("body").innerText()).includes(content));
    if (title.includes("reintegro"))
      assert(
        (await popup.locator("body").innerText()).includes(
          "Acreditaciones pendientes canceladas",
        ),
      );
    await popup.close();
  }
  await page.keyboard.press("Escape");
  const checkoutResult = await require("./new-sale-checkout-smoke.cjs")({
    page,
    url,
    request,
    product,
  });
  await page.goto(url + "/clientes-cobranzas");
  await customerRow()
    .getByRole("button", { name: "Cuenta", exact: true })
    .click();
  await accountModal
    .getByLabel("Mes de las cuotas", { exact: true })
    .fill("2026-01");
  await accountModal
    .getByText("Saldo anterior · Saldo de ventas anteriores · Cuota 1", {
      exact: true,
    })
    .waitFor();
  await page.keyboard.press("Control+Home");
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({
    path: join(evidence, "clients-cobranzas-desktop.png"),
    fullPage: true,
  });
  for (const viewport of [
    { width: 1280, height: 480 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of ["/clientes-cobranzas", "/nueva-venta"]) {
      await page.goto(url + route);
      await page.waitForLoadState("networkidle");
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Finance horizontal overflow ${route} ${viewport.width}`,
      );
    }
  }
  await page.goto(url + "/clientes-cobranzas");
  await customerRow()
    .getByRole("button", { name: "Cuenta", exact: true })
    .click();
  await accountModal
    .getByLabel("Mes de las cuotas", { exact: true })
    .fill("2026-01");
  await accountModal
    .getByText("Saldo anterior · Saldo de ventas anteriores · Cuota 1", {
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: join(evidence, "clients-cobranzas-mobile.png"),
    fullPage: true,
  });
  return {
    ...checkoutResult,
    customerId: customer.id,
    openingBalance: opening.totalAmountCents,
    directSale: direct.number,
    cardSale: card.number,
    explicitPartialCollection: collection.amountCents,
    refundCashOut: refund.cashOutAmountCents,
    fixedMonthlyDates: "passed",
    independentCardAccreditation: "passed",
    printableFinancialReceipts: "passed",
    financialBackupRoundtrip: "passed",
    unifiedClientsAndCollections: "passed",
    singleCustomerTableWithAccountModal: "passed",
    financeUi: "passed",
    persistentCheckoutTotals: "passed",
    explicitCheckoutRequirements: "passed",
    automaticCardMethod: "passed",
  };
};
