import { env } from "@terryscord/env/bot";
import { log } from "evlog";

interface PrismaClientLike {
  $queryRaw: (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
  $disconnect: () => Promise<void>;
}

const loadPrismaClient = async (): Promise<PrismaClientLike> => {
  const dbModule = (await import("@terryscord/db")) as {
    default: PrismaClientLike;
  };

  return dbModule.default;
};

const disconnectPrismaClient = async (
  prisma: PrismaClientLike
): Promise<void> => {
  try {
    await prisma.$disconnect();
  } catch (error: unknown) {
    log.warn({
      err: error,
      message: "Failed to disconnect Prisma client",
    });
  }
};

const runPrismaHealthQuery = async (): Promise<void> => {
  const prisma = await loadPrismaClient();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } finally {
    await disconnectPrismaClient(prisma);
  }
};

export const runDatabaseHealthCheck = async (): Promise<void> => {
  if (!env.BOT_DATABASE_HEALTHCHECK_ON_READY) {
    log.info({
      databaseHealthCheckEnabled: env.BOT_DATABASE_HEALTHCHECK_ON_READY,
      message: "Skipped Prisma database health check",
    });
    return;
  }

  const startedAt = Date.now();

  try {
    await runPrismaHealthQuery();
    log.info({
      durationMs: Date.now() - startedAt,
      message: "Prisma database health check succeeded",
    });
  } catch (error: unknown) {
    log.error({
      durationMs: Date.now() - startedAt,
      err: error,
      message: "Prisma database health check failed",
    });
  }
};
