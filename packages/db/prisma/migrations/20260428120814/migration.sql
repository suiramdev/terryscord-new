-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_verification_setting" (
    "guildId" TEXT NOT NULL,
    "verifiedRoleId" TEXT,
    "captchaCategoryId" TEXT,
    "attemptAlertChannelId" TEXT,
    "captchaCaseSensitive" BOOLEAN,
    "captchaNoiseLevel" INTEGER,
    "maxAttempts" INTEGER,
    "timeoutSeconds" INTEGER,
    "kickOnFailure" BOOLEAN,
    "allowAdminAccess" BOOLEAN,
    "channelNameFormat" TEXT,
    "captchaType" TEXT,
    "codeLength" INTEGER,
    "debugLogging" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_verification_setting_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "guild_verification_session" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verificationChannelId" TEXT NOT NULL,
    "challengeMessageId" TEXT NOT NULL,
    "expectedResponse" TEXT NOT NULL,
    "attemptsUsed" INTEGER NOT NULL DEFAULT 0,
    "alertThresholdReached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_verification_session_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateTable
CREATE TABLE "guild_rss_subscription" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "messageStyleJson" TEXT NOT NULL,
    "lastItemId" TEXT,
    "lastItemPublishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_rss_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_giveaway" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_giveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_giveaway_participant" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_giveaway_participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_giveaway_setting" (
    "guildId" TEXT NOT NULL,
    "pingRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_giveaway_setting_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "guild_channel_name_updater" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "nameTemplate" TEXT NOT NULL,
    "updateIntervalMinutes" INTEGER NOT NULL DEFAULT 10,
    "sourceType" TEXT NOT NULL,
    "sourceConfig" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_channel_name_updater_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "guild_rss_subscription_feed_idx" ON "guild_rss_subscription"("feedUrl");

-- CreateIndex
CREATE UNIQUE INDEX "guild_rss_subscription_unique" ON "guild_rss_subscription"("guildId", "channelId", "feedUrl");

-- CreateIndex
CREATE UNIQUE INDEX "guild_giveaway_messageId_key" ON "guild_giveaway"("messageId");

-- CreateIndex
CREATE INDEX "guild_giveaway_guild_ended_idx" ON "guild_giveaway"("guildId", "ended");

-- CreateIndex
CREATE INDEX "guild_giveaway_ends_at_idx" ON "guild_giveaway"("endsAt", "ended");

-- CreateIndex
CREATE INDEX "guild_giveaway_participant_giveaway_idx" ON "guild_giveaway_participant"("giveawayId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_giveaway_participant_unique" ON "guild_giveaway_participant"("giveawayId", "userId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_giveaway_participant" ADD CONSTRAINT "guild_giveaway_participant_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "guild_giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
