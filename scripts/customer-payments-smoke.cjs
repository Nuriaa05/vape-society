const assert = require("node:assert/strict");
const { join } = require("node:path");

module.exports = async function customerPaymentsSmoke({
  page,
  url,
  request,
  prisma,
  evidence,
}) {
  const customer = await request("/api/customers", "POST", {
    name: "Pago manual de prueba",
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url + "/clientes-cobranzas");
  await page.getByLabel("Buscar clientes", { exact: true }).fill(customer.name);
  const row = page
    .getByRole("region", { name: "Clientes", exact: true })
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", { name: customer.name, exact: true }),
    });
  const dialog = page.getByRole("dialog");
  await row.getByRole("button", { name: "Ver cuenta", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Cargar deuda anterior", exact: true })
    .click();
  await dialog.getByLabel(/^Concepto/).waitFor();
  await dialog.getByLabel("Importe que ya debía", { exact: true }).fill("100");
  await dialog.getByLabel("Cantidad de cuotas", { exact: true }).fill("2");
  await dialog
    .getByLabel("Primer vencimiento", { exact: true })
    .fill("2020-01-01");
  const [planResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          `/api/customers/${customer.id}/opening-balances` &&
        response.request().method() === "POST" &&
        response.ok(),
    ),
    dialog
      .getByRole("button", { name: "Guardar deuda anterior", exact: true })
      .click(),
  ]);
  const plan = await planResponse.json();
  assert.equal(plan.title, "Deuda anterior");
  await dialog
    .getByRole("heading", { name: `Cuenta de ${customer.name}`, exact: true })
    .waitFor();
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await row.getByRole("button", { name: "Cobrar", exact: true }).click();
  await dialog.getByLabel("Importe del pago", { exact: true }).fill("25");
  await dialog.getByLabel("Medio de pago", { exact: true }).selectOption("pm1");
  assert.equal(await dialog.getByLabel(/^Efectivo recibido/).count(), 0);
  await dialog
    .getByRole("button", { name: "Revisar pago", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirmar pago", exact: true })
    .waitFor();
  assert.equal(await dialog.getByText("Vuelto", { exact: true }).count(), 0);
  await dialog
    .getByRole("button", { name: "Volver a editar", exact: true })
    .click();
  await dialog.getByLabel("Importe del pago", { exact: true }).fill("30");
  await dialog
    .getByRole("button", { name: "Revisar pago", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirmar pago", exact: true })
    .waitFor();
  await dialog.getByText("$70", { exact: true }).waitFor();
  await dialog
    .getByRole("button", { name: "Volver a editar", exact: true })
    .click();
  await dialog.getByLabel("Importe del pago", { exact: true }).fill("25");
  await dialog
    .getByRole("switch", { name: "Calcular vuelto", exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Revisar pago", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirmar pago", exact: true })
    .waitFor();
  assert.equal(await dialog.getByText("Vuelto", { exact: true }).count(), 0);
  await dialog
    .getByRole("button", { name: "Volver a editar", exact: true })
    .click();
  await dialog.getByLabel(/^Efectivo recibido/).fill("10");
  await dialog
    .getByRole("button", { name: "Revisar pago", exact: true })
    .click();
  await dialog
    .getByRole("alert")
    .filter({ hasText: "El efectivo recibido debe cubrir" })
    .waitFor();
  await dialog.getByLabel("Medio de pago", { exact: true }).selectOption("pm2");
  assert.equal(await dialog.getByLabel(/^Efectivo recibido/).count(), 0);
  await dialog.getByLabel("Medio de pago", { exact: true }).selectOption("pm1");
  assert.equal(await dialog.getByLabel(/^Efectivo recibido/).count(), 0);
  await dialog
    .getByRole("switch", { name: "Calcular vuelto", exact: true })
    .check();
  await dialog.getByLabel(/^Efectivo recibido/).fill("50");
  await dialog
    .getByRole("button", { name: "Elegir cuotas manualmente", exact: true })
    .click();
  await dialog
    .getByLabel("Importe cuota 1 de Deuda anterior", { exact: true })
    .fill("0");
  await dialog
    .getByLabel("Importe cuota 2 de Deuda anterior", { exact: true })
    .fill("20");
  await dialog
    .getByRole("button", { name: "Revisar pago", exact: true })
    .click();
  await dialog
    .getByRole("alert")
    .filter({ hasText: "La suma de los importes" })
    .waitFor();
  await dialog
    .getByLabel("Importe cuota 2 de Deuda anterior", { exact: true })
    .fill("25");
  await dialog
    .getByRole("button", { name: "Revisar pago", exact: true })
    .click();
  assert(
    (
      await dialog
        .getByRole("list", { name: "Cuotas incluidas en el pago", exact: true })
        .innerText()
    ).includes("Cuota 2"),
  );
  assert(
    !(
      await dialog
        .getByRole("list", { name: "Cuotas incluidas en el pago", exact: true })
        .innerText()
    ).includes("Cuota 1"),
  );
  const count = await prisma.collection.count();
  let discarded = false;
  await page.route("**/api/collections", async (route) => {
    if (route.request().method() === "POST" && !discarded) {
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      discarded = true;
      await route.abort("failed");
    } else await route.continue();
  });
  const failedResponse = page.waitForEvent(
    "requestfailed",
    (request) => new URL(request.url()).pathname === "/api/collections",
  );
  await dialog
    .getByRole("button", { name: "Confirmar pago", exact: true })
    .click();
  await failedResponse;
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (button) => button.textContent === "Confirmar pago" && !button.disabled,
    ),
  );
  assert(
    discarded,
    "The server must have recorded the payment before its response is lost",
  );
  await dialog
    .getByRole("button", { name: "Confirmar pago", exact: true })
    .click();
  const result = page.getByRole("dialog", {
    name: "Pago registrado",
    exact: true,
  });
  await result.getByText("$75", { exact: true }).waitFor();
  await page.unroute("**/api/collections");
  assert.equal(
    await prisma.collection.count(),
    count + 1,
    "Retry must not duplicate payment",
  );
  const account = await request(`/api/customers/${customer.id}/account`);
  assert.equal(
    account.installments.find((item) => item.id === plan.installments[0].id)
      .remainingAmountCents,
    5000,
  );
  assert.equal(
    account.installments.find((item) => item.id === plan.installments[1].id)
      .remainingAmountCents,
    2500,
  );
  const payment = account.collections[0];
  assert.equal(payment.changeAmountCents, 2500);
  await result
    .getByRole("button", { name: "Volver a clientes", exact: true })
    .click();
  await page.getByLabel("Deuda del cliente", { exact: true }).click();
  await page.getByRole("option", { name: "Con deuda", exact: true }).click();
  await row.getByRole("button", { name: "Cobrar", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Cobrar toda la deuda", exact: true })
    .click();
  assert.equal(
    await dialog.getByLabel("Importe del pago", { exact: true }).inputValue(),
    "75,00",
  );
  await dialog.getByLabel("Medio de pago", { exact: true }).selectOption("pm1");
  assert.equal(await dialog.getByLabel(/^Efectivo recibido/).count(), 0);
  await dialog
    .getByRole("button", { name: "Revisar pago", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirmar pago", exact: true })
    .click();
  await result.getByText("El cliente está al día.", { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(evidence, "collection-paid-mobile.png"),
    fullPage: true,
  });
  assert(
    await result.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  );
  await result
    .getByRole("button", { name: "Volver a clientes", exact: true })
    .click();
  await page
    .getByText("No hay registros para estos filtros.", { exact: true })
    .waitFor();
  assert.equal(
    (await request(`/api/customers/${customer.id}/account`)).balanceAmountCents,
    0,
  );
  const finalPayment = await prisma.collection.findFirstOrThrow({
    where: { customerId: customer.id, amountCents: 7500 },
  });
  assert.equal(finalPayment.cashReceivedAmountCents, 7500);
  assert.equal(finalPayment.changeAmountCents, 0);
  return {
    optionalOpeningConcept: "passed",
    exactCashWithoutExtraInput: "passed",
    manualAllocation: "passed",
    cashChange: "passed",
    paymentRetryAfterLostResponse: "passed",
    fullDebtPayment: "passed",
  };
};
