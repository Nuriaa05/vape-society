import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

const models = Prisma.dmmf.datamodel.models;
const tableName = (model: (typeof models)[number]) =>
  model.dbName ?? model.name;
const importedModels = models.filter((model) => model.name !== "BackupLog");
const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

export type ImportCounts = {
  products: number;
  combos: number;
  sales: number;
  purchases: number;
  suppliers: number;
  movements: number;
};

export function getImportProjectPaths() {
  const backendRoot = [
    resolve(__dirname, "../../.."),
    resolve(__dirname, "../../../.."),
  ].find((path) => existsSync(resolve(path, "prisma/schema.prisma")));
  if (!backendRoot) throw new Error("No se encontró el esquema del núcleo.");
  return {
    backendRoot,
    schemaPath: resolve(backendRoot, "prisma/schema.prisma"),
    migrationsPath: resolve(backendRoot, "prisma/migrations"),
  };
}

export function checkImportFile(path: string): boolean {
  const source = new DatabaseSync(path, { readOnly: true });
  try {
    source.exec("PRAGMA trusted_schema = OFF");
    const integrity = source.prepare("PRAGMA integrity_check").all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
      throw new BadRequestException(
        "El archivo está dañado. Seleccioná otro respaldo.",
      );
    }
    const allowedTables = new Set([
      ...models.map(tableName),
      "_prisma_migrations",
    ]);
    const tables = source
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all();
    if (
      tables.length !== allowedTables.size ||
      tables.some((row) => !allowedTables.has(String(row.name)))
    ) {
      throw new BadRequestException(
        "La base de datos no corresponde a este sistema.",
      );
    }
    if (
      source
        .prepare(
          "SELECT 1 FROM sqlite_schema WHERE type IN ('view', 'trigger') LIMIT 1",
        )
        .get()
    ) {
      throw new BadRequestException(
        "La base contiene una estructura incompatible con este sistema.",
      );
    }
    const { migrationsPath } = getImportProjectPaths();
    const expected = readdirSync(migrationsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const applied = source
      .prepare(
        "SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name",
      )
      .all();
    if (!applied.length || applied.length > expected.length) {
      throw new BadRequestException(
        "La versión de la base de datos no es compatible.",
      );
    }
    for (let index = 0; index < applied.length; index++) {
      const row = applied[index];
      if (
        row.migration_name !== expected[index] ||
        row.finished_at === null ||
        row.rolled_back_at !== null
      ) {
        throw new BadRequestException(
          "La versión de la base de datos no es compatible.",
        );
      }
      const sql = readFileSync(
        resolve(migrationsPath, expected[index], "migration.sql"),
        "utf8",
      );
      const normalized = sql.replace(/\r\n/g, "\n");
      const checksums = [
        sql,
        normalized,
        normalized.replace(/\n/g, "\r\n"),
      ].map((text) => createHash("sha256").update(text).digest("hex"));
      if (!checksums.includes(String(row.checksum))) {
        throw new BadRequestException(
          "La base tiene migraciones distintas a las de este sistema.",
        );
      }
    }
    return applied.length < expected.length;
  } finally {
    source.close();
  }
}

export function validateImportData(
  sourcePath: string,
  currentPath: string,
): ImportCounts {
  const current = new DatabaseSync(currentPath, { readOnly: true });
  const mirror = new DatabaseSync(":memory:");
  try {
    const schema = current
      .prepare(
        "SELECT sql FROM sqlite_schema WHERE type IN ('table', 'index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END",
      )
      .all();
    for (const row of schema) mirror.exec(String(row.sql));
    copyImportData(mirror, sourcePath);
    for (const model of importedModels) {
      for (const field of model.fields.filter(
        (field) => field.kind === "scalar",
      )) {
        const column = quote(field.dbName ?? field.name);
        let invalid: string;
        switch (field.type) {
          case "Int":
            invalid = `typeof(${column}) <> 'integer'`;
            break;
          case "Boolean":
            invalid = `typeof(${column}) <> 'integer' OR ${column} NOT IN (0, 1)`;
            break;
          case "DateTime":
            invalid = `(typeof(${column}) = 'integer' AND abs(${column}) > 8640000000000000) OR (typeof(${column}) = 'text' AND julianday(${column}) IS NULL) OR typeof(${column}) NOT IN ('integer', 'text')`;
            break;
          default:
            invalid = `typeof(${column}) <> 'text'`;
        }
        if (
          mirror
            .prepare(
              `SELECT 1 FROM ${quote(tableName(model))} WHERE ${column} IS NOT NULL AND (${invalid}) LIMIT 1`,
            )
            .get()
        ) {
          throw new BadRequestException(
            "El respaldo contiene datos con un formato incompatible.",
          );
        }
      }
    }
    for (const table of [
      "BusinessSettings",
      "ReceiptSettings",
      "AppSettings",
    ]) {
      if (
        !mirror
          .prepare(`SELECT 1 FROM ${quote(table)} WHERE id = 'default'`)
          .get()
      ) {
        throw new BadRequestException(
          "El respaldo no contiene la configuración necesaria del sistema.",
        );
      }
    }
    const counter = mirror
      .prepare("SELECT value FROM Counter WHERE key = 'saleReceiptNumber'")
      .get();
    const maximum = mirror
      .prepare(
        "SELECT COALESCE(MAX(CAST(number AS INTEGER)), 0) AS value FROM Sale",
      )
      .get()!;
    if (!counter || Number(counter.value) < Number(maximum.value)) {
      throw new BadRequestException(
        "El contador de comprobantes del respaldo no es válido.",
      );
    }
    const count = (table: string) =>
      Number(
        mirror.prepare(`SELECT COUNT(*) AS value FROM ${quote(table)}`).get()!
          .value,
      );
    return {
      products: count("Product"),
      combos: count("Combo"),
      sales: count("Sale"),
      purchases: count("Purchase"),
      suppliers: count("Supplier"),
      movements: count("StockMovement"),
    };
  } finally {
    mirror.close();
    current.close();
  }
}

export function replaceImportData(
  currentPath: string,
  sourcePath: string,
): void {
  const current = new DatabaseSync(currentPath, { timeout: 10_000 });
  try {
    copyImportData(current, sourcePath);
  } finally {
    current.close();
  }
}

function copyImportData(destination: DatabaseSync, sourcePath: string): void {
  destination.prepare("ATTACH DATABASE ? AS incoming").run(sourcePath);
  try {
    for (const model of importedModels) {
      const expected = model.fields
        .filter((field) => field.kind === "scalar")
        .map((field) => field.dbName ?? field.name);
      const actual = destination
        .prepare(`PRAGMA incoming.table_info(${quote(tableName(model))})`)
        .all()
        .map((column) => String(column.name));
      if (
        expected.length !== actual.length ||
        expected.some((column) => !actual.includes(column))
      ) {
        throw new BadRequestException(
          "Las columnas del respaldo no son compatibles con este sistema.",
        );
      }
    }
    destination.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys = ON");
    try {
      for (const model of [...importedModels].reverse()) {
        destination.exec(`DELETE FROM main.${quote(tableName(model))}`);
      }
      for (const model of importedModels) {
        const table = quote(tableName(model));
        const columns = model.fields
          .filter((field) => field.kind === "scalar")
          .map((field) => quote(field.dbName ?? field.name))
          .join(", ");
        destination.exec(
          `INSERT INTO main.${table} (${columns}) SELECT ${columns} FROM incoming.${table}`,
        );
      }
      destination.exec("COMMIT");
    } catch (error) {
      destination.exec("ROLLBACK");
      throw error;
    }
  } finally {
    destination.exec("DETACH DATABASE incoming");
  }
}
