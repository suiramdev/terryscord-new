import { ChannelType } from "discord.js";
import type { Guild } from "discord.js";
import { log } from "evlog";

export const CAPTCHA_TYPE_VALUES = ["image_text"] as const;
export type CaptchaType = (typeof CAPTCHA_TYPE_VALUES)[number];

export const CAPTCHA_LIMITS = {
  codeLength: {
    defaultValue: 6,
    max: 8,
    min: 4,
  },
  maxAttempts: {
    defaultValue: 3,
    max: 10,
    min: 1,
  },
  noiseLevel: {
    defaultValue: 55,
    max: 100,
    min: 0,
  },
  timeoutSeconds: {
    defaultValue: 300,
    max: 3600,
    min: 30,
  },
} as const;

const CHANNEL_NAME_FORMAT_DEFAULT = "verify-{username}-{suffix}";
const CHANNEL_NAME_FORMAT_MAX_LENGTH = 80;
const CAPTCHA_TYPE_DEFAULT: CaptchaType = "image_text";

export interface GuildCaptchaSettings {
  allowAdminAccess: boolean;
  attemptAlertChannelId: string | null;
  captchaCaseSensitive: boolean;
  captchaCategoryId: string | null;
  captchaNoiseLevel: number;
  captchaType: CaptchaType;
  channelNameFormat: string;
  codeLength: number;
  debugLogging: boolean;
  kickOnFailure: boolean;
  maxAttempts: number;
  timeoutSeconds: number;
  verifiedRoleId: string | null;
}

export interface GuildCaptchaSettingsPatch {
  allowAdminAccess?: boolean | null;
  attemptAlertChannelId?: string | null;
  captchaCaseSensitive?: boolean | null;
  captchaCategoryId?: string | null;
  captchaNoiseLevel?: number | null;
  captchaType?: string | null;
  channelNameFormat?: string | null;
  codeLength?: number | null;
  debugLogging?: boolean | null;
  kickOnFailure?: boolean | null;
  maxAttempts?: number | null;
  timeoutSeconds?: number | null;
  verifiedRoleId?: string | null;
}

interface GuildCaptchaSettingsRecord {
  allowAdminAccess: boolean | null;
  attemptAlertChannelId: string | null;
  captchaCaseSensitive: boolean | null;
  captchaCategoryId: string | null;
  captchaNoiseLevel: number | null;
  captchaType: string | null;
  channelNameFormat: string | null;
  codeLength: number | null;
  debugLogging: boolean | null;
  kickOnFailure: boolean | null;
  maxAttempts: number | null;
  timeoutSeconds: number | null;
  verifiedRoleId: string | null;
}

interface GuildCaptchaSettingsDelegate {
  findUnique: (args: unknown) => Promise<GuildCaptchaSettingsRecord | null>;
  upsert: (args: unknown) => Promise<GuildCaptchaSettingsRecord>;
}

interface GuildDelegate {
  upsert: (args: unknown) => Promise<unknown>;
}

interface CaptchaSettingsPrismaClient {
  $executeRawUnsafe: (query: string) => Promise<number>;
  guild: GuildDelegate;
  guildVerificationSetting: GuildCaptchaSettingsDelegate;
}

const DEFAULT_GUILD_CAPTCHA_SETTINGS: GuildCaptchaSettings = {
  allowAdminAccess: true,
  attemptAlertChannelId: null,
  captchaCaseSensitive: false,
  captchaCategoryId: null,
  captchaNoiseLevel: CAPTCHA_LIMITS.noiseLevel.defaultValue,
  captchaType: CAPTCHA_TYPE_DEFAULT,
  channelNameFormat: CHANNEL_NAME_FORMAT_DEFAULT,
  codeLength: CAPTCHA_LIMITS.codeLength.defaultValue,
  debugLogging: false,
  kickOnFailure: false,
  maxAttempts: CAPTCHA_LIMITS.maxAttempts.defaultValue,
  timeoutSeconds: CAPTCHA_LIMITS.timeoutSeconds.defaultValue,
  verifiedRoleId: null,
};

let prismaClientPromise: Promise<CaptchaSettingsPrismaClient> | null = null;
let ensureCaptchaPersistenceSchemaPromise: Promise<void> | null = null;

const ensureCaptchaPersistenceSchema = async (
  prisma: CaptchaSettingsPrismaClient
): Promise<void> => {
  if (ensureCaptchaPersistenceSchemaPromise) {
    return await ensureCaptchaPersistenceSchemaPromise;
  }

  ensureCaptchaPersistenceSchemaPromise = (async (): Promise<void> => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "guild" (
        "id" TEXT NOT NULL,
        "name" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "guild_pkey" PRIMARY KEY ("id")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "guild_verification_setting" (
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
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "guild_verification_setting_pkey" PRIMARY KEY ("guildId")
      )
    `);
  })();

  try {
    await ensureCaptchaPersistenceSchemaPromise;
  } catch (error: unknown) {
    ensureCaptchaPersistenceSchemaPromise = null;
    throw error;
  }
};

const ensureGuildRow = async ({
  guildId,
  prisma,
}: {
  guildId: string;
  prisma: CaptchaSettingsPrismaClient;
}): Promise<void> => {
  await ensureCaptchaPersistenceSchema(prisma);
  await prisma.guild.upsert({
    create: {
      id: guildId,
    },
    update: {},
    where: {
      id: guildId,
    },
  });
};

const loadPrismaClient = (): Promise<CaptchaSettingsPrismaClient> => {
  if (prismaClientPromise) {
    return prismaClientPromise;
  }

  prismaClientPromise = (async (): Promise<CaptchaSettingsPrismaClient> => {
    try {
      const databaseModule = await import("@terryscord/db");
      return databaseModule.default as unknown as CaptchaSettingsPrismaClient;
    } catch (error: unknown) {
      prismaClientPromise = null;
      throw error;
    }
  })();

  return prismaClientPromise;
};

const toOptionalId = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toBoundedInteger = ({
  defaultValue,
  max,
  min,
  value,
}: {
  defaultValue: number;
  max: number;
  min: number;
  value: number | null | undefined;
}): number => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return defaultValue;
  }

  if (value < min || value > max) {
    return defaultValue;
  }

  return value;
};

const toBooleanWithDefault = ({
  defaultValue,
  value,
}: {
  defaultValue: boolean;
  value: boolean | null | undefined;
}): boolean => {
  if (typeof value !== "boolean") {
    return defaultValue;
  }

  return value;
};

const toChannelNameFormat = (value: string | null | undefined): string => {
  if (typeof value !== "string") {
    return CHANNEL_NAME_FORMAT_DEFAULT;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > CHANNEL_NAME_FORMAT_MAX_LENGTH) {
    return CHANNEL_NAME_FORMAT_DEFAULT;
  }

  return trimmed;
};

const toCaptchaType = (value: string | null | undefined): CaptchaType => {
  if (typeof value !== "string") {
    return CAPTCHA_TYPE_DEFAULT;
  }

  if (CAPTCHA_TYPE_VALUES.includes(value as CaptchaType)) {
    return value as CaptchaType;
  }

  return CAPTCHA_TYPE_DEFAULT;
};

const mergeWithDefaults = (
  record: GuildCaptchaSettingsRecord | null
): GuildCaptchaSettings => ({
  allowAdminAccess: toBooleanWithDefault({
    defaultValue: DEFAULT_GUILD_CAPTCHA_SETTINGS.allowAdminAccess,
    value: record?.allowAdminAccess,
  }),
  attemptAlertChannelId: toOptionalId(record?.attemptAlertChannelId),
  captchaCaseSensitive: toBooleanWithDefault({
    defaultValue: DEFAULT_GUILD_CAPTCHA_SETTINGS.captchaCaseSensitive,
    value: record?.captchaCaseSensitive,
  }),
  captchaCategoryId: toOptionalId(record?.captchaCategoryId),
  captchaNoiseLevel: toBoundedInteger({
    defaultValue: CAPTCHA_LIMITS.noiseLevel.defaultValue,
    max: CAPTCHA_LIMITS.noiseLevel.max,
    min: CAPTCHA_LIMITS.noiseLevel.min,
    value: record?.captchaNoiseLevel,
  }),
  captchaType: toCaptchaType(record?.captchaType),
  channelNameFormat: toChannelNameFormat(record?.channelNameFormat),
  codeLength: toBoundedInteger({
    defaultValue: CAPTCHA_LIMITS.codeLength.defaultValue,
    max: CAPTCHA_LIMITS.codeLength.max,
    min: CAPTCHA_LIMITS.codeLength.min,
    value: record?.codeLength,
  }),
  debugLogging: toBooleanWithDefault({
    defaultValue: DEFAULT_GUILD_CAPTCHA_SETTINGS.debugLogging,
    value: record?.debugLogging,
  }),
  kickOnFailure: toBooleanWithDefault({
    defaultValue: DEFAULT_GUILD_CAPTCHA_SETTINGS.kickOnFailure,
    value: record?.kickOnFailure,
  }),
  maxAttempts: toBoundedInteger({
    defaultValue: CAPTCHA_LIMITS.maxAttempts.defaultValue,
    max: CAPTCHA_LIMITS.maxAttempts.max,
    min: CAPTCHA_LIMITS.maxAttempts.min,
    value: record?.maxAttempts,
  }),
  timeoutSeconds: toBoundedInteger({
    defaultValue: CAPTCHA_LIMITS.timeoutSeconds.defaultValue,
    max: CAPTCHA_LIMITS.timeoutSeconds.max,
    min: CAPTCHA_LIMITS.timeoutSeconds.min,
    value: record?.timeoutSeconds,
  }),
  verifiedRoleId: toOptionalId(record?.verifiedRoleId),
});

const resolveValidRoleId = async ({
  guild,
  roleId,
}: {
  guild: Guild;
  roleId: string | null;
}): Promise<string | null> => {
  if (!roleId) {
    return null;
  }

  if (guild.roles.cache.has(roleId)) {
    return roleId;
  }

  try {
    const role = await guild.roles.fetch(roleId);
    return role ? role.id : null;
  } catch {
    return null;
  }
};

const resolveCachedCategoryId = ({
  categoryId,
  guild,
}: {
  categoryId: string;
  guild: Guild;
}): string | null => {
  const cached = guild.channels.cache.get(categoryId);
  if (cached?.type !== ChannelType.GuildCategory) {
    return null;
  }

  return cached.id;
};

const resolveFetchedCategoryId = async ({
  categoryId,
  guild,
}: {
  categoryId: string;
  guild: Guild;
}): Promise<string | null> => {
  try {
    const fetched = await guild.channels.fetch(categoryId);
    if (!fetched || fetched.type !== ChannelType.GuildCategory) {
      return null;
    }

    return fetched.id;
  } catch {
    return null;
  }
};

const resolveValidCategoryId = ({
  categoryId,
  guild,
}: {
  categoryId: string | null;
  guild: Guild;
}): Promise<string | null> => {
  if (!categoryId) {
    return Promise.resolve(null);
  }

  const cachedCategoryId = resolveCachedCategoryId({ categoryId, guild });
  if (cachedCategoryId) {
    return Promise.resolve(cachedCategoryId);
  }

  return resolveFetchedCategoryId({ categoryId, guild });
};

const isValidAttemptAlertChannelType = (channelType: ChannelType): boolean =>
  channelType === ChannelType.GuildText;

const resolveCachedAttemptAlertChannelId = ({
  channelId,
  guild,
}: {
  channelId: string;
  guild: Guild;
}): string | null => {
  const cached = guild.channels.cache.get(channelId);
  if (!cached || !isValidAttemptAlertChannelType(cached.type)) {
    return null;
  }

  return cached.id;
};

const resolveFetchedAttemptAlertChannelId = async ({
  channelId,
  guild,
}: {
  channelId: string;
  guild: Guild;
}): Promise<string | null> => {
  try {
    const fetched = await guild.channels.fetch(channelId);
    if (!fetched || !isValidAttemptAlertChannelType(fetched.type)) {
      return null;
    }

    return fetched.id;
  } catch {
    return null;
  }
};

const resolveValidAttemptAlertChannelId = ({
  channelId,
  guild,
}: {
  channelId: string | null;
  guild: Guild;
}): Promise<string | null> => {
  if (!channelId) {
    return Promise.resolve(null);
  }

  const cachedChannelId = resolveCachedAttemptAlertChannelId({
    channelId,
    guild,
  });
  if (cachedChannelId) {
    return Promise.resolve(cachedChannelId);
  }

  return resolveFetchedAttemptAlertChannelId({
    channelId,
    guild,
  });
};

const compactPatch = (
  patch: GuildCaptchaSettingsPatch
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );

export const getDefaultGuildCaptchaSettings = (): GuildCaptchaSettings => ({
  ...DEFAULT_GUILD_CAPTCHA_SETTINGS,
});

export const getStoredGuildCaptchaSettings = async (
  guildId: string
): Promise<GuildCaptchaSettingsRecord | null> => {
  try {
    const prisma = await loadPrismaClient();
    await ensureGuildRow({ guildId, prisma });
    return prisma.guildVerificationSetting.findUnique({
      where: {
        guildId,
      },
    });
  } catch (error: unknown) {
    log.error({
      err: error,
      guildId,
      message: "Failed to fetch guild captcha settings",
    });

    return null;
  }
};

export const getGuildCaptchaSettings = async (
  guild: Guild
): Promise<GuildCaptchaSettings> => {
  const storedSettings = await getStoredGuildCaptchaSettings(guild.id);
  const mergedSettings = mergeWithDefaults(storedSettings);

  const [resolvedRoleId, resolvedCategoryId, resolvedAttemptAlertChannelId] =
    await Promise.all([
      resolveValidRoleId({
        guild,
        roleId: mergedSettings.verifiedRoleId,
      }),
      resolveValidCategoryId({
        categoryId: mergedSettings.captchaCategoryId,
        guild,
      }),
      resolveValidAttemptAlertChannelId({
        channelId: mergedSettings.attemptAlertChannelId,
        guild,
      }),
    ]);

  return {
    ...mergedSettings,
    attemptAlertChannelId: resolvedAttemptAlertChannelId,
    captchaCategoryId: resolvedCategoryId,
    verifiedRoleId: resolvedRoleId,
  };
};

export const upsertGuildCaptchaSettings = async ({
  guildId,
  patch,
}: {
  guildId: string;
  patch: GuildCaptchaSettingsPatch;
}): Promise<void> => {
  const upsertPatch = compactPatch(patch);
  if (Object.keys(upsertPatch).length === 0) {
    return;
  }

  try {
    const prisma = await loadPrismaClient();
    await ensureGuildRow({ guildId, prisma });

    await prisma.guildVerificationSetting.upsert({
      create: {
        guildId,
        ...upsertPatch,
      },
      update: upsertPatch,
      where: {
        guildId,
      },
    });
  } catch (error: unknown) {
    log.error({
      err: error,
      guildId,
      message: "Failed to upsert guild captcha settings",
      patch: upsertPatch,
    });

    throw new Error("Unable to save guild captcha settings.", {
      cause: error,
    });
  }
};
