const assert = require("node:assert/strict");

module.exports = async function newSaleCheckoutSmoke({
  page,
  url,
  request,
  product,
}) {
  const confirm = () =>
    page.getByRole("button", { name: "Confirmar venta", exact: true });
  async function addProduct() {
    await page.goto(url + "/nueva-venta");
    await page
      .getByRole("textbox", {
        name: "Buscar producto o combo por nombre o código",
      })
      .fill(product.name);
    await page.getByRole("button", { name: new RegExp(product.name) }).click();
  }
  async function waitReady() {
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")].find(
        (item) => item.textContent === "Confirmar venta",
      );
      return button && !button.disabled;
    });
  }

  await addProduct();
  await page
    .getByRole("radio", { name: "Cuotas directas", exact: true })
    .check();
  await page
    .getByRole("combobox", { name: "Buscar o crear cliente", exact: true })
    .click();
  const search = page.getByRole("textbox", {
    name: "Buscar por nombre o celular",
    exact: true,
  });
  await search.fill("Cliente alta desde venta");
  await page
    .getByRole("button", {
      name: "Crear cliente «Cliente alta desde venta»",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "Clientes de la venta" });
  assert.equal(
    await dialog.getByLabel("Nombre", { exact: true }).inputValue(),
    "Cliente alta desde venta",
    "Creating a customer reuses the name typed in the combobox",
  );
  await dialog
    .getByLabel("Celular (opcional)", { exact: true })
    .fill("1100099");
  await dialog
    .getByRole("button", { name: "Crear y seleccionar", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  const customerSelector = page.getByRole("combobox", {
    name: "Buscar o crear cliente",
    exact: true,
  });
  assert(
    (await customerSelector.innerText()).includes("Cliente alta desde venta"),
  );
  await customerSelector.click();
  await search.fill("1100099");
  await page
    .getByRole("option", {
      name: "Cliente alta desde venta 1100099",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: /^Crear cliente/ }).count(),
    0,
    "An existing phone number must offer its customer instead of a duplicate",
  );
  await search.press("ArrowDown");
  await page.keyboard.press("Enter");
  await dialog.waitFor({ state: "hidden" });
  await page.getByLabel("Cantidad de cuotas", { exact: true }).fill("2");
  await waitReady();
  const noUpfrontResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/sales" &&
      response.request().method() === "POST" &&
      response.ok(),
  );
  await confirm().click();
  const noUpfront = await (await noUpfrontResponse).json();
  assert.equal(noUpfront.paymentMethodId, null);
  assert.equal(noUpfront.finance.upfrontAmountCents, 0);
  assert.equal(noUpfront.finance.installments.length, 2);
  const account = await request(
    `/api/customers/${noUpfront.customerId}/account`,
  );
  assert.equal(account.balanceAmountCents, 150000);
  assert.equal(noUpfront.customerName, "Cliente alta desde venta");
  assert.equal(noUpfront.customerPhone, "1100099");

  await page
    .getByRole("button", { name: "Nueva venta", exact: true })
    .last()
    .click();
  await addProduct();
  const cashMethod = (await request("/api/settings")).paymentMethods.find(
    (method) => method.enabled && method.cashHandling,
  );
  assert(
    cashMethod,
    "An enabled cash payment method is available for the retry test",
  );
  await page
    .getByRole("button", { name: cashMethod.name, exact: true })
    .click();
  await page.getByLabel("Dinero recibido", { exact: true }).fill("2000");
  await waitReady();
  const previousSales = (await request("/api/sales")).length;
  let captured;
  let resolveStored;
  const stored = new Promise((resolve) => {
    resolveStored = resolve;
  });
  await page.route(
    "**/api/sales",
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      captured = route.request().postDataJSON();
      const response = await route.fetch();
      assert(response.ok());
      const sale = await response.json();
      await route.abort("failed");
      resolveStored(sale);
    },
    { times: 1 },
  );
  await confirm().click();
  const firstSale = await stored;
  const recover = page.getByRole("button", {
    name: "Recuperar venta pendiente",
    exact: true,
  });
  await recover.waitFor();
  const retryResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/sales" &&
      response.request().method() === "POST" &&
      response.ok(),
  );
  await recover.click();
  const response = await retryResponse;
  assert.equal(
    response.request().postDataJSON().operationId,
    captured.operationId,
  );
  assert.equal((await response.json()).id, firstSale.id);
  assert.equal((await request("/api/sales")).length, previousSales + 1);
  await page
    .getByRole("button", { name: "Nueva venta", exact: true })
    .last()
    .click();
  await page
    .getByRole("radio", { name: "Contado", exact: true })
    .waitFor({ state: "attached" });
  assert.equal(await page.getByTestId("sale-total").innerText(), "$0");
  return {
    noUpfrontSale: noUpfront.number,
    lostResponseRetry: "passed",
    customerCreatedFromSale: "passed",
  };
};
