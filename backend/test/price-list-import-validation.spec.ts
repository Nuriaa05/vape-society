import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { validateImportData } from "../src/modules/backups/sqlite-import";
import { createLegacyBackup } from "./legacy-test-database";

describe("Wholesale backup consistency", () => {
  let directory: string;
  let path: string;
  const snapshot = () => ({
    listId: "general",
    listName: "General original",
    countedUnits: 1,
    globalMinimumQty: 1,
    fingerprint: "a".repeat(64),
    lines: [
      {
        itemType: "Product",
        itemId: "pricing-product",
        qty: 1,
        basePriceAmountCents: 11_000,
        appliedPriceAmountCents: 10_000,
        origin: "List",
        effectiveMinimumQty: 1,
        components: [],
      },
    ],
  });

  function update(sql: string) {
    const database = new DatabaseSync(path);
    try {
      database.exec("PRAGMA ignore_check_constraints = ON");
      database.exec(sql);
    } finally {
      database.close();
    }
  }
  function saveSnapshot(value: unknown) {
    const database = new DatabaseSync(path);
    try {
      database
        .prepare("UPDATE Sale SET pricingSnapshot = ? WHERE id = 'legacy-sale'")
        .run(typeof value === "string" ? value : JSON.stringify(value));
    } finally {
      database.close();
    }
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "vape-pricing-import-"));
    path = join(directory, "pricing.db");
    createLegacyBackup(path, "99999999999999");
    update(`
      INSERT INTO Category (id,name,updatedAt) VALUES ('pricing-category','Prueba',CURRENT_TIMESTAMP);
      INSERT INTO Supplier (id,name,phone,email,updatedAt) VALUES ('pricing-supplier','Prueba','','',CURRENT_TIMESTAMP);
      INSERT INTO Product (id,name,categoryId,supplierId,costAmountCents,priceAmountCents,marginPct,physicalStock,minStock,updatedAt)
        VALUES ('pricing-product','Producto','pricing-category','pricing-supplier',100,11000,50,0,0,CURRENT_TIMESTAMP);
      INSERT INTO PriceListTier (id,priceListId,minimumQty) VALUES ('pricing-tier','general',1);
      INSERT INTO PriceListPrice (id,tierId,productId,priceAmountCents)
        VALUES ('pricing-price','pricing-tier','pricing-product',10000);
      INSERT INTO SaleItem (id,saleId,productId,productName,barcode,qty,unitPriceAmountCents,lineTotalAmountCents)
        VALUES ('pricing-item','legacy-sale','pricing-product','Producto','',1,10000,10000);
    `);
    saveSnapshot(snapshot());
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("accepts configured lists and a self-consistent historical snapshot", () => {
    expect(validateImportData(path, path)).toMatchObject({
      sales: 1,
      products: 1,
    });
  });

  it("keeps historical prices valid after the current list and catalog change", () => {
    update(
      "UPDATE PriceList SET name = 'Nombre actual'; UPDATE PriceListPrice SET priceAmountCents = 9000; UPDATE Product SET priceAmountCents = 20000;",
    );
    expect(() => validateImportData(path, path)).not.toThrow();
    update("DELETE FROM PriceListPrice; DELETE FROM PriceListTier;");
    expect(() => validateImportData(path, path)).not.toThrow();
  });

  it("allows legacy sales with no inferred price snapshot", () => {
    update("UPDATE Sale SET pricingSnapshot = NULL");
    expect(() => validateImportData(path, path)).not.toThrow();
  });

  it("validates combo units against original components instead of today's composition", () => {
    update(`INSERT INTO Combo (id,name,priceAmountCents,updatedAt) VALUES ('historical-pack','Pack',5000,CURRENT_TIMESTAMP);
      INSERT INTO ComboItem (id,comboId,productId,qty) VALUES ('current-component','historical-pack','pricing-product',1);
      UPDATE SaleItem SET itemType='Combo',productId=NULL,comboId='historical-pack',qty=2,unitPriceAmountCents=5000 WHERE id='pricing-item';
      INSERT INTO SaleItemComponent (id,saleItemId,productId,productName,barcode,qtyPerCombo,totalQty)
        VALUES ('historical-component','pricing-item','pricing-product','Producto','',3,6);`);
    saveSnapshot({
      ...snapshot(),
      countedUnits: 6,
      lines: [
        {
          ...snapshot().lines[0],
          itemType: "Combo",
          itemId: "historical-pack",
          qty: 2,
          appliedPriceAmountCents: 5000,
          components: [{ productId: "pricing-product", qtyPerCombo: 3 }],
        },
      ],
    });
    expect(() => validateImportData(path, path)).not.toThrow();
    update("UPDATE SaleItemComponent SET qtyPerCombo = 2, totalQty = 4");
    expect(() => validateImportData(path, path)).toThrow();
  });

  it.each([
    "UPDATE PriceList SET active = 0 WHERE id = 'general'",
    "UPDATE PriceList SET isGeneral = 0 WHERE id = 'general'",
    "UPDATE PriceList SET name = '   '",
    "UPDATE PriceListTier SET minimumQty = 0",
    "UPDATE PriceListPrice SET priceAmountCents = -1",
    "UPDATE PriceListPrice SET productId = NULL",
  ])("rejects invalid list configuration: %s", (sql) => {
    update(sql);
    expect(() => validateImportData(path, path)).toThrow();
  });

  it("rejects a customer assigned to an archived list", () => {
    update(`INSERT INTO PriceList (id,name,active,updatedAt) VALUES ('archived-list','Anterior',0,CURRENT_TIMESTAMP);
      INSERT INTO Customer (id,name,priceListId,updatedAt) VALUES ('pricing-customer','Ana','archived-list',CURRENT_TIMESTAMP);`);
    expect(() => validateImportData(path, path)).toThrow();
  });

  it.each([
    { countedUnits: 2 },
    { globalMinimumQty: 2 },
    { lines: [] },
    { fingerprint: "invalid" },
    { lines: [{ ...snapshot().lines[0], appliedPriceAmountCents: 9999 }] },
    { lines: [{ ...snapshot().lines[0], qty: 2 }] },
    { lines: [{ ...snapshot().lines[0], origin: "Catalog" }] },
    { lines: [{ ...snapshot().lines[0], effectiveMinimumQty: 2 }] },
  ])("rejects a snapshot that disagrees with the actual sale (%j)", (patch) => {
    saveSnapshot({ ...snapshot(), ...patch });
    expect(() => validateImportData(path, path)).toThrow();
  });

  it("rejects malformed snapshot JSON", () => {
    saveSnapshot("{invalid");
    expect(() => validateImportData(path, path)).toThrow();
  });
});
