import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createLegacyBackup } from "./legacy-test-database";

it("initializes known method capabilities once when upgrading an existing installation", () => {
  const directory = mkdtempSync(join(tmpdir(), "vape-finance-upgrade-"));
  const path = join(directory, "old.db");
  createLegacyBackup(path);
  const database = new DatabaseSync(path);
  try {
    database.exec(`INSERT INTO PaymentMethod (id, name, updatedAt) VALUES
      ('pm2', 'Transferencia renombrada', CURRENT_TIMESTAMP),
      ('pm4', 'QR', CURRENT_TIMESTAMP),
      ('pm7', 'Crédito cuotas renombrado', CURRENT_TIMESTAMP)`);
    const migrations = join(__dirname, "../prisma/migrations");
    for (const migration of readdirSync(migrations).sort()) {
      if (
        migration <= "20261004000000_sale_customer_details" ||
        !/^\d/.test(migration)
      )
        continue;
      database.exec(
        readFileSync(join(migrations, migration, "migration.sql"), "utf8"),
      );
    }
    expect(
      database
        .prepare(
          "SELECT id FROM PaymentMethod WHERE collectionEligible = 1 ORDER BY id",
        )
        .all(),
    ).toEqual([{ id: "pm1" }, { id: "pm2" }, { id: "pm4" }]);
    expect(
      database
        .prepare("SELECT id FROM PaymentMethod WHERE supportsInstallments = 1")
        .all(),
    ).toEqual([{ id: "pm7" }]);
    expect(
      database
        .prepare("SELECT paymentTerms FROM Sale WHERE id = 'legacy-sale'")
        .get()!.paymentTerms,
    ).toBeNull();
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM Collection").get()!.count,
    ).toBe(0);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
