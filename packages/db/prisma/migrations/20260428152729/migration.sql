-- DropTable
DROP TABLE IF EXISTS "guild_channel_name_updater";

-- CreateTable
CREATE TABLE "guild_channel_name_updater" (
    "channelId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "nameTemplate" TEXT NOT NULL,
    "updateIntervalMinutes" INTEGER NOT NULL DEFAULT 10,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_channel_name_updater_pkey" PRIMARY KEY ("channelId")
);
