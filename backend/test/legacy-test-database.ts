import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

// Build the actual old schema, rather than deleting migration records from a
// current database (which leaves the newer tables behind).
export function createLegacyBackup(
  path: string,
  throughMigration = "20261004000000_sale_customer_details",
): void {
  const migrations = join(__dirname, "../prisma/migrations");
  const database = new DatabaseSync(path);
  try {
    database.exec(`CREATE TABLE _prisma_migrations (
      id TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL,
      finished_at DATETIME, migration_name TEXT NOT NULL, logs TEXT,
      rolled_back_at DATETIME, started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      applied_steps_count INTEGER UNSIGNED NOT NULL DEFAULT 0
    )`);
    for (const name of readdirSync(migrations).sort()) {
      if (name > throughMigration) continue;
      const sql = readFileSync(join(migrations, name, "migration.sql"), "utf8");
      database.exec(sql);
      database
        .prepare(
          `INSERT INTO _prisma_migrations
        (id, checksum, migration_name, finished_at, applied_steps_count)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)`,
        )
        .run(
          randomUUID(),
          createHash("sha256").update(sql).digest("hex"),
          name,
        );
    }
    database.exec(`
      INSERT INTO BusinessSettings (id, name, address, cuit, phone, updatedAt)
        VALUES ('default', 'Negocio anterior', '', '', '', CURRENT_TIMESTAMP);
      INSERT INTO ReceiptSettings (id, header, footer, updatedAt)
        VALUES ('default', '', 'Gracias', CURRENT_TIMESTAMP);
      INSERT INTO AppSettings (id, defaultMarginPct, comboTicketMode, updatedAt)
        VALUES ('default', 45, 'ComboLine', CURRENT_TIMESTAMP);
      INSERT INTO Counter (key, value, updatedAt)
        VALUES ('saleReceiptNumber', 1, CURRENT_TIMESTAMP);
      INSERT INTO PaymentMethod (id, name, updatedAt)
        VALUES ('pm1', 'Efectivo', CURRENT_TIMESTAMP);
      INSERT INTO Sale (id, number, deliveryStatus, status, paymentMethodId,
        subtotalAmountCents, totalAmountCents, updatedAt)
        VALUES ('legacy-sale', '000001', 'Entregado', 'Confirmada', 'pm1',
          10000, 10000, CURRENT_TIMESTAMP);
    `);
  } finally {
    database.close();
  }
}
