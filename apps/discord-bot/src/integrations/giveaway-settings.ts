/* eslint-disable max-statements */

import { log } from "evlog";

export interface GuildGiveawaySettings {
  pingRoleIds: string[];
}

interface GuildGiveawaySettingRecord {
  createdAt: Date;
  guildId: string;
  pingRoleIds: string[];
  updatedAt: Date;
}

interface GuildGiveawaySettingDelegate {
  findUnique: (args: unknown) => Promise<GuildGiveawaySettingRecord | null>;
  upsert: (args: unknown) => Promise<GuildGiveawaySettingRecord>;
}

interface GuildDelegate {
  upsert: (args: unknown) => Promise<unknown>;
}

interface GiveawaySettingsPrismaClient {
  $executeRawUnsafe: (query: string) => Promise<number>;
  guild: GuildDelegate;
  guildGiveawaySetting: GuildGiveawaySettingDelegate;
}

let prismaClientPromise: Promise<GiveawaySettingsPrismaClient> | null = null;
let ensureGiveawaySettingsSchemaPromise: Promise<void> | null = null;

const ensureGiveawaySettingsSchema = async (
  prisma: GiveawaySettingsPrismaClient
): Promise<void> => {
  if (ensureGiveawaySettingsSchemaPromise) {
    return await ensureGiveawaySettingsSchemaPromise;
  }

  ensureGiveawaySettingsSchemaPromise = (async (): Promise<void> => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "guild_giveaway_setting" (
        "guildId" TEXT NOT NULL,
        "pingRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "guild_giveaway_setting_pkey" PRIMARY KEY ("guildId")
      )
    `);
  })();

  try {
    await ensureGiveawaySettingsSchemaPromise;
  } catch (error: unknown) {
    ensureGiveawaySettingsSchemaPromise = null;
    throw error;
  }
};

const ensureGuildRow = async ({
  guildId,
  prisma,
}: {
  guildId: string;
  prisma: GiveawaySettingsPrismaClient;
}): Promise<void> => {
  await ensureGiveawaySettingsSchema(prisma);
  await prisma.guild.upsert({
    create: { id: guildId },
    update: {},
    where: { id: guildId },
  });
};

const loadPrismaClient = (): Promise<GiveawaySettingsPrismaClient> => {
  if (prismaClientPromise) {
    return prismaClientPromise;
  }

  prismaClientPromise = (async (): Promise<GiveawaySettingsPrismaClient> => {
    try {
      const databaseModule = await import("@terryscord/db");
      return databaseModule.default as unknown as GiveawaySettingsPrismaClient;
    } catch (error: unknown) {
      prismaClientPromise = null;
      throw error;
    }
  })();

  return prismaClientPromise;
};

const toSafeRoleIds = (value: string[] | null | undefined): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );
};

export const getGuildGiveawaySettings = async (
  guildId: string
): Promise<GuildGiveawaySettings> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureGuildRow({ guildId, prisma });

    const record = await prisma.guildGiveawaySetting.findUnique({
      where: { guildId },
    });

    return {
      pingRoleIds: toSafeRoleIds(record?.pingRoleIds),
    };
  } catch (error: unknown) {
    log.error({
      err: error,
      guildId,
      message: "Failed to fetch guild giveaway settings",
    });

    return { pingRoleIds: [] };
  }
};

export const addGuildGiveawayPingRole = async ({
  guildId,
  roleId,
}: {
  guildId: string;
  roleId: string;
}): Promise<boolean> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureGuildRow({ guildId, prisma });

    const existing = await prisma.guildGiveawaySetting.findUnique({
      where: { guildId },
    });

    const currentIds = toSafeRoleIds(existing?.pingRoleIds);

    if (currentIds.includes(roleId)) {
      return false;
    }

    const nextIds = [...currentIds, roleId];

    await prisma.guildGiveawaySetting.upsert({
      create: { guildId, pingRoleIds: nextIds },
      update: { pingRoleIds: nextIds },
      where: { guildId },
    });

    return true;
  } catch (error: unknown) {
    log.error({
      err: error,
      guildId,
      message: "Failed to add giveaway ping role",
      roleId,
    });

    throw new Error("Unable to add giveaway ping role.", {
      cause: error,
    });
  }
};

export const removeGuildGiveawayPingRole = async ({
  guildId,
  roleId,
}: {
  guildId: string;
  roleId: string;
}): Promise<boolean> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureGuildRow({ guildId, prisma });

    const existing = await prisma.guildGiveawaySetting.findUnique({
      where: { guildId },
    });

    const currentIds = toSafeRoleIds(existing?.pingRoleIds);

    if (!currentIds.includes(roleId)) {
      return false;
    }

    const nextIds = currentIds.filter((id) => id !== roleId);

    await prisma.guildGiveawaySetting.upsert({
      create: { guildId, pingRoleIds: nextIds },
      update: { pingRoleIds: nextIds },
      where: { guildId },
    });

    return true;
  } catch (error: unknown) {
    log.error({
      err: error,
      guildId,
      message: "Failed to remove giveaway ping role",
      roleId,
    });

    throw new Error("Unable to remove giveaway ping role.", {
      cause: error,
    });
  }
};
