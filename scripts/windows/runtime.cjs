const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');

async function prepareDatabase({ backendDir, dataDir }) {
  const databasePath = join(resolve(dataDir), 'core.db');
  const backupDir = join(resolve(dataDir), 'backups');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(backupDir, { recursive: true });

  if (existsSync(databasePath) && statSync(databasePath).size > 0) {
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const applied = new Set(database.prepare(
        'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
      ).all().map(row => row.migration_name));
      const pending = readdirSync(join(backendDir, 'prisma/migrations'), { withFileTypes: true })
        .some(entry => entry.isDirectory() && !applied.has(entry.name));
      if (pending) {
        const name = `antes-actualizar-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.db`;
        await backup(database, join(backupDir, name));
      }
    } finally { database.close(); }
  } else {
    writeFileSync(databasePath, '');
  }

  const result = execFileSync(process.execPath, [
    join(backendDir, 'node_modules/prisma/build/index.js'),
    'migrate', 'deploy', '--schema', join(backendDir, 'prisma/schema.prisma'),
  ], {
    cwd: backendDir,
    env: {
      ...process.env,
      DATABASE_URL: `file:${databasePath.replaceAll('\\', '/')}`,
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
      CHECKPOINT_DISABLE: '1',
    },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60000,
  });
  console.log(result.trim());
  return databasePath;
}

async function start() {
  const installDir = __dirname;
  const backendDir = join(installDir, 'backend');
  const dataDir = resolve(process.env.VAPE_SOCIETY_DATA_DIR || join(process.env.LOCALAPPDATA, 'VapeSociety'));
  const port = Number(process.env.VAPE_SOCIETY_PORT || 43120);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Puerto local inválido.');

  let app;
  let stopping = false;
  let stopRequested = false;
  const stop = async () => {
    stopRequested = true;
    if (!app || stopping) return;
    stopping = true;
    await app.close();
    process.stdin.destroy();
  };
  process.stdin.setEncoding('utf8');
  let input = '';
  process.stdin.on('data', chunk => {
    input += chunk;
    if (input.replaceAll('\r', '').includes('shutdown\n')) void stop();
  });
  process.stdin.on('end', () => { void stop(); });

  const databasePath = await prepareDatabase({ backendDir, dataDir });
  if (stopRequested) { process.stdin.destroy(); return; }
  Object.assign(process.env, {
    HOST: '127.0.0.1',
    PORT: String(port),
    DATABASE_URL: `file:${databasePath.replaceAll('\\', '/')}`,
    BACKUP_DIR: join(dataDir, 'backups'),
    FRONTEND_ORIGIN: `http://127.0.0.1:${port}`,
    FRONTEND_DIST_DIR: join(installDir, 'frontend'),
    NODE_ENV: 'production',
  });
  const { PrismaClient } = require(join(backendDir, 'node_modules/@prisma/client'));
  const { ensureBaseData } = require(join(backendDir, 'dist/src/base-data.js'));
  const prisma = new PrismaClient();
  try { await ensureBaseData(prisma); }
  finally { await prisma.$disconnect(); }
  if (stopRequested) { process.stdin.destroy(); return; }
  const { bootstrap } = require(join(backendDir, 'dist/src/main.js'));
  app = await bootstrap();
  if (stopRequested) await stop();
}

module.exports = { prepareDatabase };

if (require.main === module) {
  start().catch(error => {
    console.error(error);
    process.stdin.destroy();
    process.exit(1);
  });
}
