import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const backend = resolve(root, "backend");
const frontend = resolve(root, "frontend");
const databaseFile = resolve(backend, "prisma/core.db");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Ejecutá este comando con npm run desde la carpeta raíz.");

const env = {
  ...process.env,
  HOST: "127.0.0.1",
  PORT: "3002",
  DATABASE_URL: `file:${databaseFile.replaceAll("\\", "/")}`,
  BACKUP_DIR: resolve(backend, "backups"),
  FRONTEND_ORIGIN: "http://127.0.0.1:8081",
};

function run(cwd, args, extraEnv = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [npmCli, ...args], {
      cwd, env: { ...env, ...extraEnv }, stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0 || signal === "SIGINT") resolveRun();
      else reject(new Error(`${args.join(" ")} falló (${code ?? signal}).`));
    });
  });
}

async function initializeDatabase() {
  closeSync(openSync(databaseFile, "a"));
  await run(backend, ["exec", "prisma", "migrate", "deploy"]);
  await run(backend, ["run", "prisma:seed"]);
}

const command = process.argv[2];
try {
  switch (command) {
    case "setup":
      await run(backend, ["ci", "--no-audit", "--no-fund"]);
      await run(frontend, ["ci", "--no-audit", "--no-fund"]);
      await run(backend, ["run", "prisma:generate"]);
      await initializeDatabase();
      break;
    case "db:init":
      await initializeDatabase();
      break;
    case "dev":
      await initializeDatabase();
      await Promise.all([run(backend, ["run", "dev"]), run(frontend, ["run", "dev"])]);
      break;
    case "start":
      await initializeDatabase();
      await run(backend, ["run", "start"], { FRONTEND_DIST_DIR: resolve(frontend, "dist") });
      break;
    case "typecheck":
    case "lint":
    case "test":
    case "build":
      await run(frontend, ["run", command]);
      await run(backend, ["run", command]);
      break;
    default:
      throw new Error(`Comando desconocido: ${command}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
