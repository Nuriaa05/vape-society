export type AppConfig = {
  host: string;
  port: number;
  frontendOrigin: string;
  frontendDistDir?: string;
  databaseUrl: string;
  backupDir: string;
  backupSchedulerEnabled: boolean;
};

function toPort(value: string | undefined): number {
  const port = Number(value);
  return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : 3002;
}

export const appConfig = (): AppConfig => ({
  host: process.env.HOST ?? "127.0.0.1",
  port: toPort(process.env.PORT),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://127.0.0.1:8081",
  frontendDistDir: process.env.FRONTEND_DIST_DIR?.trim() || undefined,
  databaseUrl: process.env.DATABASE_URL ?? "file:./core.db",
  backupDir: process.env.BACKUP_DIR ?? "backups",
  backupSchedulerEnabled: process.env.NODE_ENV !== "test",
});
