import { env } from "@terryscord/env/bot";

import { logger } from "@/logger";

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
    logger.warn({ err: error }, "Failed to disconnect Prisma client");
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
    return;
  }

  try {
    await runPrismaHealthQuery();
    logger.info("Prisma database health check succeeded");
  } catch (error: unknown) {
    logger.error({ err: error }, "Prisma database health check failed");
  }
};
