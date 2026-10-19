import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  checkImportFile,
  validateImportData,
} from "../src/modules/backups/sqlite-import";
import { createLegacyBackup } from "./legacy-test-database";

describe("Legacy backup preflight", () => {
  let directory: string;
  let path: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "vape-legacy-import-"));
    path = join(directory, "legacy.db");
    createLegacyBackup(path);
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("allows a known older schema to reach temporary migrations before checking current tables", () => {
    expect(checkImportFile(path)).toBe(true);
  });

  it("still rejects unknown tables in a recognized older backup", () => {
    const database = new DatabaseSync(path);
    database.exec("CREATE TABLE UnexpectedData (id TEXT)");
    database.close();
    expect(() => checkImportFile(path)).toThrow("no corresponde");
  });

  it("rejects changed historical migrations", () => {
    const database = new DatabaseSync(path);
    database.exec("UPDATE _prisma_migrations SET checksum = 'altered'");
    database.close();
    expect(() => checkImportFile(path)).toThrow("migraciones distintas");
  });
});

describe("Financial backup consistency", () => {
  let directory: string;
  let path: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "vape-financial-import-"));
    path = join(directory, "current.db");
    createLegacyBackup(path, "99999999999999");
    const database = new DatabaseSync(path);
    database.exec(`
      INSERT INTO Customer (id, name, updatedAt) VALUES ('c1', 'Ana', CURRENT_TIMESTAMP);
      INSERT INTO ReceivablePlan (id, customerId, title, totalAmountCents)
        VALUES ('plan1', 'c1', 'Saldo anterior', 10000);
      INSERT INTO ReceivableInstallment (id, planId, number, dueDate, amountCents)
        VALUES ('i1', 'plan1', 1, '2026-01-31', 10000);
      INSERT INTO Collection (id, customerId, date, paymentMethodId, paymentMethodName, amountCents)
        VALUES ('col1', 'c1', '2026-01-31', 'pm1', 'Efectivo', 10000);
      INSERT INTO CollectionAllocation (id, collectionId, installmentId, amountCents)
        VALUES ('a1', 'col1', 'i1', 10000);
    `);
    database.close();
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it("accepts a paid installment without losing its allocation", () => {
    expect(validateImportData(path, path)).toMatchObject({
      sales: 1,
      receivableInstallments: 1,
      collectionAllocations: 1,
      cardAccreditations: 0,
      refundCancellations: 0,
      inventoryAllocations: 0,
      priceListTiers: 0,
      financialOperations: 0,
    });
  });

  it("recognizes the equivalent early supplier-credit migration without bypassing data validation", () => {
    const database = new DatabaseSync(path);
    database
      .prepare(
        "UPDATE _prisma_migrations SET checksum = ? WHERE migration_name = '20261015010000_supplier_credit'",
      )
      .run("ea6fbe3843c58ac8a7974a025ff87c14864db75ba69062af9b2ac31b8bff4bd8");
    database.close();
    expect(checkImportFile(path)).toBe(false);
    expect(validateImportData(path, path)).toMatchObject({
      collectionAllocations: 1,
    });
    const damaged = new DatabaseSync(path);
    damaged.exec(
      "UPDATE CollectionAllocation SET amountCents = 10001 WHERE id = 'a1'",
    );
    damaged.close();
    expect(() => validateImportData(path, path)).toThrow();
  });

  it("does not accept the legacy supplier checksum as a different migration", () => {
    const database = new DatabaseSync(path);
    database
      .prepare(
        "UPDATE _prisma_migrations SET checksum = ? WHERE migration_name = '20261015000000_customers_collections'",
      )
      .run("ea6fbe3843c58ac8a7974a025ff87c14864db75ba69062af9b2ac31b8bff4bd8");
    database.close();
    expect(() => checkImportFile(path)).toThrow("migraciones distintas");
  });

  it("accepts explicitly deferred card calendars and rejects a lost confirmed calendar", () => {
    const database = new DatabaseSync(path);
    database
      .prepare(
        "UPDATE Sale SET paymentTerms = 'CardInstallments', financeSnapshot = ? WHERE id = 'legacy-sale'",
      )
      .run(
        JSON.stringify({
          paymentTerms: "CardInstallments",
          cardPlan: {
            deferred: true,
            processor: "Procesador",
            installmentCount: 3,
            settlements: [],
          },
        }),
      );
    database.close();
    expect(validateImportData(path, path)).toMatchObject({
      sales: 1,
      cardSettlements: 0,
    });
    const broken = new DatabaseSync(path);
    broken.exec(
      "INSERT INTO FinancialOperation (operationId, kind, payload, resultId) VALUES ('schedule', 'CardSchedule', '{}', 'legacy-sale')",
    );
    broken.close();
    expect(() => validateImportData(path, path)).toThrow();
  });

  it.each([
    { processor: undefined },
    { processor: {} },
    { processor: " " },
    { installmentCount: 3.5 },
    { installmentCount: "3" },
    { settlements: null },
    { deferred: "true" },
  ])("rejects deferred card data that cannot be completed (%j)", (patch) => {
    const database = new DatabaseSync(path);
    database
      .prepare(
        "UPDATE Sale SET paymentTerms = 'CardInstallments', financeSnapshot = ? WHERE id = 'legacy-sale'",
      )
      .run(
        JSON.stringify({
          cardPlan: {
            deferred: true,
            processor: "Procesador",
            installmentCount: 3,
            settlements: [],
            ...patch,
          },
        }),
      );
    database.close();
    expect(() => validateImportData(path, path)).toThrow();
  });

  it("accepts tracked sale operation records and rejects mismatched sale references", () => {
    const database = new DatabaseSync(path);
    database.exec(`
      UPDATE Sale SET operationId = 'sale-operation', operationPayload = '{"items":[]}'
        WHERE id = 'legacy-sale';
      INSERT INTO FinancialOperation (operationId, kind, payload, resultId)
        VALUES ('sale-operation', 'Sale', '{"items":[]}', 'legacy-sale');
    `);
    database.close();
    expect(validateImportData(path, path)).toMatchObject({ sales: 1 });
    const broken = new DatabaseSync(path);
    broken.exec("UPDATE FinancialOperation SET resultId = 'missing-sale'");
    broken.close();
    expect(() => validateImportData(path, path)).toThrow();
  });

  it.each([
    "UPDATE Sale SET customerId = 'c2' WHERE id = 'legacy-sale'",
    "UPDATE Sale SET totalAmountCents = 12000 WHERE id = 'legacy-sale'",
    "UPDATE Sale SET paymentTerms = 'CardInstallments' WHERE id = 'legacy-sale'",
  ])("rejects a financed sale inconsistent with its plan: %s", (sql) => {
    const database = new DatabaseSync(path);
    database.exec(`
      INSERT INTO Customer (id, name, updatedAt) VALUES ('c2', 'Otro cliente', CURRENT_TIMESTAMP);
      UPDATE Sale SET customerId = 'c1', paymentTerms = 'DirectInstallments',
        paymentMethodId = NULL WHERE id = 'legacy-sale';
      UPDATE ReceivablePlan SET saleId = 'legacy-sale' WHERE id = 'plan1';
    `);
    database.close();
    expect(validateImportData(path, path)).toMatchObject({
      receivablePlans: 1,
    });
    const broken = new DatabaseSync(path);
    broken.exec(sql);
    broken.close();
    expect(() => validateImportData(path, path)).toThrow();
  });

  it("rejects a refund assigned to a different customer than its source", () => {
    const database = new DatabaseSync(path);
    database.exec(`
      INSERT INTO Customer (id, name, updatedAt) VALUES ('c2', 'Otro cliente', CURRENT_TIMESTAMP);
      UPDATE ReceivablePlan SET status = 'Anulado' WHERE id = 'plan1';
      INSERT INTO Refund (id, planId, customerId, date, amountCents,
        cashOutAmountCents, paymentMethodId, paymentMethodName, reason)
        VALUES ('refund1', 'plan1', 'c2', '2026-01-31', 10000, 10000,
          'pm1', 'Efectivo', 'Reintegro');
    `);
    database.close();
    expect(() => validateImportData(path, path)).toThrow();
  });

  it.each([
    "UPDATE CollectionAllocation SET amountCents = 10001",
    "UPDATE Collection SET paymentMethodId = 'missing-method'",
    "UPDATE ReceivableInstallment SET dueDate = '2026-02-31'",
  ])("rejects inconsistent financial data: %s", (sql) => {
    const database = new DatabaseSync(path);
    database.exec(sql);
    database.close();
    expect(() => validateImportData(path, path)).toThrow();
  });
});
