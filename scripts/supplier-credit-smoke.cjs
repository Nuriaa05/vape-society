const assert = require("node:assert/strict");
const {join} = require("node:path");

module.exports = async ({page,url,request,prisma,category,supplier,evidence}) => {
  const {expect} = require("../frontend/node_modules/playwright/test");
  const product = await request("/api/products", "POST", {
    name:"Mercadería financiada",categoryId:category.id,supplierId:supplier.id,
    costAmountCents:10001,priceAmountCents:20000,marginPct:100,physicalStock:0,minStock:1,
  });
  const today = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const stockEntry = await require("./stock-entry-smoke.cjs")({page,url,request,prisma,evidence});
  async function go(route) {
    await page.goto(url+route);
    await page.waitForLoadState("networkidle");
  }
  async function select(scope, label, value) {
    await scope.getByRole("combobox", {name:label,exact:true}).click();
    await page.getByRole("option", {name:value,exact:true}).click();
  }
  async function screenshot(name) {
    await page.screenshot({path:join(evidence,`supplier-${name}.png`),fullPage:true,animations:"disabled"});
    if (await page.getByRole("dialog").count()===1) await page.getByRole("dialog").screenshot({path:join(evidence,`supplier-${name}-dialog.png`),animations:"disabled"});
  }
  async function stock() {return (await request("/api/stock")).find(p=>p.productId===product.id);}
  async function openAccount() {
    await go("/proveedores");
    await page.getByRole("row").filter({hasText:supplier.name}).getByRole("button",{name:"Ver cuenta",exact:true}).click();
    const dialog=page.getByRole("dialog");
    await expect(dialog.getByRole("heading",{name:`Cuenta de ${supplier.name}`})).toBeVisible();
    return dialog;
  }

  let dialog=await openAccount();
  await dialog.getByRole("link",{name:"Registrar compra",exact:true}).click();
  await expect(page.getByRole("combobox").first()).toContainText(supplier.name);
  await expect(page.getByRole("combobox",{name:"Medio de pago",exact:true})).toHaveCount(0);
  await expect(page.getByLabel("Referencia de pago (opcional)",{exact:true})).toHaveCount(0);
  await select(page,"Condición de pago","A crédito");
  await page.getByLabel("Vencimiento del pago").fill("2026-12-31");
  await page.getByRole("button",{name:"Agregar producto",exact:true}).click();
  await page.getByRole("spinbutton").fill("10");
  const purchaseSummary=page.getByLabel("Resumen de esta compra",{exact:true});
  await expect(purchaseSummary.getByText("Queda por pagar",{exact:true})).toBeVisible();
  await expect(purchaseSummary.getByText("10 unidades",{exact:true})).toBeVisible();
  await expect(purchaseSummary.getByText("$1.000,10",{exact:true})).toBeVisible();
  await screenshot("compra-credito");
  await page.getByRole("button",{name:"Registrar compra",exact:true}).click();
  await expect(page.getByRole("row").filter({hasText:"10× Mercadería financiada"})).toBeVisible();
  assert.equal((await stock()).creditQty,10);
  const purchase=(await prisma.purchase.findFirst({where:{supplierId:supplier.id},include:{payable:true}}));
  assert.equal(purchase.payable.amountCents,100010);

  await request("/api/sales","POST",{paymentMethodId:"pm2",deliveryStatus:"Entregado",items:[{productId:product.id,qty:4}]});
  assert.equal((await stock()).creditQty,6);
  await go("/stock");
  await expect(page.getByRole("columnheader",{name:"A crédito",exact:true})).toBeVisible();
  await screenshot("stock-credito");

  dialog=await openAccount();
  await expect(dialog.getByText("$1.000,10",{exact:true}).first()).toBeVisible();
  await dialog.getByRole("button",{name:"Registrar pago",exact:true}).click();
  await select(dialog,"Medio","Transferencia");
  await dialog.getByLabel("Referencia (opcional)").fill("Pago QA");
  await dialog.getByRole("button",{name:"Revisar movimiento",exact:true}).click();
  assert.equal(await prisma.supplierPayment.count({where:{payableId:purchase.payable.id}}),0,"Review must not save a payment");
  await dialog.getByRole("button",{name:"Volver a editar",exact:true}).click();
  await expect(dialog.getByLabel("Referencia (opcional)")).toHaveValue("Pago QA");
  await dialog.getByRole("button",{name:"Revisar movimiento",exact:true}).click();
  await screenshot("pago");
  await dialog.getByRole("button",{name:"Registrar pago completo",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"Registrar pago",exact:true})).toHaveCount(0);
  assert.equal((await stock()).paidQty,6);
  assert.equal((await stock()).physicalStock,6);
  assert.equal(await prisma.supplierPayment.count({where:{payableId:purchase.payable.id}}),1);
  await dialog.getByRole("button",{name:"Ver historial completo",exact:true}).click();
  await dialog.locator("summary").filter({hasText:"Pagos y reintegros"}).click();
  await dialog.getByRole("button",{name:"Revertir pago",exact:true}).click();
  await dialog.getByLabel("Motivo",{exact:true}).fill("Pago registrado por error");
  await dialog.locator("form").getByRole("button",{name:"Revertir pago",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"Registrar pago",exact:true})).toBeVisible();
  assert.equal((await stock()).creditQty,6);

  await dialog.getByRole("button",{name:"Cargar deuda anterior",exact:true}).click();
  await dialog.getByLabel("Detalle de la deuda",{exact:true}).fill("Saldo anterior de mercadería");
  await dialog.getByLabel("Importe total en pesos",{exact:true}).fill("500");
  await dialog.getByLabel("Vencimiento",{exact:true}).fill("2026-12-31");
  await dialog.getByRole("button",{name:"Cargar deuda anterior",exact:true}).click();
  await expect(dialog.getByRole("heading",{name:"Saldo anterior de mercadería",exact:true})).toBeVisible();
  const oldProduct=await request("/api/products","POST",{name:"Mercadería anterior",categoryId:category.id,supplierId:supplier.id,costAmountCents:10000,priceAmountCents:15000,marginPct:50,physicalStock:3,minStock:0});
  await go("/stock");
  const oldRow=page.getByRole("row").filter({hasText:"Mercadería anterior"});
  await oldRow.getByRole("button").last().click();
  await page.getByRole("menuitem",{name:"Clasificar"}).click();
  dialog=page.getByRole("dialog");
  await dialog.getByRole("radio",{name:"A crédito",exact:true}).check();
  await expect(dialog.getByLabel("Unidades",{exact:true})).toHaveValue("3");
  await expect(dialog.getByRole("combobox",{name:"Proveedor al que le debés",exact:true})).toContainText(supplier.name);
  await expect(dialog.getByText("Saldo anterior de mercadería",{exact:true})).toBeVisible();
  await dialog.getByRole("button",{name:"Revisar cambio",exact:true}).click();
  assert.equal((await request("/api/stock")).find(p=>p.productId===oldProduct.id).creditQty,0,"Review must not change stock");
  await screenshot("estado-pago-revision");
  await dialog.getByRole("button",{name:"Confirmar estado de pago",exact:true}).click();
  await expect(dialog).toHaveCount(0);
  assert.deepEqual((await request("/api/stock")).find(p=>p.productId===oldProduct.id).creditQty,3);
  assert.equal((await request("/api/stock")).find(p=>p.productId===oldProduct.id).physicalStock,3,"Classifying must not add stock");

  const newSupplier=await request("/api/suppliers","POST",{name:"Proveedor sin deuda anterior",phone:"456",email:""});
  const initialProduct=await request("/api/products","POST",{name:"Stock anterior para identificar",categoryId:category.id,supplierId:newSupplier.id,costAmountCents:10000,priceAmountCents:15000,marginPct:50,physicalStock:2,minStock:0});
  async function openInitialStock() {
    await go("/stock");
    await page.getByRole("row").filter({hasText:initialProduct.name}).getByRole("button",{name:"Acciones",exact:true}).click();
    await page.getByRole("menuitem",{name:"Clasificar",exact:true}).click();
    return page.getByRole("dialog");
  }
  dialog=await openInitialStock();
  await expect(dialog.getByRole("button",{name:"Revisar cambio",exact:true})).toBeDisabled();
  await screenshot("estado-pago-inicio");
  await dialog.getByRole("radio",{name:"A crédito",exact:true}).check();
  await dialog.getByLabel("Unidades",{exact:true}).fill("1");
  await dialog.getByLabel("Costo por unidad",{exact:true}).fill("90");
  await expect(dialog.getByRole("button",{name:"Cargar lo que le debo",exact:true})).toBeVisible();
  await screenshot("estado-pago-sin-deuda");
  await page.setViewportSize({width:390,height:844});
  await expect(dialog.getByRole("button",{name:"Revisar cambio",exact:true})).toBeInViewport();
  await screenshot("estado-pago-mobile");
  await page.setViewportSize({width:1280,height:800});
  await dialog.getByRole("button",{name:"Cargar lo que le debo",exact:true}).click();
  await expect(dialog.getByRole("heading",{name:`Deuda anterior con ${newSupplier.name}`,exact:true})).toBeVisible();
  await expect(dialog.getByLabel("Deuda total con el proveedor",{exact:true})).toHaveValue("");
  await dialog.getByLabel("Deuda total con el proveedor",{exact:true}).fill("300");
  await dialog.getByLabel("Vencimiento",{exact:true}).fill("2026-12-31");
  await screenshot("deuda-desde-stock");
  await page.route("**/api/supplier-payables/opening",async route=>{await route.fetch();await route.abort("failed");},{times:1});
  await dialog.getByRole("button",{name:"Cargar deuda anterior",exact:true}).click();
  await expect(page.getByText("No se pudo guardar el movimiento.",{exact:true})).toBeVisible();
  assert.equal(await prisma.supplierPayable.count({where:{supplierId:newSupplier.id}}),1);
  await dialog.getByRole("button",{name:"Cargar deuda anterior",exact:true}).click();
  await expect(dialog.getByRole("heading",{name:"Estado de pago de la mercadería",exact:true})).toBeVisible();
  await expect(dialog.getByLabel("Unidades",{exact:true})).toHaveValue("1");
  await expect(dialog.getByLabel("Costo por unidad",{exact:true})).toHaveValue("90");
  assert.equal(await prisma.supplierPayable.count({where:{supplierId:newSupplier.id}}),1,"Retry must not duplicate the opening debt");
  await dialog.getByRole("button",{name:"Revisar cambio",exact:true}).click();
  await page.route("**/api/stock/classifications",async route=>{await route.fetch();await route.abort("failed");},{times:1});
  await dialog.getByRole("button",{name:"Confirmar estado de pago",exact:true}).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  assert.equal(await prisma.stockMovement.count({where:{productId:initialProduct.id,sourceType:"StockClassification"}}),1);
  await dialog.getByRole("button",{name:"Confirmar estado de pago",exact:true}).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(await prisma.stockMovement.count({where:{productId:initialProduct.id,sourceType:"StockClassification"}}),1,"Retry must not duplicate the classification");
  await request("/api/supplier-payables/opening","POST",{operationId:"second-stock-opening-qa",supplierId:newSupplier.id,title:"Otra deuda del mismo proveedor",amountCents:20000,dueDate:"2026-12-31"});
  dialog=await openInitialStock();
  await dialog.getByRole("radio",{name:"A crédito",exact:true}).check();
  await expect(dialog.getByRole("button",{name:"Revisar cambio",exact:true})).toBeDisabled();
  await dialog.getByRole("combobox",{name:"¿A qué deuda pertenecen?",exact:true}).click();
  await expect(page.getByRole("option").filter({hasText:"Saldo anterior de mercadería"})).toHaveCount(0);
  await page.getByRole("option",{name:/Otra deuda del mismo proveedor/}).click();
  await expect(dialog.getByRole("button",{name:"Revisar cambio",exact:true})).toBeEnabled();
  await dialog.getByRole("radio",{name:"Pagada",exact:true}).check();
  await dialog.getByRole("button",{name:"Revisar cambio",exact:true}).click();
  await dialog.getByRole("button",{name:"Confirmar estado de pago",exact:true}).click();
  await expect(dialog).toHaveCount(0);
  const initialStock=(await request("/api/stock")).find(p=>p.productId===initialProduct.id);
  assert.equal(initialStock.physicalStock,2);
  assert.equal(initialStock.paidQty,1);
  assert.equal(initialStock.creditQty,1);
  assert.equal((await request(`/api/supplier-payables/account/${newSupplier.id}`)).balanceCents,50000,"Identifying stock must not cancel supplier debts");

  const paidProduct=await request("/api/products","POST",{name:"Compra para reintegrar",categoryId:category.id,supplierId:supplier.id,costAmountCents:700,priceAmountCents:1000,marginPct:50,physicalStock:0,minStock:0});
  await go("/compras");
  await page.getByRole("combobox").first().click();
  await page.getByRole("option",{name:supplier.name,exact:true}).click();
  await select(page,"Condición de pago","Pagada");
  await page.getByLabel("Fecha de pago",{exact:true}).fill(today);
  await expect(page.getByRole("combobox",{name:"Medio de pago",exact:true})).toHaveCount(0);
  await expect(page.getByLabel("Referencia de pago (opcional)",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Agregar producto",exact:true}).click();
  const itemRow=page.getByRole("row").filter({has:page.getByRole("spinbutton")});
  await itemRow.getByRole("combobox").click();
  await page.getByRole("option",{name:paidProduct.name,exact:true}).click();
  await screenshot("compra-pagada");
  await page.getByRole("button",{name:"Guardar borrador",exact:true}).click();
  const paidRow=page.getByRole("row").filter({hasText:"1× Compra para reintegrar"});
  await expect(paidRow).toBeVisible();
  await paidRow.getByRole("button",{name:"Acciones",exact:true}).click();
  await page.getByRole("menuitem",{name:"Editar",exact:true}).click();
  dialog=page.getByRole("dialog");
  await expect(dialog.getByRole("combobox",{name:"Medio de pago",exact:true})).toHaveCount(0);
  await expect(dialog.getByLabel("Referencia de pago (opcional)",{exact:true})).toHaveCount(0);
  await expect(dialog.getByLabel("Fecha de pago",{exact:true})).toBeVisible();
  await screenshot("editar-compra-pagada");
  await dialog.getByRole("button",{name:"Guardar y registrar",exact:true}).click();
  await expect(dialog).toHaveCount(0);
  const paidPurchase=(await prisma.purchase.findFirst({where:{items:{some:{productId:paidProduct.id}}},include:{payable:{include:{payments:true}}}}));
  assert.equal(paidPurchase.paymentMethod,null);
  assert.equal(paidPurchase.paymentReference,null);
  assert.equal(paidPurchase.payable.payments[0].method,"Sin especificar");
  await paidRow.getByRole("button",{name:"Acciones",exact:true}).click();
  await page.getByRole("menuitem",{name:"Anular compra"}).click();
  dialog=page.getByRole("alertdialog");
  await dialog.locator("textarea").fill("Mercadería retirada por proveedor");
  await dialog.getByRole("button",{name:"Confirmar anulación",exact:true}).click();
  await expect(dialog).toHaveCount(0);
  dialog=await openAccount();
  await dialog.getByRole("button",{name:"Recibir reintegro",exact:true}).click();
  await dialog.getByRole("button",{name:"Revisar movimiento",exact:true}).click();
  await dialog.getByRole("button",{name:"Recibir reintegro completo",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"Recibir reintegro",exact:true})).toHaveCount(0);
  await screenshot("cuenta");
  await dialog.getByRole("button",{name:"Cerrar",exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await select(page,"Filtrar proveedores","Al día");
  await expect(page.getByRole("row").filter({hasText:supplier.name})).toHaveCount(0);
  await select(page,"Filtrar proveedores","Todos los proveedores");
  await page.getByLabel("Buscar proveedor",{exact:true}).fill("no existe este proveedor");
  await expect(page.getByText("No hay proveedores que coincidan con los filtros.",{exact:true})).toBeVisible();
  await page.getByLabel("Buscar proveedor",{exact:true}).fill(supplier.name);
  await expect(page.getByRole("row").filter({hasText:supplier.name})).toBeVisible();
  await page.getByLabel("Buscar proveedor",{exact:true}).fill("");
  await screenshot("proveedores-desktop");
  dialog=await openAccount();
  await page.setViewportSize({width:390,height:844});
  await screenshot("cuenta-mobile");
  await expect(dialog).toBeVisible();
  const bounds=await dialog.boundingBox();
  assert(bounds.x>=0 && bounds.x+bounds.width<=391,"Account modal exceeds mobile viewport");
  await page.keyboard.press("Escape");
  for (const route of ["/compras","/proveedores","/stock"]) {
    await go(route);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`Mobile overflow ${route}`);
    await screenshot(route.slice(1)+"-mobile");
  }
  return {ok:true,stockEntry,flows:["compra a crédito","FIFO al vender","pago total y reversión","deuda anterior y estado de pago","deuda desde Stock sin perder datos","reintentos sin duplicar deuda ni stock","compra pagada, anulación y reintegro"],mobileWidth:390};
};
