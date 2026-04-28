import { log } from "evlog";

export interface ChannelNameUpdater {
  channelId: string;
  createdAt: Date;
  enabled: boolean;
  guildId: string;
  id: string;
  lastUpdatedAt: Date | null;
  nameTemplate: string;
  updateIntervalMinutes: number;
  updatedAt: Date;
}

export interface ChannelNameUpdaterPatch {
  channelId?: string | null;
  enabled?: boolean | null;
  lastUpdatedAt?: Date | null;
  nameTemplate?: string | null;
  updateIntervalMinutes?: number | null;
}

interface ChannelNameUpdaterRecord {
  channelId: string;
  createdAt: Date | string;
  enabled: boolean;
  guildId: string;
  id: string;
  lastUpdatedAt: Date | string | null;
  nameTemplate: string;
  updateIntervalMinutes: number;
  updatedAt: Date | string;
}

interface ChannelNameUpdaterDelegate {
  create: (args: unknown) => Promise<ChannelNameUpdaterRecord>;
  delete: (args: unknown) => Promise<ChannelNameUpdaterRecord>;
  findMany: (args: unknown) => Promise<ChannelNameUpdaterRecord[]>;
  findUnique: (args: unknown) => Promise<ChannelNameUpdaterRecord | null>;
  update: (args: unknown) => Promise<ChannelNameUpdaterRecord>;
}

interface ChannelNameUpdaterPrismaClient {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T>(query: string, ...values: unknown[]) => Promise<T>;
  guildChannelNameUpdater: ChannelNameUpdaterDelegate;
}

let prismaClientPromise: Promise<ChannelNameUpdaterPrismaClient> | null = null;
let ensureSchemaPromise: Promise<void> | null = null;

const loadPrismaClient = (): Promise<ChannelNameUpdaterPrismaClient> => {
  if (prismaClientPromise) {
    return prismaClientPromise;
  }

  prismaClientPromise = (async (): Promise<ChannelNameUpdaterPrismaClient> => {
    try {
      const databaseModule = await import("@terryscord/db");
      return databaseModule.default as unknown as ChannelNameUpdaterPrismaClient;
    } catch (error: unknown) {
      prismaClientPromise = null;
      throw error;
    }
  })();

  return prismaClientPromise;
};

const ensureSchema = async (
  prisma: ChannelNameUpdaterPrismaClient
): Promise<void> => {
  if (ensureSchemaPromise) {
    return await ensureSchemaPromise;
  }

  ensureSchemaPromise = (async (): Promise<void> => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "guild_channel_name_updater" (
        "id" TEXT NOT NULL,
        "guildId" TEXT NOT NULL,
        "channelId" TEXT NOT NULL,
        "nameTemplate" TEXT NOT NULL,
        "updateIntervalMinutes" INTEGER NOT NULL DEFAULT 10,
        "enabled" BOOLEAN NOT NULL DEFAULT false,
        "lastUpdatedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "guild_channel_name_updater_pkey" PRIMARY KEY ("id")
      )
    `);
  })();

  try {
    await ensureSchemaPromise;
  } catch (error: unknown) {
    ensureSchemaPromise = null;
    throw error;
  }
};

const toDate = (value: Date | string): Date => {
  if (value instanceof Date) {
    return value;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? new Date(0) : parsedDate;
};

const toOptionalDate = (value: Date | string | null): Date | null => {
  if (!value) {
    return null;
  }

  return toDate(value);
};

const toUpdater = (record: ChannelNameUpdaterRecord): ChannelNameUpdater => ({
  channelId: record.channelId,
  createdAt: toDate(record.createdAt),
  enabled: record.enabled,
  guildId: record.guildId,
  id: record.id,
  lastUpdatedAt: toOptionalDate(record.lastUpdatedAt),
  nameTemplate: record.nameTemplate,
  updateIntervalMinutes: record.updateIntervalMinutes,
  updatedAt: toDate(record.updatedAt),
});

const compactPatch = (
  patch: ChannelNameUpdaterPatch
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );

export const createChannelNameUpdater = async ({
  channelId,
  enabled,
  guildId,
  nameTemplate,
  updateIntervalMinutes,
}: {
  channelId: string;
  enabled: boolean;
  guildId: string;
  nameTemplate: string;
  updateIntervalMinutes: number;
}): Promise<ChannelNameUpdater> => {
  const prisma = await loadPrismaClient();
  await ensureSchema(prisma);

  const record = await prisma.guildChannelNameUpdater.create({
    data: {
      channelId,
      enabled,
      guildId,
      nameTemplate,
      updateIntervalMinutes,
    },
  });

  return toUpdater(record);
};

export const deleteChannelNameUpdater = async (
  id: string
): Promise<boolean> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureSchema(prisma);

    await prisma.guildChannelNameUpdater.delete({
      where: { id },
    });

    return true;
  } catch (error: unknown) {
    log.error({
      err: error,
      message: "Failed to delete channel name updater",
      updaterId: id,
    });

    return false;
  }
};

export const getChannelNameUpdater = async (
  id: string
): Promise<ChannelNameUpdater | null> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureSchema(prisma);

    const record = await prisma.guildChannelNameUpdater.findUnique({
      where: { id },
    });

    return record ? toUpdater(record) : null;
  } catch (error: unknown) {
    log.error({
      err: error,
      message: "Failed to fetch channel name updater",
      updaterId: id,
    });

    return null;
  }
};

export const listEnabledChannelNameUpdaters = async (): Promise<
  ChannelNameUpdater[]
> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureSchema(prisma);

    const records = await prisma.guildChannelNameUpdater.findMany({
      where: { enabled: true },
    });

    return records.map((record) => toUpdater(record));
  } catch (error: unknown) {
    log.error({
      err: error,
      message: "Failed to list enabled channel name updaters",
    });

    return [];
  }
};

export const listGuildChannelNameUpdaters = async (
  guildId: string
): Promise<ChannelNameUpdater[]> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureSchema(prisma);

    const records = await prisma.guildChannelNameUpdater.findMany({
      where: { guildId },
    });

    return records.map((record) => toUpdater(record));
  } catch (error: unknown) {
    log.error({
      err: error,
      guildId,
      message: "Failed to list guild channel name updaters",
    });

    return [];
  }
};

export const updateChannelNameUpdater = async ({
  id,
  patch,
}: {
  id: string;
  patch: ChannelNameUpdaterPatch;
}): Promise<ChannelNameUpdater | null> => {
  const updatePatch = compactPatch(patch);
  if (Object.keys(updatePatch).length === 0) {
    return getChannelNameUpdater(id);
  }

  try {
    const prisma = await loadPrismaClient();
    await ensureSchema(prisma);

    const record = await prisma.guildChannelNameUpdater.update({
      data: updatePatch,
      where: { id },
    });

    return toUpdater(record);
  } catch (error: unknown) {
    log.error({
      err: error,
      message: "Failed to update channel name updater",
      patch: updatePatch,
      updaterId: id,
    });

    return null;
  }
};
