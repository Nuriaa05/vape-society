const assert = require("node:assert/strict");
const { join } = require("node:path");

module.exports = async function wholesalePricingSmoke({
  page,
  url,
  request,
  evidence,
}) {
  const category = await request("/api/settings/categories", "POST", {
    name: "Mayorista",
  });
  const supplier = await request("/api/suppliers", "POST", {
    name: "Proveedor mayorista",
    phone: "123456789",
    email: "",
  });
  async function product(name, priceAmountCents) {
    return request("/api/products", "POST", {
      name,
      categoryId: category.id,
      supplierId: supplier.id,
      costAmountCents: priceAmountCents / 2,
      priceAmountCents,
      marginPct: 100,
      physicalStock: 30,
      minStock: 0,
    });
  }
  const a = await product("Aroma mayorista A", 100_000);
  const b = await product("Aroma mayorista B", 200_000);
  const combo = await request("/api/combos", "POST", {
    name: "Pack aromas mayorista",
    priceAmountCents: 250_000,
    items: [
      { productId: a.id, qty: 1 },
      { productId: b.id, qty: 1 },
    ],
  });
  const confirm = () =>
    page.getByRole("button", { name: "Confirmar venta", exact: true });
  async function changed(path, method, action) {
    const [response] = await Promise.all([
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === path &&
          response.request().method() === method &&
          response.ok(),
      ),
      action(),
    ]);
    await page.waitForLoadState("networkidle");
    return response.json();
  }
  async function waitTotal(amountCents) {
    await page.waitForFunction((amount) => {
      const text =
        document.querySelector('[data-testid="sale-total"]')?.textContent ?? "";
      const pesos = Number(
        text
          .replace(/[^\d.,-]/g, "")
          .replace(/\./g, "")
          .replace(",", "."),
      );
      return Math.round(pesos * 100) === amount;
    }, amountCents);
  }
  async function ready() {
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (button) =>
          button.textContent === "Confirmar venta" && !button.disabled,
      ),
    );
  }
  async function add(item, qty) {
    for (let index = 0; index < qty; index++) {
      await page
        .getByRole("textbox", {
          name: "Buscar producto o combo por nombre o código",
          exact: true,
        })
        .fill(item.name);
      await page
        .getByRole("button", { name: new RegExp("^" + item.name) })
        .first()
        .click();
    }
  }
  async function openCustomerAssignment() {
    await page.getByRole("button", {name:"Asignar cliente",exact:true}).click();
  }
  async function openListCustomers(name) {
    await page.getByRole("button", {name:"Ver clientes",exact:true}).click();
    const modal = page.getByRole("dialog", {name:`Clientes de ${name}`,exact:true});
    await modal.waitFor();
    return modal;
  }
  async function closeListCustomers(modal) {
    await modal.getByRole("button", {name:"Cerrar",exact:true}).first().click();
    await modal.waitFor({state:"hidden"});
  }
  async function savePrices(id) {
    return changed(`/api/price-lists/${id}`, "PATCH", () =>
      page
        .getByRole("button", { name: "Guardar precios", exact: true })
        .click(),
    );
  }
  async function cell(item, scale, amount) {
    await page
      .getByRole("textbox", {
        name: `${item.name}, precio por unidad desde cantidad ${scale}`,
        exact: true,
      })
      .fill(amount);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url + "/productos");
  await page
    .getByRole("tab", { name: "Listas de precios", exact: true })
    .click();
  await page.getByRole("region", { name: "Matriz de precios" }).waitFor();
  await page.getByRole("button", {name:"Acciones de la lista",exact:true}).click();
  assert(await page.getByRole("menuitem", {name:"Archivar lista",exact:true}).isDisabled());
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Agregar cantidad mínima", exact: true })
    .click();
  await page
    .getByLabel("Cantidad mínima 1", { exact: true })
    .fill("6");
  await cell(a, 1, "900");
  await cell(b, 1, "1800");
  await cell(combo, 1, "2300");
  await page
    .getByRole("button", { name: "Agregar cantidad mínima", exact: true })
    .click();
  await page
    .getByLabel("Cantidad mínima 2", { exact: true })
    .fill("12");
  await cell(b, 2, "1600");
  assert.equal(await page.getByRole("textbox", {name:`${a.name}, precio por unidad desde cantidad 2`,exact:true}).getAttribute("placeholder"), "$900");
  await savePrices("general");
  await page.screenshot({
    path: join(evidence, "wholesale-lists-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Nueva lista", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Nueva lista", exact: true });
  await dialog
    .getByLabel("Nombre de lista", { exact: true })
    .fill("Acuerdo comercial");
  const custom = await changed("/api/price-lists", "POST", () =>
    dialog.getByRole("button", { name: "Continuar con precios", exact: true }).click(),
  );
  await page
    .getByRole("button", { name: "Agregar cantidad mínima", exact: true })
    .click();
  await page
    .getByLabel("Cantidad mínima 1", { exact: true })
    .fill("6");
  await cell(a, 1, "750");
  await cell(b, 1, "1500");
  await cell(combo, 1, "2000");
  const configured = await savePrices(custom.id);
  await cell(a,1,"740");
  await page.getByRole("tab", {name:"Productos",exact:true}).click();
  await page.getByRole("tab", {name:"Listas de precios",exact:true}).click();
  assert.equal(await page.getByRole("textbox", {name:`${a.name}, precio por unidad desde cantidad 1`,exact:true}).inputValue(),"740");
  await page.getByLabel("Lista de precios", {exact:true}).click();
  await page.getByRole("option", {name:"General (predeterminada)",exact:true}).click();
  let unsaved = page.getByRole("dialog", {name:"Tenés precios sin guardar",exact:true});
  await unsaved.getByRole("button", {name:"Seguir editando",exact:true}).click();
  await page.getByRole("button", {name:"Stock",exact:true}).click();
  await unsaved.getByRole("button", {name:"Seguir editando",exact:true}).click();
  assert(page.url().endsWith("/productos"));
  assert.equal((await request(`/api/price-lists/${custom.id}`)).tiers[0].prices.find(p=>p.itemId===a.id).priceAmountCents,75000);
  await page.getByLabel("Lista de precios", {exact:true}).click();
  await page.getByRole("option", {name:"General (predeterminada)",exact:true}).click();
  await unsaved.getByRole("button", {name:"Descartar cambios",exact:true}).click();
  await page.getByLabel("Lista de precios", {exact:true}).click();
  await page.getByRole("option", {name:custom.name,exact:true}).click();
  assert.equal(await page.getByRole("textbox", {name:`${a.name}, precio por unidad desde cantidad 1`,exact:true}).inputValue(),"750,00");
  await page.getByRole("button", {name:"Acciones de la lista",exact:true}).click();
  await page.getByRole("menuitem", {name:"Duplicar lista",exact:true}).click();
  dialog = page.getByRole("dialog", { name: "Duplicar lista", exact: true });
  await dialog
    .getByLabel("Nombre de lista", { exact: true })
    .fill("Copia para archivar");
  const copy = await changed(
    `/api/price-lists/${custom.id}/duplicate`,
    "POST",
    () =>
      dialog
        .getByRole("button", { name: "Guardar lista", exact: true })
        .click(),
  );
  assert.deepEqual(copy.tiers, configured.tiers);
  await page.getByRole("button", {name:"Acciones de la lista",exact:true}).click();
  await page.getByRole("menuitem", {name:"Archivar lista",exact:true}).click();
  await changed(`/api/price-lists/${copy.id}`, "PATCH", () =>
    page
      .getByRole("button", { name: "Confirmar archivo", exact: true })
      .click(),
  );
  assert.equal((await request(`/api/price-lists/${copy.id}`)).active, false);

  const archived = await product("Componente retirado", 50_000);
  const unavailableCombo = await request("/api/combos", "POST", {
    name: "Pack con componente retirado",
    priceAmountCents: 100_000,
    items: [
      { productId: archived.id, qty: 1 },
      { productId: a.id, qty: 1 },
    ],
  });
  await request(`/api/products/${archived.id}/archive`, "PATCH", {
    archived: true,
  });

  await page.goto(url + "/nueva-venta");
  await add(a, 4);
  await add(b, 1);
  await waitTotal(600_000);
  await add(b, 1);
  await waitTotal(720_000);
  await page
    .getByRole("textbox", {
      name: "Buscar producto o combo por nombre o código",
      exact: true,
    })
    .fill("");
  const unavailableButton = page.getByRole("button", {
    name: new RegExp(unavailableCombo.name),
  });
  assert(
    (await unavailableButton.count()) === 0 ||
      (await unavailableButton.first().isDisabled()),
    "Unavailable lookup combo cannot be sold or block unrelated products",
  );
  assert(
    (
      await page.getByRole("region", { name: "Resumen de venta" }).innerText()
    ).includes("6 unidades"),
  );
  await page
    .getByRole("combobox", { name: "Buscar o crear cliente", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Buscar por nombre o celular", exact: true })
    .fill("Cliente acuerdo mayorista");
  await page
    .getByRole("button", {
      name: "Crear cliente «Cliente acuerdo mayorista»",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Clientes de la venta",
    exact: true,
  });
  assert.equal(
    await dialog.getByLabel("Lista de precios", { exact: true }).count(),
    0,
    "Las listas se asignan en Productos y no al crear un cliente en la venta",
  );
  await dialog
    .getByLabel("Celular (opcional)", { exact: true })
    .fill("3624000999");
  const customer = await changed("/api/customers", "POST", () =>
    dialog
      .getByRole("button", { name: "Crear y seleccionar", exact: true })
      .click(),
  );
  assert.equal(customer.priceListId ?? null, null);
  await page.getByRole("button", { name: "Productos", exact: true }).click();
  await page
    .getByRole("tab", { name: "Listas de precios", exact: true })
    .click();
  await page.getByLabel("Lista de precios", { exact: true }).click();
  await page.getByRole("option", { name: custom.name, exact: true }).click();
  await openCustomerAssignment();
  let assignmentDialog = page.getByRole("dialog", {
    name: `Asignar cliente a ${custom.name}`,
    exact: true,
  });
  await assignmentDialog
    .getByLabel("Buscar cliente por nombre o celular", { exact: true })
    .fill("sin coincidencias");
  await assignmentDialog
    .getByText("No se encontraron clientes para asignar.", { exact: true })
    .waitFor();
  await assignmentDialog
    .getByLabel("Buscar cliente por nombre o celular", { exact: true })
    .fill(customer.phone);
  const assignButton = assignmentDialog.getByRole("button", {
    name: `Asignar a ${customer.name}`,
    exact: true,
  });
  const assignmentPath = `/api/customers/${customer.id}`;
  await page.route(`**${assignmentPath}`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        message: "No se pudo guardar la asignación de prueba.",
      }),
    }),
  );
  await assignButton.click();
  await assignmentDialog.getByRole("alert").waitFor();
  assert.equal(
    (await request("/api/customers")).items.find(
      (item) => item.id === customer.id,
    ).priceListId ?? null,
    null,
  );
  await page.unroute(`**${assignmentPath}`);
  const assigned = await changed(assignmentPath, "PATCH", () =>
    assignButton.click(),
  );
  assert.equal(assigned.priceListId, custom.id);
  assert.equal(assigned.name, customer.name);
  assert.equal(assigned.phone, customer.phone);
  const assignmentSection = page.getByRole("region", {
    name: "Clientes de esta lista",
    exact: true,
  });
  await assignmentSection.getByText("Se aplica a 1 cliente", { exact: true }).waitFor();
  let listCustomers = await openListCustomers(custom.name);
  await listCustomers.getByLabel("Buscar cliente por nombre o celular", {exact:true}).fill(customer.phone);
  await listCustomers.getByText(customer.name, { exact: true }).waitFor();
  await changed(assignmentPath, "PATCH", () =>
    listCustomers
      .getByRole("button", {
        name: `Quitar a ${customer.name} de ${custom.name}`,
        exact: true,
      })
      .click(),
  );
  assert.equal(
    (await request("/api/customers")).items.find(
      (item) => item.id === customer.id,
    ).priceListId ?? null,
    null,
  );
  await listCustomers.getByText("No se encontraron clientes.", {exact:true}).waitFor();
  await closeListCustomers(listCustomers);
  await assignmentSection.getByText("Se aplica a 0 clientes", {exact:true}).waitFor();
  await openCustomerAssignment();
  assignmentDialog = page.getByRole("dialog", {
    name: `Asignar cliente a ${custom.name}`,
    exact: true,
  });
  await assignmentDialog
    .getByLabel("Buscar cliente por nombre o celular", { exact: true })
    .fill(customer.name);
  await changed(assignmentPath, "PATCH", () =>
    assignmentDialog
      .getByRole("button", { name: `Asignar a ${customer.name}`, exact: true })
      .click(),
  );
  await assignmentDialog.waitFor({ state: "hidden" });
  await page.screenshot({
    path: join(evidence, "wholesale-customer-assignment-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });

  const newCustomerName = "Cliente nuevo desde Productos";
  await openCustomerAssignment();
  assignmentDialog = page.getByRole("dialog", {
    name: `Asignar cliente a ${custom.name}`,
    exact: true,
  });
  await assignmentDialog
    .getByLabel("Buscar cliente por nombre o celular", { exact: true })
    .fill(newCustomerName);
  await assignmentDialog
    .getByRole("button", { name: "Nuevo cliente", exact: true })
    .click();
  let createDialog = page.getByRole("dialog", {
    name: `Nuevo cliente para ${custom.name}`,
    exact: true,
  });
  assert.equal(
    await createDialog.getByLabel("Nombre", { exact: true }).inputValue(),
    newCustomerName,
  );
  const createButton = createDialog.getByRole("button", {
    name: "Crear y asignar",
    exact: true,
  });
  await createDialog.getByLabel("Nombre", { exact: true }).fill("   ");
  assert(
    await createButton.isDisabled(),
    "El nombre vacío no permite crear clientes",
  );
  await createDialog
    .getByLabel("Nombre", { exact: true })
    .fill(` ${newCustomerName} `);
  await createDialog
    .getByLabel("Celular (opcional)", { exact: true })
    .fill(" 3624000888 ");
  const previousCustomerCount = (await request("/api/customers")).total;
  const previousSaleCount = (await request("/api/sales")).length;
  await page.route("**/api/customers", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "No se pudo crear el cliente de prueba.",
          }),
        })
      : route.continue(),
  );
  await createButton.click();
  await createDialog.getByRole("alert").waitFor();
  assert.equal((await request("/api/customers")).total, previousCustomerCount);
  assert.equal(
    await createDialog.getByLabel("Nombre", { exact: true }).inputValue(),
    ` ${newCustomerName} `,
  );
  await page.unroute("**/api/customers");
  await page.screenshot({
    path: join(evidence, "wholesale-customer-create-desktop.png"),
    fullPage: false,
    animations: "disabled",
  });
  const newCustomer = await changed("/api/customers", "POST", () =>
    createButton.click(),
  );
  assert.equal(newCustomer.name, newCustomerName);
  assert.equal(newCustomer.phone, "3624000888");
  assert.equal(newCustomer.priceListId, custom.id);
  await createDialog.waitFor({ state: "hidden" });
  await assignmentSection.getByText("Se aplica a 2 clientes", {exact:true}).waitFor();
  listCustomers = await openListCustomers(custom.name);
  await listCustomers.getByLabel("Buscar cliente por nombre o celular", {exact:true}).fill(newCustomerName);
  await listCustomers.getByText(newCustomerName, {exact:true}).waitFor();
  await closeListCustomers(listCustomers);
  const newAccount = await request(`/api/customers/${newCustomer.id}/account`);
  assert.equal(newAccount.balanceAmountCents, 0);
  assert.equal(newAccount.plans.length, 0);
  assert.equal(newAccount.sales.length, 0);
  assert.equal(newAccount.collections.length, 0);
  assert.equal((await request("/api/sales")).length, previousSaleCount);
  assert.equal(
    (await request("/api/customers")).total,
    previousCustomerCount + 1,
  );

  await page
    .getByRole("button", { name: "Cobranzas", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Acciones de ${customer.name}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Editar", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Editar cliente", exact: true });
  assert.equal(
    await dialog.getByLabel(/^Lista de precios/).count(),
    0,
  );
  await dialog
    .getByLabel("Notas", { exact: true })
    .fill("Datos actualizados sin cambiar la lista.");
  const edited = await changed(assignmentPath, "PATCH", () =>
    dialog
      .getByRole("button", { name: "Guardar cliente", exact: true })
      .click(),
  );
  assert.equal(
    edited.priceListId,
    custom.id,
    "Editar el cliente conserva su lista asignada desde Productos",
  );
  assert.equal(edited.notes, "Datos actualizados sin cambiar la lista.");
  await page.getByRole("button", { name: "Nueva venta", exact: true }).click();
  await waitTotal(600_000);
  await page
    .getByRole("radio", { name: "Cuotas directas", exact: true })
    .check();
  await page.getByLabel("Cantidad de cuotas", { exact: true }).fill("2");
  await page
    .getByLabel("Primer vencimiento", { exact: true })
    .fill("2030-01-31");
  await request("/api/coupons", "POST", {
    code: "MAYOR10",
    discountType: "Percentage",
    discountBasisPoints: 1000,
    enabled: true,
  });
  await page.getByLabel("Cupón de descuento", { exact: true }).fill("MAYOR10");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await waitTotal(540_000);
  await ready();
  await page
    .getByRole("region", { name: "Resumen de venta" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(evidence, "wholesale-checkout-desktop.png"),
    fullPage: true,
  });
  const direct = await changed("/api/sales", "POST", () => confirm().click());
  assert.equal(direct.totalAmountCents, 540_000);
  assert.equal(direct.pricingSnapshot.listId, custom.id);
  assert.equal(direct.pricingSnapshot.countedUnits, 6);
  assert.equal(direct.finance.installments.length, 2);
  assert.equal(direct.finance.installments[0].amountCents, 270_000);
  assert.equal(
    (await request(`/api/customers/${customer.id}/account`)).balanceAmountCents,
    540_000,
  );

  // Printing uses the saved snapshot even after the customer's current list changes.
  await request(`/api/price-lists/${custom.id}`, "PATCH", {
    name: "Nombre posterior",
    tiers: [],
  });
  await page.context().addInitScript(() => {
    window.print = () => {};
    window.close = () => {};
  });
  await page.evaluate(() => {
    const originalOpen = window.open.bind(window);
    window.open = (...args) => {
      const printWindow = originalOpen(...args);
      if (printWindow) {
        printWindow.print = () => {};
        printWindow.close = () => {};
      }
      return printWindow;
    };
  });
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Imprimir comprobante", exact: true })
    .click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  assert(
    (await popup.locator("body").innerText()).includes("Acuerdo comercial"),
  );
  await popup.screenshot({
    path: join(evidence, "wholesale-receipt.png"),
    fullPage: true,
  });
  await popup.close();

  await page
    .getByRole("button", { name: "Nueva venta", exact: true })
    .last()
    .click();
  await add(combo, 3);
  await waitTotal(690_000);
  await page
    .getByRole("radio", { name: "Cuotas con tarjeta", exact: true })
    .check();
  await page.getByLabel("Cuotas del cliente", { exact: true }).fill("3");
  await page
    .getByLabel("Procesador / adquirente", { exact: true })
    .fill("Procesador de prueba");
  await waitTotal(707_250);
  await ready();
  const card = await changed("/api/sales", "POST", () => confirm().click());
  assert.equal(card.pricingSnapshot.countedUnits, 6);
  assert.equal(card.items.length, 1);
  assert.equal(card.items[0].qty, 3);
  assert.equal(card.items[0].unitPriceAmountCents, 230_000);
  assert.equal(card.totalAmountCents, 707_250);
  assert.equal(card.finance.cardPlan.deferred, true);

  await page
    .getByRole("button", { name: "Nueva venta", exact: true })
    .last()
    .click();
  await add(a, 1);
  await page
    .getByRole("button", { name: "Transferencia", exact: true })
    .click();
  await waitTotal(100_000);
  await ready();
  const beforeStale = (await request("/api/sales")).length;
  const originalGeneral = await request("/api/price-lists/general");
  await request("/api/price-lists/general", "PATCH", {
    tiers: [
      {
        minimumQty: 1,
        prices: [
          { itemType: "Product", itemId: a.id, priceAmountCents: 110_000 },
        ],
      },
      ...originalGeneral.tiers,
    ],
  });
  const [staleResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/sales" &&
        response.status() === 409,
    ),
    confirm().click(),
  ]);
  assert.equal((await staleResponse.json()).code, "PRICE_CHANGED");
  assert.equal((await request("/api/sales")).length, beforeStale);
  await waitTotal(110_000);
  await ready();
  const reviewed = await changed("/api/sales", "POST", () => confirm().click());
  assert.equal(reviewed.totalAmountCents, 110_000);
  await request("/api/price-lists/general", "PATCH", {
    tiers: originalGeneral.tiers,
  });

  await page
    .getByRole("button", { name: "Nueva venta", exact: true })
    .last()
    .click();
  await add(a, 1);
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  await page.getByLabel("Dinero recibido", { exact: true }).fill("1000");
  await waitTotal(100_000);
  await ready();
  const previousSales = (await request("/api/sales")).length;
  let firstPayload;
  let resolveStored;
  const stored = new Promise((resolve) => {
    resolveStored = resolve;
  });
  await page.route(
    "**/api/sales",
    async (route) => {
      firstPayload = route.request().postDataJSON();
      const response = await route.fetch();
      assert(response.ok());
      const saved = await response.json();
      const general = await request("/api/price-lists/general");
      await request("/api/price-lists/general", "PATCH", {
        tiers: [
          {
            minimumQty: 1,
            prices: [
              { itemType: "Product", itemId: a.id, priceAmountCents: 120_000 },
            ],
          },
          ...general.tiers,
        ],
      });
      await route.abort("failed");
      resolveStored(saved);
    },
    { times: 1 },
  );
  await confirm().click();
  const saved = await stored;
  const recover = page.getByRole("button", {
    name: "Recuperar venta pendiente",
    exact: true,
  });
  await recover.waitFor();
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  const changedQuote = await request("/api/sales/quote", "POST", firstPayload);
  assert.equal(
    changedQuote.cashShortfallAmountCents,
    20_000,
    "Current quote is invalid for tender, but original operation must remain recoverable",
  );
  assert(await recover.isEnabled());
  const [retryResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/sales" &&
        response.request().method() === "POST" &&
        response.ok(),
    ),
    recover.click(),
  ]);
  const retry = await retryResponse.json();
  assert.equal(
    retry.id,
    saved.id,
    "Unknown-response retry must return the original sale despite new list prices",
  );
  assert.equal(
    retryResponse.request().postDataJSON().operationId,
    firstPayload.operationId,
  );
  assert.equal(
    retryResponse.request().postDataJSON().expectedPricingFingerprint,
    firstPayload.expectedPricingFingerprint,
  );
  assert.equal((await request("/api/sales")).length, previousSales + 1);
  await waitTotal(100_000);

  await page.goto(url + "/ventas");
  await page
    .getByText("Acuerdo comercial · 6 unidades", { exact: false })
    .first()
    .waitFor();
  await page.goto(url + "/reportes");
  await page
    .getByText("Acuerdo comercial · 6 unidades", { exact: false })
    .first()
    .waitFor();
  await page.screenshot({
    path: join(evidence, "wholesale-reports-desktop.png"),
    fullPage: true,
  });
  for (let index = 0; index < 26; index++) {
    await request("/api/customers", "POST", {
      name: `Cliente General ${String(index + 1).padStart(2, "0")}`,
      phone: `36241000${String(index).padStart(2, "0")}`,
    });
  }
  const generalCount = (await request("/api/customers?take=500&includeInactive=true"))
    .items.filter((item) => !item.priceListId || item.priceListId === "general").length;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url + "/productos");
  await page
    .getByRole("tab", { name: "Listas de precios", exact: true })
    .click();
  await page.getByRole("region", { name: "Matriz de precios" }).waitFor();
  await assignmentSection.getByText(
    `Se aplica a todos los clientes sin lista particular (${generalCount})`,
    {exact:true},
  ).waitFor();
  assert.equal(await page.getByRole("button", {name:"Asignar cliente",exact:true}).count(), 0);
  listCustomers = await openListCustomers("General");
  assert.equal(await listCustomers.getByRole("listitem").count(), 25);
  assert.equal(await listCustomers.getByRole("button", {name:/^Quitar a /}).count(), 0);
  await listCustomers.getByRole("button", {name:"Siguiente",exact:true}).click();
  await listCustomers.getByText(`${generalCount} registros · Página 2`, {exact:true}).waitFor();
  await listCustomers.getByLabel("Buscar cliente por nombre o celular", {exact:true}).fill("3624100025");
  await listCustomers.getByText("Cliente General 26", {exact:true}).waitFor();
  assert.equal(await listCustomers.getByRole("listitem").count(), 1);
  await listCustomers.getByText("1 registros · Página 1", {exact:true}).waitFor();
  const customersModalBox = await listCustomers.boundingBox();
  assert(customersModalBox && customersModalBox.x >= 0 && customersModalBox.x + customersModalBox.width <= 390);
  await page.screenshot({
    path: join(evidence, "wholesale-customers-general-mobile.png"),
    fullPage: false,
    animations: "disabled",
  });
  await closeListCustomers(listCustomers);
  await assignmentSection.getByText(
    `Se aplica a todos los clientes sin lista particular (${generalCount})`,
    {exact:true},
  ).waitFor();
  await page.getByLabel("Lista de precios", {exact:true}).click();
  await page.getByRole("option", {name:"Nombre posterior",exact:true}).click();
  listCustomers = await openListCustomers("Nombre posterior");
  await listCustomers.getByLabel("Buscar cliente por nombre o celular", {exact:true}).fill(customer.phone);
  const assignedGeneral = await changed(assignmentPath, "PATCH", () =>
    listCustomers.getByRole("button", {name:`Quitar a ${customer.name} de Nombre posterior`,exact:true}).click(),
  );
  assert.equal(assignedGeneral.priceListId ?? null, null);
  await closeListCustomers(listCustomers);
  await openCustomerAssignment();
  assignmentDialog = page.getByRole("dialog", {
    name: "Asignar cliente a Nombre posterior",
    exact: true,
  });
  await assignmentDialog
    .getByLabel("Buscar cliente por nombre o celular", { exact: true })
    .fill("3624000777");
  await assignmentDialog
    .getByRole("button", { name: "Nuevo cliente", exact: true })
    .click();
  createDialog = page.getByRole("dialog", {
    name: "Nuevo cliente para Nombre posterior",
    exact: true,
  });
  assert.equal(
    await createDialog.getByLabel("Nombre", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await createDialog
      .getByLabel("Celular (opcional)", { exact: true })
      .inputValue(),
    "3624000777",
  );
  await createDialog
    .getByRole("button", { name: "Volver a clientes", exact: true })
    .click();
  await assignmentDialog
    .getByRole("button", { name: "Nuevo cliente", exact: true })
    .click();
  createDialog = page.getByRole("dialog", {
    name: "Nuevo cliente para Nombre posterior",
    exact: true,
  });
  await createDialog
    .getByLabel("Nombre", { exact: true })
    .fill("Cliente móvil desde Productos");
  await createDialog.getByLabel("Celular (opcional)", { exact: true }).fill("");
  await page.screenshot({
    path: join(evidence, "wholesale-customer-create-mobile.png"),
    fullPage: false,
    animations: "disabled",
  });
  const mobileCustomer = await changed("/api/customers", "POST", () =>
    createDialog
      .getByRole("button", { name: "Crear y asignar", exact: true })
      .click(),
  );
  assert.equal(mobileCustomer.priceListId, custom.id);
  assert.equal(mobileCustomer.phone ?? null, null);
  await createDialog.waitFor({ state: "hidden" });
  listCustomers = await openListCustomers("Nombre posterior");
  await listCustomers.getByText(mobileCustomer.name, {exact:true}).waitFor();
  await closeListCustomers(listCustomers);
  await openCustomerAssignment();
  await assignmentDialog
    .getByLabel("Buscar cliente por nombre o celular", { exact: true })
    .fill(customer.phone);
  await page.screenshot({
    path: join(evidence, "wholesale-customer-assignment-mobile.png"),
    fullPage: false,
    animations: "disabled",
  });
  const assignedAgain = await changed(assignmentPath, "PATCH", () =>
    assignmentDialog
      .getByRole("button", { name: `Asignar a ${customer.name}`, exact: true })
      .click(),
  );
  assert.equal(assignedAgain.priceListId, custom.id);
  assert.equal(
    (await request(`/api/sales/${direct.id}`)).pricingSnapshot.listName,
    "Acuerdo comercial",
  );
  const searchBox = await page
    .getByRole("textbox", { name: "Buscar producto o combo", exact: true })
    .boundingBox();
  assert(
    searchBox && searchBox.width >= 200,
    "Mobile price-list search must keep a usable input width",
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Lists must not overflow mobile viewport",
  );
  await page.screenshot({
    path: join(evidence, "wholesale-lists-mobile.png"),
    fullPage: true,
  });
  await page.goto(url + "/nueva-venta");
  await page.waitForLoadState("networkidle");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Checkout must not overflow mobile viewport",
  );
  await page.screenshot({
    path: join(evidence, "wholesale-checkout-mobile.png"),
    fullPage: true,
  });
  return {
    success: true,
    management: "passed",
    effectiveBlankPrice: "passed",
    unsavedNavigationAndTabs: "passed",
    customerAssignmentFromProducts: "passed",
    customerSummaryAndModal: "passed",
    customerSearchAndPagination: "passed",
    generalCustomersReadOnly: "passed",
    customerEditPreservesPriceList: "passed",
    customerCreationFromProducts: "passed",
    mixedQuantityCustomerPrices: "passed",
    directCoupon: direct.number,
    comboCard: card.number,
    changedPriceLostResponseRetry: "passed",
    staleQuoteReview: "passed",
    unavailableComboDoesNotBlockCheckout: "passed",
    expectedApiErrors: [
      `503 ${url}${assignmentPath}`,
      `503 ${url}/api/customers`,
      `409 ${url}/api/sales`,
    ],
    historicalPrintReports: "passed",
    viewports: [1440, 390],
  };
};
