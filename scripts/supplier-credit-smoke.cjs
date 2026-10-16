const assert = require("node:assert/strict");
const {join} = require("node:path");

module.exports = async ({page,url,request,prisma,category,supplier,evidence}) => {
  const {expect} = require("../frontend/node_modules/playwright/test");
  const product = await request("/api/products", "POST", {
    name:"Mercadería financiada",categoryId:category.id,supplierId:supplier.id,
    costAmountCents:10001,priceAmountCents:20000,marginPct:100,physicalStock:0,minStock:1,
  });
  const today = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  async function go(route) {
    await page.goto(url+route);
    await page.waitForLoadState("networkidle");
  }
  async function select(scope, label, value) {
    await scope.getByRole("combobox", {name:label,exact:true}).click();
    await page.getByRole("option", {name:value,exact:true}).click();
  }
  async function screenshot(name) {
    await page.screenshot({path:join(evidence,`supplier-${name}.png`),fullPage:true});
  }
  async function stock() {return (await request("/api/stock")).find(p=>p.productId===product.id);}
  async function openAccount() {
    await go("/proveedores");
    await page.getByRole("row").filter({hasText:supplier.name}).getByRole("button",{name:"Cuenta",exact:true}).click();
    const dialog=page.getByRole("dialog");
    await expect(dialog.getByRole("heading",{name:`Cuenta de ${supplier.name}`})).toBeVisible();
    return dialog;
  }

  await go("/compras");
  await expect(page.getByRole("combobox",{name:"Medio de pago",exact:true})).toHaveCount(0);
  await expect(page.getByLabel("Referencia de pago (opcional)",{exact:true})).toHaveCount(0);
  await page.getByRole("combobox").first().click();
  await page.getByRole("option",{name:supplier.name,exact:true}).click();
  await select(page,"Condición de pago","A crédito");
  await page.getByLabel("Vencimiento del pago único").fill("2026-12-31");
  await page.getByRole("button",{name:"Agregar producto",exact:true}).click();
  await page.getByRole("spinbutton").fill("10");
  await screenshot("compra-credito");
  await page.getByRole("button",{name:"Registrar compra",exact:true}).click();
  await expect(page.getByRole("row").filter({hasText:"10× Mercadería financiada"})).toBeVisible();
  assert.equal((await stock()).creditQty,10);
  const purchase=(await prisma.purchase.findFirst({where:{supplierId:supplier.id},include:{payable:true}}));
  assert.equal(purchase.payable.amountCents,100010);

  await request("/api/sales","POST",{paymentMethodId:"pm2",deliveryStatus:"Entregado",items:[{productId:product.id,qty:4}]});
  assert.equal((await stock()).creditQty,6);
  await go("/stock");
  await expect(page.getByRole("columnheader",{name:"A crédito / valor",exact:true})).toBeVisible();
  await screenshot("stock-credito");

  let dialog=await openAccount();
  await expect(dialog.getByText("$1.000,10",{exact:true}).first()).toBeVisible();
  await dialog.getByRole("button",{name:"Pagar total",exact:true}).click();
  await select(dialog,"Medio","Transferencia");
  await dialog.getByLabel("Referencia (opcional)").fill("Pago QA");
  await screenshot("pago");
  await dialog.getByRole("button",{name:"Registrar pago completo",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"Pagar total",exact:true})).toHaveCount(0);
  assert.equal((await stock()).paidQty,6);
  await dialog.locator("summary").click();
  await dialog.getByRole("button",{name:"Revertir pago",exact:true}).click();
  await dialog.getByLabel("Motivo",{exact:true}).fill("Pago registrado por error");
  await dialog.locator("form").getByRole("button",{name:"Revertir pago",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"Pagar total",exact:true})).toBeVisible();
  assert.equal((await stock()).creditQty,6);

  await dialog.getByRole("button",{name:"Cargar deuda inicial",exact:true}).click();
  await dialog.getByLabel("Detalle de la deuda",{exact:true}).fill("Saldo anterior de mercadería");
  await dialog.getByLabel("Importe total en pesos",{exact:true}).fill("500");
  await dialog.getByLabel("Vencimiento",{exact:true}).fill("2026-12-31");
  await dialog.getByRole("button",{name:"Cargar deuda inicial",exact:true}).click();
  await expect(dialog.getByRole("heading",{name:"Saldo anterior de mercadería",exact:true})).toBeVisible();
  const oldProduct=await request("/api/products","POST",{name:"Mercadería anterior",categoryId:category.id,supplierId:supplier.id,costAmountCents:10000,priceAmountCents:15000,marginPct:50,physicalStock:3,minStock:0});
  await go("/stock");
  const oldRow=page.getByRole("row").filter({hasText:"Mercadería anterior"});
  await oldRow.getByRole("button").last().click();
  await page.getByRole("menuitem",{name:"Clasificar stock existente"}).click();
  dialog=page.getByRole("dialog");
  await dialog.getByLabel("Cantidad a clasificar").fill("3");
  await select(dialog,"Clasificación","A crédito");
  await dialog.getByRole("combobox",{name:"Deuda que financia este stock"}).click();
  await page.getByRole("option").filter({hasText:"Saldo anterior de mercadería"}).click();
  await dialog.getByLabel("Motivo",{exact:true}).fill("Inventario anterior a la actualización");
  await dialog.getByRole("button",{name:"Clasificar stock",exact:true}).click();
  await expect(dialog).toHaveCount(0);
  assert.deepEqual((await request("/api/stock")).find(p=>p.productId===oldProduct.id).creditQty,3);

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
  await dialog.getByRole("button",{name:"Recibir reintegro completo",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"Recibir reintegro",exact:true})).toHaveCount(0);
  await screenshot("cuenta");
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
  return {ok:true,flows:["compra a crédito","FIFO al vender","pago total y reversión","deuda inicial y clasificación","compra pagada, anulación y reintegro"],mobileWidth:390};
};
