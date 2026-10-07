const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, cpSync, readdirSync, symlinkSync, rmSync, rmdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join, relative, isAbsolute } = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { test } = require('node:test');

const backendDir = resolve(__dirname, '../../backend');

async function withDirectory(run) {
  const directory = mkdtempSync(join(tmpdir(), 'vape-installer-test-'));
  try {
    await run(directory);
  } finally {
    const target = resolve(directory);
    const withinTemp = relative(resolve(tmpdir()), target);
    assert.ok(withinTemp && !withinTemp.startsWith('..') && !isAbsolute(withinTemp));
    rmSync(target, { recursive: true, force: true });
  }
}

function olderBackend(directory) {
  const root = join(directory, 'previous-backend');
  mkdirSync(join(root, 'prisma/migrations'), { recursive: true });
  cpSync(join(backendDir, 'prisma/schema.prisma'), join(root, 'prisma/schema.prisma'));
  cpSync(join(backendDir, 'prisma/migrations/migration_lock.toml'), join(root, 'prisma/migrations/migration_lock.toml'));
  for (const migration of readdirSync(join(backendDir, 'prisma/migrations'), { withFileTypes: true })) {
    if (migration.isDirectory() && migration.name !== '20261006000000_daily_backups') {
      cpSync(join(backendDir, 'prisma/migrations', migration.name), join(root, 'prisma/migrations', migration.name), { recursive: true });
    }
  }
  symlinkSync(join(backendDir, 'node_modules'), join(root, 'node_modules'), 'junction');
  return root;
}

function saveProduct(databasePath) {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(`
      INSERT INTO Category (id, name, updatedAt) VALUES ('saved-category', 'General', CURRENT_TIMESTAMP);
      INSERT INTO Product (id, name, categoryId, costAmountCents, priceAmountCents, marginPct, physicalStock, updatedAt)
      VALUES ('saved-product', 'Producto conservado', 'saved-category', 100000, 150000, 50, 8, CURRENT_TIMESTAMP);
    `);
  } finally {
    database.close();
  }
}

test('creates an independent empty database and preserves records on the next launch', async () => {
  const { prepareDatabase } = require('./runtime.cjs');
  await withDirectory(async (directory) => {
    const dataDir = join(directory, 'datos con espacios y acentos á');
    const databasePath = await prepareDatabase({ backendDir, dataDir });
    assert.equal(databasePath, join(dataDir, 'core.db'));
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      for (const table of ['Product', 'Sale', 'Category', 'Purchase']) {
        assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count, 0);
      }
    } finally { database.close(); }
    saveProduct(databasePath);
    await prepareDatabase({ backendDir, dataDir });
    const reopened = new DatabaseSync(databasePath, { readOnly: true });
    try { assert.equal(reopened.prepare('SELECT physicalStock FROM Product').get().physicalStock, 8); }
    finally { reopened.close(); }
    assert.deepEqual(readdirSync(join(dataDir, 'backups')), []);
  });
});

test('backs up an older database before applying pending migrations without losing products', async () => {
  const { prepareDatabase } = require('./runtime.cjs');
  await withDirectory(async (directory) => {
    const dataDir = join(directory, 'data');
    const databasePath = await prepareDatabase({ backendDir: olderBackend(directory), dataDir });
    saveProduct(databasePath);
    await prepareDatabase({ backendDir, dataDir });
    const backups = readdirSync(join(dataDir, 'backups'));
    assert.equal(backups.length, 1);
    const snapshot = new DatabaseSync(join(dataDir, 'backups', backups[0]), { readOnly: true });
    const current = new DatabaseSync(databasePath, { readOnly: true });
    try {
      assert.equal(snapshot.prepare('SELECT name FROM Product').get().name, 'Producto conservado');
      assert.ok(!snapshot.prepare('PRAGMA table_info(AppSettings)').all().some(column => column.name === 'dailyBackupEnabled'));
      assert.ok(current.prepare('PRAGMA table_info(AppSettings)').all().some(column => column.name === 'dailyBackupEnabled'));
      assert.equal(current.prepare('SELECT physicalStock FROM Product').get().physicalStock, 8);
    } finally { snapshot.close(); current.close(); }
  });
});

test('leaves an older database intact when the pre-update backup cannot be created', async () => {
  const { prepareDatabase } = require('./runtime.cjs');
  await withDirectory(async (directory) => {
    const dataDir = join(directory, 'data');
    const databasePath = await prepareDatabase({ backendDir: olderBackend(directory), dataDir });
    saveProduct(databasePath);
    const backupDir = join(dataDir, 'backups');
    rmdirSync(backupDir);
    writeFileSync(backupDir, 'This path is a file, not a directory.', 'utf8');
    await assert.rejects(prepareDatabase({ backendDir, dataDir }));
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM _prisma_migrations').get().count, 3);
      assert.equal(database.prepare('SELECT physicalStock FROM Product').get().physicalStock, 8);
    } finally { database.close(); }
  });
});
