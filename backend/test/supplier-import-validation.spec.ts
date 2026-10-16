import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateSupplierInventoryImport } from "../src/modules/backups/supplier-import-validation";

const migrations = join(__dirname, "../prisma/migrations");
function schema(database: DatabaseSync, includeCredit = true) {
  for (const name of readdirSync(migrations)
    .sort()
    .filter((n) => /^\d/.test(n))) {
    if (!includeCredit && name >= "20261015010000_supplier_credit") continue;
    database.exec(
      readFileSync(join(migrations, name, "migration.sql"), "utf8"),
    );
  }
}
function base(database: DatabaseSync) {
  database.exec(`
    INSERT INTO Supplier(id,name,phone,email,updatedAt) VALUES('s','Proveedor','','',CURRENT_TIMESTAMP);
    INSERT INTO Category(id,name,updatedAt) VALUES('c','Categoría',CURRENT_TIMESTAMP);
    INSERT INTO Product(id,name,categoryId,costAmountCents,priceAmountCents,marginPct,physicalStock,updatedAt)
      VALUES('p','Producto','c',10001,20000,100,10,CURRENT_TIMESTAMP);
    INSERT INTO Purchase(id,supplierId,date,status,totalAmountCents,updatedAt)
      VALUES('old','s',CURRENT_TIMESTAMP,'Registrada',100010,CURRENT_TIMESTAMP);
    INSERT INTO PurchaseItem(id,purchaseId,productId,productName,qty,unitCostAmountCents,lineTotalAmountCents)
      VALUES('old-item','old','p','Producto',10,10001,100010);
  `);
}

describe("supplier inventory backup integrity", () => {
  let database: DatabaseSync;
  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    schema(database, false);
    base(database);
    database.exec(
      readFileSync(
        join(migrations, "20261015010000_supplier_credit/migration.sql"),
        "utf8",
      ),
    );
    database.exec(`
      INSERT INTO Purchase(id,supplierId,date,status,totalAmountCents,paymentCondition,dueDate,updatedAt)
        VALUES('new','s',CURRENT_TIMESTAMP,'Registrada',30003,'Credito','2026-12-31',CURRENT_TIMESTAMP);
      INSERT INTO PurchaseItem(id,purchaseId,productId,productName,qty,unitCostAmountCents,lineTotalAmountCents)
        VALUES('new-item','new','p','Producto',3,10001,30003);
      INSERT INTO SupplierPayable(id,supplierId,purchaseId,title,amountCents,dueDate)
        VALUES('payable','s','new','Compra nueva',30003,'2026-12-31');
      INSERT INTO StockMovement(id,productId,type,sourceType,sourceId,physicalDelta)
        VALUES('movement','p','Compra','Purchase','new',3);
      INSERT INTO InventoryLot(id,productId,purchaseItemId,payableId,originMovementId,classification,unitCostAmountCents,receivedAt,initialQty,remainingQty)
        VALUES('lot','p','new-item','payable','movement','Credito',10001,CURRENT_TIMESTAMP,3,3);
      UPDATE Product SET physicalStock=13 WHERE id='p';
    `);
  });
  afterEach(() => database.close());
  it("accepts a paid purchase registered without payment method or reference", () => {
    database.exec(`
      UPDATE Purchase SET paymentCondition='Pagada',paymentDate='2026-01-15',dueDate=NULL WHERE id='new';
      INSERT INTO SupplierPayment(id,payableId,date,method,amountCents)
        VALUES('payment','payable','2026-01-15','Sin especificar',30003);
      UPDATE InventoryLot SET classification='Pagada' WHERE id='lot';
    `);
    expect(() => validateSupplierInventoryImport(database)).not.toThrow();
  });
  it("accepts canceled financed drafts that never entered stock or generated a debt", () => {
    database.exec(`DELETE FROM InventoryLot WHERE id='lot';
      DELETE FROM SupplierPayable WHERE id='payable';
      DELETE FROM StockMovement WHERE id='movement';
      UPDATE Product SET physicalStock=10 WHERE id='p';
      UPDATE Purchase SET status='Anulada',cancelReason='Borrador descartado',cancelledAt=CURRENT_TIMESTAMP WHERE id='new'`);
    expect(() => validateSupplierInventoryImport(database)).not.toThrow();
  });
  it("backfills actual stock without inferring old debt or payments", () => {
    expect(
      database
        .prepare("SELECT paymentCondition FROM Purchase WHERE id='old'")
        .get(),
    ).toEqual({ paymentCondition: "SinSeguimiento" });
    expect(
      database
        .prepare(
          "SELECT classification,initialQty,remainingQty,unitCostAmountCents FROM InventoryLot WHERE purchaseItemId IS NULL",
        )
        .get(),
    ).toEqual({
      classification: "SinClasificar",
      initialQty: 10,
      remainingQty: 10,
      unitCostAmountCents: 10001,
    });
    expect(
      database.prepare("SELECT COUNT(*) AS n FROM SupplierPayment").get()!.n,
    ).toBe(0);
    expect(() => validateSupplierInventoryImport(database)).not.toThrow();
  });
  it.each([
    [
      "unspecified payment method for a credit debt",
      "INSERT INTO SupplierPayment(id,payableId,date,method,amountCents) VALUES('payment','payable','2026-01-15','Sin especificar',30003); UPDATE InventoryLot SET classification='Pagada' WHERE id='lot'",
    ],
    [
      "physical/lot mismatch",
      "UPDATE Product SET physicalStock=14 WHERE id='p'",
    ],
    [
      "lot ledger mismatch",
      "UPDATE InventoryLot SET initialQty=4 WHERE id='lot'",
    ],
    [
      "credit without debt",
      "UPDATE InventoryLot SET payableId=NULL WHERE id='lot'",
    ],
    [
      "wrong purchase total",
      "UPDATE SupplierPayable SET amountCents=1 WHERE id='payable'",
    ],
    [
      "partial supplier payment",
      "INSERT INTO SupplierPayment(id,payableId,date,method,amountCents) VALUES('payment','payable','2026-01-01','Efectivo',1)",
    ],
    [
      "settled purchase still credit",
      "INSERT INTO SupplierPayment(id,payableId,date,method,amountCents) VALUES('payment','payable','2026-01-01','Efectivo',30003)",
    ],
    [
      "refund on active debt",
      "INSERT INTO SupplierRefund(id,payableId,date,method,amountCents) VALUES('refund','payable','2026-01-01','Efectivo',30003)",
    ],
    [
      "invalid business date",
      "UPDATE SupplierPayable SET dueDate='2026-02-30' WHERE id='payable'",
    ],
    [
      "allocation against another product",
      "INSERT INTO Product(id,name,categoryId,costAmountCents,priceAmountCents,marginPct,physicalStock,updatedAt) VALUES('p2','Otro','c',1,1,0,0,CURRENT_TIMESTAMP); UPDATE StockMovement SET productId='p2' WHERE id='movement'",
    ],
    [
      "missing idempotent result",
      "INSERT INTO FinancialOperation(operationId,kind,payload,resultId) VALUES('retry','SupplierPayment','{}','missing')",
    ],
  ])("rejects %s", (_name, sql) => {
    database.exec(sql);
    expect(() => validateSupplierInventoryImport(database)).toThrow();
  });
  it("accepts an original payment and its reversal without losing pending stock", () => {
    database.exec(
      "INSERT INTO SupplierPayment(id,payableId,date,method,amountCents,reversedAt,reversalReason) VALUES('payment','payable','2026-01-01','Efectivo',30003,CURRENT_TIMESTAMP,'Error')",
    );
    expect(() => validateSupplierInventoryImport(database)).not.toThrow();
  });
});
