/* eslint-disable max-statements */

import { log } from "evlog";

interface RssSubscriptionRecord {
  channelId: string;
  createdAt: Date | string;
  createdByUserId: string;
  feedUrl: string;
  guildId: string;
  id: string;
  lastItemId: string | null;
  lastItemPublishedAt: Date | string | null;
  messageStyleJson: string;
  updatedAt: Date | string;
}

interface CreateSubscriptionResultBase {
  type: "created";
  value: RssSubscription;
}

interface DuplicateSubscriptionResult {
  type: "duplicate";
}

export type CreateRssSubscriptionResult =
  | CreateSubscriptionResultBase
  | DuplicateSubscriptionResult;

interface RssSubscriptionPrismaClient {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T>(query: string, ...values: unknown[]) => Promise<T>;
}

export interface RssSubscription {
  channelId: string;
  createdAt: Date;
  createdByUserId: string;
  feedUrl: string;
  guildId: string;
  id: string;
  lastItemId: string | null;
  lastItemPublishedAt: Date | null;
  messageStyleJson: string;
  updatedAt: Date;
}

const RSS_SUBSCRIPTION_UNIQUE_CONSTRAINT = "guild_rss_subscription_unique";

let prismaClientPromise: Promise<RssSubscriptionPrismaClient> | null = null;
let ensureRssSubscriptionSchemaPromise: Promise<void> | null = null;

const loadPrismaClient = (): Promise<RssSubscriptionPrismaClient> => {
  if (prismaClientPromise) {
    return prismaClientPromise;
  }

  prismaClientPromise = (async (): Promise<RssSubscriptionPrismaClient> => {
    try {
      const databaseModule = await import("@terryscord/db");
      return databaseModule.default as unknown as RssSubscriptionPrismaClient;
    } catch (error: unknown) {
      prismaClientPromise = null;
      throw error;
    }
  })();

  return prismaClientPromise;
};

const ensureRssSubscriptionSchema = async (
  prisma: RssSubscriptionPrismaClient
): Promise<void> => {
  if (ensureRssSubscriptionSchemaPromise) {
    return await ensureRssSubscriptionSchemaPromise;
  }

  ensureRssSubscriptionSchemaPromise = (async (): Promise<void> => {
    // Keep schema bootstrapping idempotent so deployments do not require a migration step.
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "guild_rss_subscription" (
        "id" TEXT NOT NULL,
        "guildId" TEXT NOT NULL,
        "channelId" TEXT NOT NULL,
        "feedUrl" TEXT NOT NULL,
        "messageStyleJson" TEXT NOT NULL,
        "lastItemId" TEXT,
        "lastItemPublishedAt" TIMESTAMP(3),
        "createdByUserId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "guild_rss_subscription_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "${RSS_SUBSCRIPTION_UNIQUE_CONSTRAINT}" UNIQUE ("guildId", "channelId", "feedUrl")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "guild_rss_subscription_feed_idx"
      ON "guild_rss_subscription" ("feedUrl")
    `);
  })();

  try {
    await ensureRssSubscriptionSchemaPromise;
  } catch (error: unknown) {
    ensureRssSubscriptionSchemaPromise = null;
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

const toSubscription = (record: RssSubscriptionRecord): RssSubscription => ({
  channelId: record.channelId,
  createdAt: toDate(record.createdAt),
  createdByUserId: record.createdByUserId,
  feedUrl: record.feedUrl,
  guildId: record.guildId,
  id: record.id,
  lastItemId: record.lastItemId,
  lastItemPublishedAt: toOptionalDate(record.lastItemPublishedAt),
  messageStyleJson: record.messageStyleJson,
  updatedAt: toDate(record.updatedAt),
});

const isUniqueConstraintError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if ("code" in error && Reflect.get(error, "code") === "23505") {
    return true;
  }

  if ("message" in error) {
    const message = Reflect.get(error, "message");
    return (
      typeof message === "string" &&
      message.includes(RSS_SUBSCRIPTION_UNIQUE_CONSTRAINT)
    );
  }

  return false;
};

export const createRssSubscription = async ({
  channelId,
  createdByUserId,
  feedUrl,
  guildId,
  lastItemId,
  lastItemPublishedAt,
  messageStyleJson,
}: {
  channelId: string;
  createdByUserId: string;
  feedUrl: string;
  guildId: string;
  lastItemId: string | null;
  lastItemPublishedAt: Date | null;
  messageStyleJson: string;
}): Promise<CreateRssSubscriptionResult> => {
  const prisma = await loadPrismaClient();
  await ensureRssSubscriptionSchema(prisma);

  try {
    // Duplicate prevention is enforced by a unique DB constraint and handled below.
    const createdRows = await prisma.$queryRawUnsafe<RssSubscriptionRecord[]>(
      `
        INSERT INTO "guild_rss_subscription" (
          "id",
          "guildId",
          "channelId",
          "feedUrl",
          "messageStyleJson",
          "lastItemId",
          "lastItemPublishedAt",
          "createdByUserId"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          "id",
          "guildId",
          "channelId",
          "feedUrl",
          "messageStyleJson",
          "lastItemId",
          "lastItemPublishedAt",
          "createdByUserId",
          "createdAt",
          "updatedAt"
      `,
      crypto.randomUUID(),
      guildId,
      channelId,
      feedUrl,
      messageStyleJson,
      lastItemId,
      lastItemPublishedAt,
      createdByUserId
    );

    const [createdRecord] = createdRows;
    if (!createdRecord) {
      throw new Error("Failed to create RSS subscription.");
    }

    return {
      type: "created",
      value: toSubscription(createdRecord),
    };
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) {
      return {
        type: "duplicate",
      };
    }

    throw error;
  }
};

export const listRssSubscriptions = async (): Promise<RssSubscription[]> => {
  const prisma = await loadPrismaClient();
  await ensureRssSubscriptionSchema(prisma);

  const records = await prisma.$queryRawUnsafe<RssSubscriptionRecord[]>(`
    SELECT
      "id",
      "guildId",
      "channelId",
      "feedUrl",
      "messageStyleJson",
      "lastItemId",
      "lastItemPublishedAt",
      "createdByUserId",
      "createdAt",
      "updatedAt"
    FROM "guild_rss_subscription"
    ORDER BY "createdAt" ASC
  `);

  return records.map((record) => toSubscription(record));
};

export const deleteRssSubscription = async ({
  channelId,
  feedUrl,
  guildId,
}: {
  channelId: string;
  feedUrl: string;
  guildId: string;
}): Promise<boolean> => {
  const prisma = await loadPrismaClient();
  await ensureRssSubscriptionSchema(prisma);

  const deletedCount = await prisma.$executeRawUnsafe(
    `
      DELETE FROM "guild_rss_subscription"
      WHERE
        "guildId" = $1
        AND "channelId" = $2
        AND "feedUrl" = $3
    `,
    guildId,
    channelId,
    feedUrl
  );

  return deletedCount > 0;
};

export const updateRssSubscriptionCursor = async ({
  id,
  lastItemId,
  lastItemPublishedAt,
}: {
  id: string;
  lastItemId: string;
  lastItemPublishedAt: Date | null;
}): Promise<void> => {
  const prisma = await loadPrismaClient();
  await ensureRssSubscriptionSchema(prisma);

  // Cursor updates track the newest delivered item for duplicate-safe polling.
  await prisma.$executeRawUnsafe(
    `
      UPDATE "guild_rss_subscription"
      SET
        "lastItemId" = $2,
        "lastItemPublishedAt" = $3,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $1
    `,
    id,
    lastItemId,
    lastItemPublishedAt
  );
};

export const safeUpdateRssSubscriptionCursor = async ({
  id,
  lastItemId,
  lastItemPublishedAt,
}: {
  id: string;
  lastItemId: string;
  lastItemPublishedAt: Date | null;
}): Promise<void> => {
  try {
    await updateRssSubscriptionCursor({
      id,
      lastItemId,
      lastItemPublishedAt,
    });
  } catch (error: unknown) {
    log.error({
      err: error,
      message: "Failed to update RSS subscription cursor",
      subscriptionId: id,
    });
  }
};
