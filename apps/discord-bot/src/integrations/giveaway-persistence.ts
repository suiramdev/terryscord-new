import { log } from "evlog";

export interface GiveawayRecord {
  channelId: string;
  createdAt: Date;
  createdByUserId: string;
  description: string | null;
  ended: boolean;
  endedAt: Date | null;
  endsAt: Date;
  guildId: string;
  id: string;
  messageId: string;
  prize: string;
  requiredRoleIds: string[];
  updatedAt: Date;
  winnerCount: number;
}

export interface GiveawayParticipantRecord {
  enteredAt: Date;
  giveawayId: string;
  id: string;
  userId: string;
}

interface GiveawayDelegate {
  create: (args: unknown) => Promise<GiveawayRecord>;
  delete: (args: unknown) => Promise<GiveawayRecord>;
  findMany: (args: unknown) => Promise<GiveawayRecord[]>;
  findUnique: (args: unknown) => Promise<GiveawayRecord | null>;
  update: (args: unknown) => Promise<GiveawayRecord>;
}

interface GiveawayParticipantDelegate {
  create: (args: unknown) => Promise<GiveawayParticipantRecord>;
  deleteMany: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<GiveawayParticipantRecord[]>;
}

interface GiveawayPrismaClient {
  $executeRawUnsafe: (query: string) => Promise<number>;
  guildGiveaway: GiveawayDelegate;
  guildGiveawayParticipant: GiveawayParticipantDelegate;
}

let prismaClientPromise: Promise<GiveawayPrismaClient> | null = null;
let ensureGiveawaySchemaPromise: Promise<void> | null = null;

const ensureGiveawayPersistenceSchema = async (
  prisma: GiveawayPrismaClient
): Promise<void> => {
  if (ensureGiveawaySchemaPromise) {
    return await ensureGiveawaySchemaPromise;
  }

  ensureGiveawaySchemaPromise = (async (): Promise<void> => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "guild_giveaway" (
        "id" TEXT NOT NULL,
        "guildId" TEXT NOT NULL,
        "channelId" TEXT NOT NULL,
        "messageId" TEXT NOT NULL,
        "createdByUserId" TEXT NOT NULL,
        "prize" TEXT NOT NULL,
        "description" TEXT,
        "winnerCount" INTEGER NOT NULL DEFAULT 1,
        "endsAt" TIMESTAMP(3) NOT NULL,
        "requiredRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "ended" BOOLEAN NOT NULL DEFAULT false,
        "endedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "guild_giveaway_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "guild_giveaway_messageId_key" UNIQUE ("messageId")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "guild_giveaway_participant" (
        "id" TEXT NOT NULL,
        "giveawayId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "guild_giveaway_participant_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "guild_giveaway_participant_unique" UNIQUE ("giveawayId", "userId")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "guild_giveaway_guild_ended_idx"
      ON "guild_giveaway" ("guildId", "ended")
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "guild_giveaway_ends_at_idx"
      ON "guild_giveaway" ("endsAt", "ended")
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "guild_giveaway_participant_giveaway_idx"
      ON "guild_giveaway_participant" ("giveawayId")
    `);
  })();

  try {
    await ensureGiveawaySchemaPromise;
  } catch (error: unknown) {
    ensureGiveawaySchemaPromise = null;
    throw error;
  }
};

const loadPrismaClient = (): Promise<GiveawayPrismaClient> => {
  if (prismaClientPromise) {
    return prismaClientPromise;
  }

  prismaClientPromise = (async (): Promise<GiveawayPrismaClient> => {
    try {
      const databaseModule = await import("@terryscord/db");
      return databaseModule.default as unknown as GiveawayPrismaClient;
    } catch (error: unknown) {
      prismaClientPromise = null;
      throw error;
    }
  })();

  return prismaClientPromise;
};

export const createGiveaway = async ({
  channelId,
  createdByUserId,
  description,
  endsAt,
  guildId,
  messageId,
  prize,
  requiredRoleIds,
  winnerCount,
}: {
  channelId: string;
  createdByUserId: string;
  description: string | null;
  endsAt: Date;
  guildId: string;
  messageId: string;
  prize: string;
  requiredRoleIds: string[];
  winnerCount: number;
}): Promise<GiveawayRecord | null> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureGiveawayPersistenceSchema(prisma);

    return await prisma.guildGiveaway.create({
      data: {
        channelId,
        createdByUserId,
        description,
        endsAt,
        guildId,
        messageId,
        prize,
        requiredRoleIds,
        winnerCount,
      },
    });
  } catch (error: unknown) {
    log.error({
      channelId,
      err: error,
      guildId,
      message: "Failed to create giveaway",
      messageId,
    });

    return null;
  }
};

export const getGiveawayById = async (
  id: string
): Promise<GiveawayRecord | null> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureGiveawayPersistenceSchema(prisma);

    return await prisma.guildGiveaway.findUnique({
      where: { id },
    });
  } catch (error: unknown) {
    log.error({
      err: error,
      giveawayId: id,
      message: "Failed to fetch giveaway by id",
    });

    return null;
  }
};

export const getGiveawayByMessageId = async (
  messageId: string
): Promise<GiveawayRecord | null> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureGiveawayPersistenceSchema(prisma);

    return await prisma.guildGiveaway.findUnique({
      where: { messageId },
    });
  } catch (error: unknown) {
    log.error({
      err: error,
      message: "Failed to fetch giveaway by message id",
      messageId,
    });

    return null;
  }
};

export const getActiveGiveaways = async ({
  guildId,
}: {
  guildId?: string;
} = {}): Promise<GiveawayRecord[]> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureGiveawayPersistenceSchema(prisma);

    const where: Record<string, unknown> = { ended: false };
    if (guildId) {
      where.guildId = guildId;
    }

    return await prisma.guildGiveaway.findMany({
      where,
    });
  } catch (error: unknown) {
    log.error({
      err: error,
      guildId,
      message: "Failed to list active giveaways",
    });

    return [];
  }
};

export const endGiveaway = async ({
  endedAt,
  id,
}: {
  endedAt: Date;
  id: string;
}): Promise<GiveawayRecord | null> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureGiveawayPersistenceSchema(prisma);

    return await prisma.guildGiveaway.update({
      data: { ended: true, endedAt },
      where: { id },
    });
  } catch (error: unknown) {
    log.error({
      err: error,
      giveawayId: id,
      message: "Failed to end giveaway",
    });

    return null;
  }
};

export const deleteGiveaway = async (id: string): Promise<boolean> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureGiveawayPersistenceSchema(prisma);

    await prisma.guildGiveaway.delete({
      where: { id },
    });

    return true;
  } catch (error: unknown) {
    log.error({
      err: error,
      giveawayId: id,
      message: "Failed to delete giveaway",
    });

    return false;
  }
};

export const addParticipant = async ({
  giveawayId,
  userId,
}: {
  giveawayId: string;
  userId: string;
}): Promise<{ alreadyEntered: boolean; success: boolean }> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureGiveawayPersistenceSchema(prisma);

    await prisma.guildGiveawayParticipant.create({
      data: { giveawayId, userId },
    });

    return { alreadyEntered: false, success: true };
  } catch (error: unknown) {
    const isUniqueViolation =
      error instanceof Error &&
      (error.message.includes("P2002") ||
        error.message.includes("unique constraint"));

    if (isUniqueViolation) {
      return { alreadyEntered: true, success: false };
    }

    log.error({
      err: error,
      giveawayId,
      message: "Failed to add giveaway participant",
      userId,
    });

    return { alreadyEntered: false, success: false };
  }
};

export const listParticipants = async ({
  giveawayId,
}: {
  giveawayId: string;
}): Promise<string[]> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureGiveawayPersistenceSchema(prisma);

    const rows = await prisma.guildGiveawayParticipant.findMany({
      where: { giveawayId },
    });

    return rows.map((row) => row.userId);
  } catch (error: unknown) {
    log.error({
      err: error,
      giveawayId,
      message: "Failed to list giveaway participants",
    });

    return [];
  }
};

export const isParticipant = async ({
  giveawayId,
  userId,
}: {
  giveawayId: string;
  userId: string;
}): Promise<boolean> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureGiveawayPersistenceSchema(prisma);

    const rows = await prisma.guildGiveawayParticipant.findMany({
      take: 1,
      where: { giveawayId, userId },
    });

    return rows.length > 0;
  } catch (error: unknown) {
    log.error({
      err: error,
      giveawayId,
      message: "Failed to check giveaway participant",
      userId,
    });

    return false;
  }
};
