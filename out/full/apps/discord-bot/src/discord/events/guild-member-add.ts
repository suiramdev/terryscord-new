import type { CaptchaGenerator as CaptchaGeneratorType } from "captcha-canvas";
import {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import type {
  Client,
  Guild,
  GuildBasedChannel,
  GuildMember,
  MessageCreateOptions,
  OverwriteResolvable,
  Role,
  TextChannel,
} from "discord.js";
import { log } from "evlog";

import { t } from "@/i18n";
import { getGuildCaptchaSettings } from "@/integrations/captcha-settings";
import type { GuildCaptchaSettings } from "@/integrations/captcha-settings";

const CAPTCHA_CHANNEL_TOPIC_PREFIX = "captcha-verification";
const CAPTCHA_IMAGE_FILE_NAME = "captcha.png";
const CAPTCHA_IMAGE_HEIGHT = 140;
const CAPTCHA_IMAGE_WIDTH = 360;
const CAPTCHA_CASE_INSENSITIVE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CAPTCHA_CASE_SENSITIVE_CHARACTERS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const CAPTCHA_TEXT_COLORS = ["#0f172a", "#1e293b", "#334155", "#475569"];
const CAPTCHA_BACKGROUND_COLOR_START = "#f8fafc";
const CAPTCHA_BACKGROUND_COLOR_END = "#e2e8f0";
const CAPTCHA_BACKGROUND_ACCENT_COLOR = "#94a3b8";
const CHANNEL_DELETE_DELAY_MS = 2000;
const CHANNEL_NAME_DEFAULT_PREFIX = t("verification.channelName.prefix");
const FALLBACK_CAPTCHA_CHARACTER = "A";
const VERIFICATION_EMBED_COLOR_INFO = 2_484_063;
const VERIFICATION_EMBED_COLOR_SUCCESS = 2_212_308;
const VERIFICATION_EMBED_COLOR_WARNING = 15_865_867;
const VERIFICATION_EMBED_COLOR_ERROR = 15_583_145;
const UINT32_MAX_PLUS_ONE = 0x1_00_00_00_00;
const MESSAGE_READ_PERMISSIONS = [
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ViewChannel,
];
const activeVerificationSessions = new Set<string>();

interface CaptchaChallengeState {
  alertThresholdReached: boolean;
  attemptsUsed: number;
  challengeMessageId: string | null;
  expectedResponse: string;
  verified: boolean;
}

interface GeneratedCaptchaChallenge {
  attachment: AttachmentBuilder;
  code: string;
}

interface CollectedCaptchaEntry {
  content: string;
  id: string;
}

type VerificationSource = "debug" | "guildMemberAdd" | "recovery";
interface CaptchaCanvasModule {
  CaptchaGenerator: typeof CaptchaGeneratorType;
}

let captchaCanvasModulePromise: Promise<CaptchaCanvasModule> | null = null;

const waitForMilliseconds = async (milliseconds: number): Promise<void> => {
  await Bun.sleep(milliseconds);
};

const loadCaptchaCanvasModule = (): Promise<CaptchaCanvasModule> => {
  if (captchaCanvasModulePromise) {
    return captchaCanvasModulePromise;
  }

  captchaCanvasModulePromise = (async (): Promise<CaptchaCanvasModule> => {
    try {
      return await import("captcha-canvas");
    } catch (error: unknown) {
      captchaCanvasModulePromise = null;
      throw new Error(
        "Unable to load captcha-canvas. Ensure skia-canvas native binaries are installed for this runtime.",
        { cause: error }
      );
    }
  })();

  return captchaCanvasModulePromise;
};

const sanitizeChannelSegment = (value: string): string =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, "-")
    .replaceAll(/-{2,}/g, "-")
    .replaceAll(/^-|-$/g, "");

const buildSessionKey = (guildId: string, userId: string): string =>
  `${guildId}:${userId}`;

const buildVerificationChannelTopic = (userId: string): string =>
  `${CAPTCHA_CHANNEL_TOPIC_PREFIX}:${userId}`;

const parseVerificationChannelTopic = (topic: string | null): string | null => {
  if (!topic?.startsWith(`${CAPTCHA_CHANNEL_TOPIC_PREFIX}:`)) {
    return null;
  }

  const memberId = topic.slice(CAPTCHA_CHANNEL_TOPIC_PREFIX.length + 1).trim();
  return memberId.length > 0 ? memberId : null;
};

const normalizeCaptchaInput = ({
  caseSensitive,
  input,
}: {
  caseSensitive: boolean;
  input: string;
}): string => {
  const compacted = input.replaceAll(/\s+/g, "");
  return caseSensitive ? compacted : compacted.toUpperCase();
};

const getCaptchaCharacterSet = ({
  caseSensitive,
}: {
  caseSensitive: boolean;
}): string =>
  caseSensitive
    ? CAPTCHA_CASE_SENSITIVE_CHARACTERS
    : CAPTCHA_CASE_INSENSITIVE_CHARACTERS;

const secureRandomInteger = (maxExclusive: number): number => {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("maxExclusive must be a positive integer.");
  }

  const threshold = UINT32_MAX_PLUS_ONE - (UINT32_MAX_PLUS_ONE % maxExclusive);
  const randomBuffer = new Uint32Array(1);

  while (true) {
    crypto.getRandomValues(randomBuffer);
    const [randomValue] = randomBuffer;
    if (randomValue === undefined || randomValue >= threshold) {
      continue;
    }

    return randomValue % maxExclusive;
  }
};

const generateSecureCaptchaCode = ({
  caseSensitive,
  codeLength,
}: {
  caseSensitive: boolean;
  codeLength: number;
}): string => {
  const characters = getCaptchaCharacterSet({ caseSensitive });

  return Array.from({ length: codeLength }, () => {
    const randomCharacterIndex = secureRandomInteger(characters.length);
    return characters[randomCharacterIndex] ?? FALLBACK_CAPTCHA_CHARACTER;
  }).join("");
};

const toNoiseLevelRatio = (noiseLevel: number): number =>
  Math.max(0, Math.min(100, noiseLevel)) / 100;

const createCaptchaBackgroundBuffer = (noiseLevelRatio: number): Buffer => {
  const accentOpacity = (0.08 + noiseLevelRatio * 0.14).toFixed(2);
  const stripeOpacity = (0.05 + noiseLevelRatio * 0.12).toFixed(2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CAPTCHA_IMAGE_WIDTH}" height="${CAPTCHA_IMAGE_HEIGHT}" viewBox="0 0 ${CAPTCHA_IMAGE_WIDTH} ${CAPTCHA_IMAGE_HEIGHT}">
<defs>
<linearGradient id="captcha-gradient" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${CAPTCHA_BACKGROUND_COLOR_START}" />
<stop offset="100%" stop-color="${CAPTCHA_BACKGROUND_COLOR_END}" />
</linearGradient>
<pattern id="captcha-stripes" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="rotate(20)">
<line x1="0" y1="0" x2="0" y2="20" stroke="${CAPTCHA_BACKGROUND_ACCENT_COLOR}" stroke-width="1" />
</pattern>
</defs>
<rect width="100%" height="100%" fill="url(#captcha-gradient)" />
<rect width="100%" height="100%" fill="url(#captcha-stripes)" opacity="${stripeOpacity}" />
<circle cx="46" cy="36" r="28" fill="${CAPTCHA_BACKGROUND_ACCENT_COLOR}" opacity="${accentOpacity}" />
<circle cx="312" cy="104" r="36" fill="${CAPTCHA_BACKGROUND_ACCENT_COLOR}" opacity="${accentOpacity}" />
</svg>`;

  return Buffer.from(svg, "utf8");
};

const createVerificationEmbed = ({
  color,
  description,
  title = t("verification.embed.defaultTitle"),
}: {
  color: number;
  description: string;
  title?: string;
}): EmbedBuilder =>
  new EmbedBuilder()
    .setColor(color)
    .setDescription(description)
    .setTimestamp()
    .setTitle(title);

const createCaptchaChallenge = async ({
  settings,
}: {
  settings: GuildCaptchaSettings;
}): Promise<GeneratedCaptchaChallenge> => {
  const { CaptchaGenerator } = await loadCaptchaCanvasModule();
  const code = generateSecureCaptchaCode({
    caseSensitive: settings.captchaCaseSensitive,
    codeLength: settings.codeLength,
  });
  const noiseLevelRatio = toNoiseLevelRatio(settings.captchaNoiseLevel);

  const captchaGenerator = new CaptchaGenerator({
    height: CAPTCHA_IMAGE_HEIGHT,
    width: CAPTCHA_IMAGE_WIDTH,
  })
    .setBackground(createCaptchaBackgroundBuffer(noiseLevelRatio))
    .setCaptcha({
      colors: CAPTCHA_TEXT_COLORS,
      rotate: 12 + Math.round(28 * noiseLevelRatio),
      size: 56,
      skew: true,
      text: code,
    })
    .setTrace({
      color: "#64748b",
      opacity: noiseLevelRatio === 0 ? 0 : 0.25 + noiseLevelRatio * 0.5,
      size: 1 + Math.round(3 * noiseLevelRatio),
    })
    .setDecoy({
      color: "#94a3b8",
      opacity: noiseLevelRatio === 0 ? 0 : 0.12 + noiseLevelRatio * 0.28,
      size: 14 + Math.round(8 * noiseLevelRatio),
      total: Math.round(noiseLevelRatio * 80),
    });

  const imageBuffer = await captchaGenerator.generate();
  return {
    attachment: new AttachmentBuilder(imageBuffer, {
      description: t("verification.image.description"),
      name: CAPTCHA_IMAGE_FILE_NAME,
    }),
    code,
  };
};

const sendChannelMessageSafely = async ({
  channel,
  options,
}: {
  channel: TextChannel;
  options: MessageCreateOptions;
}): Promise<void> => {
  try {
    await channel.send(options);
  } catch (error: unknown) {
    log.warn({
      channelId: channel.id,
      err: error,
      message: "Failed to send message to captcha verification channel",
    });
  }
};

const deleteChannelSafely = async ({
  channel,
  reason,
}: {
  channel: TextChannel;
  reason: string;
}): Promise<void> => {
  if (!channel.deletable) {
    log.warn({
      channelId: channel.id,
      guildId: channel.guildId,
      message: "Captcha verification channel is not deletable by the bot",
    });
    return;
  }

  try {
    await channel.delete(reason);
  } catch (error: unknown) {
    log.warn({
      channelId: channel.id,
      err: error,
      guildId: channel.guildId,
      message: "Failed to delete captcha verification channel",
    });
  }
};

const isDebugLoggingEnabled = ({
  settings,
  source,
}: {
  settings: GuildCaptchaSettings;
  source: VerificationSource;
}): boolean => settings.debugLogging || source === "debug";

const logCaptchaDebug = ({
  debugEnabled,
  message,
  payload,
}: {
  debugEnabled: boolean;
  message: string;
  payload: Record<string, unknown>;
}): void => {
  if (!debugEnabled) {
    return;
  }

  log.info({ ...payload, message });
};

const collectAdministratorRoleIds = async (guild: Guild): Promise<string[]> => {
  await guild.roles.fetch();

  return guild.roles.cache
    .filter(
      (role) =>
        role.id !== guild.roles.everyone.id &&
        role.permissions.has(PermissionFlagsBits.Administrator)
    )
    .map((role) => role.id);
};

const renderChannelNameFromTemplate = ({
  member,
  template,
}: {
  member: GuildMember;
  template: string;
}): string => {
  const rendered = template
    .replaceAll("{prefix}", CHANNEL_NAME_DEFAULT_PREFIX)
    .replaceAll("{suffix}", member.id.slice(-4))
    .replaceAll("{userid}", member.id)
    .replaceAll("{username}", member.user.username);

  const sanitized = sanitizeChannelSegment(rendered).slice(0, 100);
  if (sanitized.length > 0) {
    return sanitized;
  }

  return `${CHANNEL_NAME_DEFAULT_PREFIX}-member-${member.id.slice(-4)}`;
};

const buildPermissionOverwrites = async ({
  member,
  settings,
}: {
  member: GuildMember;
  settings: GuildCaptchaSettings;
}): Promise<OverwriteResolvable[]> => {
  const botMember =
    member.guild.members.me ?? (await member.guild.members.fetchMe());
  const overwrites: OverwriteResolvable[] = [
    {
      deny: [PermissionFlagsBits.ViewChannel],
      id: member.guild.roles.everyone.id,
    },
    {
      allow: MESSAGE_READ_PERMISSIONS,
      id: member.id,
    },
    {
      allow: [...MESSAGE_READ_PERMISSIONS, PermissionFlagsBits.ManageChannels],
      id: botMember.id,
    },
  ];

  if (!settings.allowAdminAccess) {
    return overwrites;
  }

  const adminRoleIds = await collectAdministratorRoleIds(member.guild);
  for (const roleId of adminRoleIds) {
    overwrites.push({
      allow: MESSAGE_READ_PERMISSIONS,
      id: roleId,
    });
  }

  return overwrites;
};

const isCaptchaVerificationChannel = (channel: TextChannel): boolean =>
  parseVerificationChannelTopic(channel.topic) !== null;

const purgeStaleMemberChannels = async (member: GuildMember): Promise<void> => {
  await member.guild.channels.fetch();

  for (const guildChannel of member.guild.channels.cache.values()) {
    if (guildChannel.type !== ChannelType.GuildText) {
      continue;
    }

    if (parseVerificationChannelTopic(guildChannel.topic) !== member.id) {
      continue;
    }

    await deleteChannelSafely({
      channel: guildChannel,
      reason: t("verification.audit.removeStaleBeforeCreate"),
    });
  }
};

const createVerificationChannelAttempt = async ({
  categoryId,
  debugEnabled,
  member,
  settings,
  source,
}: {
  categoryId: string | null;
  debugEnabled: boolean;
  member: GuildMember;
  settings: GuildCaptchaSettings;
  source: VerificationSource;
}): Promise<TextChannel> => {
  const permissionOverwrites = await buildPermissionOverwrites({
    member,
    settings,
  });

  const createdChannel = await member.guild.channels.create({
    name: renderChannelNameFromTemplate({
      member,
      template: settings.channelNameFormat,
    }),
    parent: categoryId ?? undefined,
    permissionOverwrites,
    reason: t("verification.audit.createReason", {
      memberTag: member.user.tag,
      source,
    }),
    topic: buildVerificationChannelTopic(member.id),
    type: ChannelType.GuildText,
  });

  if (createdChannel.type !== ChannelType.GuildText) {
    throw new Error(
      "Captcha verification channel creation did not return a text channel."
    );
  }

  logCaptchaDebug({
    debugEnabled,
    message: "Created captcha verification channel",
    payload: {
      categoryId,
      channelId: createdChannel.id,
      guildId: member.guild.id,
      source,
      userId: member.id,
    },
  });

  return createdChannel;
};

const createVerificationChannel = async ({
  debugEnabled,
  member,
  settings,
  source,
}: {
  debugEnabled: boolean;
  member: GuildMember;
  settings: GuildCaptchaSettings;
  source: VerificationSource;
}): Promise<TextChannel> => {
  try {
    return await createVerificationChannelAttempt({
      categoryId: settings.captchaCategoryId,
      debugEnabled,
      member,
      settings,
      source,
    });
  } catch (error: unknown) {
    if (!settings.captchaCategoryId) {
      throw error;
    }

    log.warn({
      categoryId: settings.captchaCategoryId,
      err: error,
      guildId: member.guild.id,
      message:
        "Failed to create captcha channel in configured category. Retrying without category.",
    });

    logCaptchaDebug({
      debugEnabled,
      message: "Retrying captcha channel creation without configured category",
      payload: {
        categoryId: settings.captchaCategoryId,
        guildId: member.guild.id,
        source,
        userId: member.id,
      },
    });
  }

  return createVerificationChannelAttempt({
    categoryId: null,
    debugEnabled,
    member,
    settings,
    source,
  });
};

const resolveVerifiedRole = async ({
  guild,
  roleId,
}: {
  guild: Guild;
  roleId: string;
}): Promise<Role | null> => {
  const cachedRole = guild.roles.cache.get(roleId);
  if (cachedRole) {
    return cachedRole;
  }

  try {
    return await guild.roles.fetch(roleId);
  } catch {
    return null;
  }
};

const sendMissingVerifiedRoleMessage = async ({
  channel,
}: {
  channel: TextChannel;
}): Promise<void> => {
  await sendChannelMessageSafely({
    channel,
    options: {
      embeds: [
        createVerificationEmbed({
          color: VERIFICATION_EMBED_COLOR_WARNING,
          description: t("verification.message.missingVerifiedRole"),
        }),
      ],
    },
  });
};

const sendDeletedVerifiedRoleMessage = async ({
  channel,
}: {
  channel: TextChannel;
}): Promise<void> => {
  await sendChannelMessageSafely({
    channel,
    options: {
      embeds: [
        createVerificationEmbed({
          color: VERIFICATION_EMBED_COLOR_WARNING,
          description: t("verification.message.deletedVerifiedRole"),
        }),
      ],
    },
  });
};

const assignVerifiedRoleWithFeedback = async ({
  channel,
  debugEnabled,
  member,
  role,
}: {
  channel: TextChannel;
  debugEnabled: boolean;
  member: GuildMember;
  role: Role;
}): Promise<void> => {
  try {
    await member.roles.add(role.id, t("verification.audit.roleAddReason"));
    await sendChannelMessageSafely({
      channel,
      options: {
        embeds: [
          createVerificationEmbed({
            color: VERIFICATION_EMBED_COLOR_SUCCESS,
            description: t("verification.message.roleAssigned", {
              roleId: role.id,
            }),
          }),
        ],
      },
    });

    logCaptchaDebug({
      debugEnabled,
      message: "Assigned verified role after captcha success",
      payload: {
        guildId: member.guild.id,
        roleId: role.id,
        userId: member.id,
      },
    });
  } catch (error: unknown) {
    log.error({
      err: error,
      guildId: member.guild.id,
      message: "Failed to assign verified role after captcha success",
      roleId: role.id,
      userId: member.id,
    });

    await sendChannelMessageSafely({
      channel,
      options: {
        embeds: [
          createVerificationEmbed({
            color: VERIFICATION_EMBED_COLOR_ERROR,
            description: t("verification.message.roleAssignFailed"),
          }),
        ],
      },
    });

    logCaptchaDebug({
      debugEnabled,
      message: "Role assignment failed after captcha success",
      payload: {
        guildId: member.guild.id,
        roleId: role.id,
        userId: member.id,
      },
    });
  }
};

const handleSuccessfulVerification = async ({
  channel,
  debugEnabled,
  member,
  settings,
}: {
  channel: TextChannel;
  debugEnabled: boolean;
  member: GuildMember;
  settings: GuildCaptchaSettings;
}): Promise<void> => {
  if (!settings.verifiedRoleId) {
    await sendMissingVerifiedRoleMessage({ channel });
    return;
  }

  logCaptchaDebug({
    debugEnabled,
    message: "Resolving configured verified role from guild",
    payload: {
      configuredRoleId: settings.verifiedRoleId,
      guildId: member.guild.id,
      userId: member.id,
    },
  });

  const verifiedRole = await resolveVerifiedRole({
    guild: member.guild,
    roleId: settings.verifiedRoleId,
  });
  if (!verifiedRole) {
    await sendDeletedVerifiedRoleMessage({ channel });
    return;
  }

  await assignVerifiedRoleWithFeedback({
    channel,
    debugEnabled,
    member,
    role: verifiedRole,
  });
};

const kickMemberSafely = async ({
  member,
  reason,
}: {
  member: GuildMember;
  reason: string;
}): Promise<void> => {
  if (!member.kickable) {
    log.warn({
      guildId: member.guild.id,
      message: "Member is not kickable after captcha verification failure",
      userId: member.id,
    });
    return;
  }

  try {
    await member.kick(reason);
  } catch (error: unknown) {
    log.error({
      err: error,
      guildId: member.guild.id,
      message: "Failed to kick member after captcha verification failure",
      userId: member.id,
    });
  }
};

const resolveFailureMessage = (reason: string): string => {
  if (reason === "limit") {
    return t("verification.message.failureLimit");
  }

  if (reason === "time") {
    return t("verification.message.failureTime");
  }

  return t("verification.message.failureDefault");
};

const handleFailedVerification = async ({
  attemptsUsed,
  channel,
  member,
  reason,
  settings,
}: {
  attemptsUsed: number;
  channel: TextChannel;
  member: GuildMember;
  reason: string;
  settings: GuildCaptchaSettings;
}): Promise<void> => {
  const failureMessage = resolveFailureMessage(reason);
  await sendChannelMessageSafely({
    channel,
    options: {
      embeds: [
        createVerificationEmbed({
          color: VERIFICATION_EMBED_COLOR_ERROR,
          description: failureMessage,
        }),
      ],
    },
  });

  if (!settings.kickOnFailure) {
    return;
  }

  await kickMemberSafely({
    member,
    reason: t("verification.audit.kickReason", {
      attemptsUsed,
      failureMessage,
    }),
  });
};

const buildVerificationPromptEmbed = ({
  member,
  retryAfterFailure,
}: {
  member: GuildMember;
  retryAfterFailure: boolean;
}): EmbedBuilder =>
  createVerificationEmbed({
    color: VERIFICATION_EMBED_COLOR_INFO,
    description: retryAfterFailure
      ? t("verification.message.retryPrompt", { memberId: member.id })
      : t("verification.message.welcome", { memberId: member.id }),
    title: retryAfterFailure
      ? t("verification.message.retryTitle")
      : t("verification.message.welcomeTitle"),
  }).setImage(`attachment://${CAPTCHA_IMAGE_FILE_NAME}`);

const shouldDeleteOrphanedChannel = (
  channel: GuildBasedChannel,
  guildId: string
): channel is TextChannel => {
  if (channel.type !== ChannelType.GuildText) {
    return false;
  }

  if (!isCaptchaVerificationChannel(channel)) {
    return false;
  }

  const memberId = parseVerificationChannelTopic(channel.topic);
  if (!memberId) {
    return false;
  }

  const sessionKey = buildSessionKey(guildId, memberId);
  return !activeVerificationSessions.has(sessionKey);
};

const cleanupOrphanedGuildChannels = async (guild: Guild): Promise<void> => {
  await guild.channels.fetch();

  for (const guildChannel of guild.channels.cache.values()) {
    if (!shouldDeleteOrphanedChannel(guildChannel, guild.id)) {
      continue;
    }

    await deleteChannelSafely({
      channel: guildChannel,
      reason: t("verification.audit.cleanupOrphaned"),
    });
  }
};

const createCaptchaChallengeState = ({
  captchaCode,
  settings,
}: {
  captchaCode: string;
  settings: GuildCaptchaSettings;
}): CaptchaChallengeState => ({
  alertThresholdReached: false,
  attemptsUsed: 0,
  challengeMessageId: null,
  expectedResponse: normalizeCaptchaInput({
    caseSensitive: settings.captchaCaseSensitive,
    input: captchaCode,
  }),
  verified: false,
});

const resolveAttemptAlertChannel = async ({
  channelId,
  guild,
}: {
  channelId: string;
  guild: Guild;
}): Promise<TextChannel | null> => {
  const cachedChannel = guild.channels.cache.get(channelId);
  if (cachedChannel?.type === ChannelType.GuildText) {
    return cachedChannel;
  }

  try {
    const fetchedChannel = await guild.channels.fetch(channelId);
    if (!fetchedChannel || fetchedChannel.type !== ChannelType.GuildText) {
      return null;
    }

    return fetchedChannel;
  } catch {
    return null;
  }
};

const shouldSendAttemptThresholdAlert = ({
  attemptsUsed,
  settings,
  state,
}: {
  attemptsUsed: number;
  settings: GuildCaptchaSettings;
  state: CaptchaChallengeState;
}): boolean =>
  !state.alertThresholdReached && attemptsUsed >= settings.maxAttempts;

const sendAttemptThresholdAlert = async ({
  alertChannel,
  attemptsUsed,
  channel,
  member,
  settings,
}: {
  alertChannel: TextChannel;
  attemptsUsed: number;
  channel: TextChannel;
  member: GuildMember;
  settings: GuildCaptchaSettings;
}): Promise<void> => {
  await sendChannelMessageSafely({
    channel: alertChannel,
    options: {
      embeds: [
        createVerificationEmbed({
          color: VERIFICATION_EMBED_COLOR_WARNING,
          description: t("verification.message.attemptAlertThresholdReached", {
            attemptsUsed,
            memberId: member.id,
            threshold: settings.maxAttempts,
            verificationChannelId: channel.id,
          }),
          title: t("verification.message.attemptAlertTitle"),
        }),
      ],
    },
  });
};

const logUnavailableAttemptAlertChannel = ({
  channelId,
  guildId,
}: {
  channelId: string;
  guildId: string;
}): void => {
  log.warn({
    alertChannelId: channelId,
    guildId,
    message: "Configured attempt alert channel is unavailable",
  });
};

const resolveConfiguredAttemptAlertChannel = async ({
  channelId,
  member,
}: {
  channelId: string;
  member: GuildMember;
}): Promise<TextChannel | null> => {
  const alertChannel = await resolveAttemptAlertChannel({
    channelId,
    guild: member.guild,
  });
  if (alertChannel) {
    return alertChannel;
  }

  logUnavailableAttemptAlertChannel({
    channelId,
    guildId: member.guild.id,
  });
  return null;
};

const logAttemptThresholdAlertSent = ({
  alertChannelId,
  attemptsUsed,
  debugEnabled,
  member,
  settings,
  verificationChannelId,
}: {
  alertChannelId: string;
  attemptsUsed: number;
  debugEnabled: boolean;
  member: GuildMember;
  settings: GuildCaptchaSettings;
  verificationChannelId: string;
}): void => {
  logCaptchaDebug({
    debugEnabled,
    message: "Sent captcha attempt threshold alert",
    payload: {
      alertChannelId,
      attemptsUsed,
      guildId: member.guild.id,
      threshold: settings.maxAttempts,
      userId: member.id,
      verificationChannelId,
    },
  });
};

const notifyAttemptThresholdReached = async ({
  attemptsUsed,
  channel,
  debugEnabled,
  member,
  settings,
  state,
}: {
  attemptsUsed: number;
  channel: TextChannel;
  debugEnabled: boolean;
  member: GuildMember;
  settings: GuildCaptchaSettings;
  state: CaptchaChallengeState;
}): Promise<void> => {
  if (!shouldSendAttemptThresholdAlert({ attemptsUsed, settings, state })) {
    return;
  }

  state.alertThresholdReached = true;

  if (!settings.attemptAlertChannelId) {
    return;
  }

  const alertChannel = await resolveConfiguredAttemptAlertChannel({
    channelId: settings.attemptAlertChannelId,
    member,
  });
  if (!alertChannel) {
    return;
  }

  await sendAttemptThresholdAlert({
    alertChannel,
    attemptsUsed,
    channel,
    member,
    settings,
  });

  logAttemptThresholdAlertSent({
    alertChannelId: alertChannel.id,
    attemptsUsed,
    debugEnabled,
    member,
    settings,
    verificationChannelId: channel.id,
  });
};

const createCaptchaCollector = ({
  channel,
  member,
  settings,
}: {
  channel: TextChannel;
  member: GuildMember;
  settings: GuildCaptchaSettings;
}) =>
  channel.createMessageCollector({
    filter: (message) => message.author.id === member.id && !message.author.bot,
    time: settings.timeoutSeconds * 1000,
  });

const awaitCollectorEndReason = async (
  collector: ReturnType<TextChannel["createMessageCollector"]>
): Promise<string> => {
  while (!collector.ended) {
    await waitForMilliseconds(50);
  }

  return collector.endReason ?? "unknown";
};

const sendCaptchaChallenge = async ({
  captchaAttachment,
  channel,
  member,
  retryAfterFailure,
}: {
  captchaAttachment: AttachmentBuilder;
  channel: TextChannel;
  member: GuildMember;
  retryAfterFailure: boolean;
}): Promise<string | null> => {
  const embed = buildVerificationPromptEmbed({
    member,
    retryAfterFailure,
  });

  try {
    const sentMessage = await channel.send({
      embeds: [embed],
      files: [captchaAttachment],
    });
    return sentMessage.id;
  } catch (error: unknown) {
    log.warn({
      channelId: channel.id,
      err: error,
      message: "Failed to send captcha challenge in verification channel",
    });
    return null;
  }
};

const deleteMessageSafely = async ({
  channel,
  messageId,
}: {
  channel: TextChannel;
  messageId: string;
}): Promise<void> => {
  try {
    const message = await channel.messages.fetch(messageId);
    await message.delete();
  } catch (error: unknown) {
    log.warn({
      channelId: channel.id,
      err: error,
      message: "Failed to delete previous captcha challenge message",
      messageId,
    });
  }
};

const deleteFailedAndPreviousChallengeMessages = async ({
  channel,
  failedMessageId,
  previousMessageId,
}: {
  channel: TextChannel;
  failedMessageId: string;
  previousMessageId: string | null;
}): Promise<void> => {
  await deleteMessageSafely({
    channel,
    messageId: failedMessageId,
  });

  if (!previousMessageId) {
    return;
  }

  await deleteMessageSafely({
    channel,
    messageId: previousMessageId,
  });
};

const rotateCaptchaChallenge = async ({
  channel,
  debugEnabled,
  failedMessageId,
  member,
  settings,
  state,
}: {
  channel: TextChannel;
  debugEnabled: boolean;
  failedMessageId: string;
  member: GuildMember;
  settings: GuildCaptchaSettings;
  state: CaptchaChallengeState;
}): Promise<void> => {
  const rotatedChallenge = await createCaptchaChallenge({
    settings,
  });
  const previousMessageId = state.challengeMessageId;
  await deleteFailedAndPreviousChallengeMessages({
    channel,
    failedMessageId,
    previousMessageId,
  });

  const nextChallengeMessageId = await sendCaptchaChallenge({
    captchaAttachment: rotatedChallenge.attachment,
    channel,
    member,
    retryAfterFailure: true,
  });
  if (!nextChallengeMessageId) {
    return;
  }

  state.challengeMessageId = nextChallengeMessageId;
  state.expectedResponse = normalizeCaptchaInput({
    caseSensitive: settings.captchaCaseSensitive,
    input: rotatedChallenge.code,
  });

  logCaptchaDebug({
    debugEnabled,
    message: "Rotated captcha challenge after failed attempt",
    payload: {
      attemptsUsed: state.attemptsUsed,
      challengeMessageId: nextChallengeMessageId,
      guildId: member.guild.id,
      userId: member.id,
    },
  });
};

const handleCaptchaResponse = async ({
  collectedMessageId,
  channel,
  collector,
  debugEnabled,
  member,
  messageContent,
  settings,
  state,
}: {
  collectedMessageId: string;
  channel: TextChannel;
  collector: ReturnType<TextChannel["createMessageCollector"]>;
  debugEnabled: boolean;
  member: GuildMember;
  messageContent: string;
  settings: GuildCaptchaSettings;
  state: CaptchaChallengeState;
}): Promise<void> => {
  if (
    normalizeCaptchaInput({
      caseSensitive: settings.captchaCaseSensitive,
      input: messageContent,
    }) === state.expectedResponse
  ) {
    state.verified = true;
    collector.stop("verified");
    return;
  }

  state.attemptsUsed += 1;

  await notifyAttemptThresholdReached({
    attemptsUsed: state.attemptsUsed,
    channel,
    debugEnabled,
    member,
    settings,
    state,
  });

  await rotateCaptchaChallenge({
    channel,
    debugEnabled,
    failedMessageId: collectedMessageId,
    member,
    settings,
    state,
  });
};

const finalizeCaptchaChallenge = async ({
  channel,
  collectorReason,
  debugEnabled,
  member,
  settings,
  state,
}: {
  channel: TextChannel;
  collectorReason: string;
  debugEnabled: boolean;
  member: GuildMember;
  settings: GuildCaptchaSettings;
  state: CaptchaChallengeState;
}): Promise<void> => {
  logCaptchaDebug({
    debugEnabled,
    message: "Captcha collector finished",
    payload: {
      attemptsUsed: state.attemptsUsed,
      collectorReason,
      guildId: member.guild.id,
      userId: member.id,
      verified: state.verified,
    },
  });

  if (state.verified && collectorReason === "verified") {
    await handleSuccessfulVerification({
      channel,
      debugEnabled,
      member,
      settings,
    });
  } else {
    await handleFailedVerification({
      attemptsUsed: state.attemptsUsed,
      channel,
      member,
      reason: collectorReason,
      settings,
    });
  }

  await waitForMilliseconds(CHANNEL_DELETE_DELAY_MS);
  await deleteChannelSafely({
    channel,
    reason: t("verification.audit.verificationComplete"),
  });
};

const initializeCaptchaChallengeState = async ({
  channel,
  debugEnabled,
  member,
  settings,
}: {
  channel: TextChannel;
  debugEnabled: boolean;
  member: GuildMember;
  settings: GuildCaptchaSettings;
}): Promise<CaptchaChallengeState> => {
  const captchaChallenge = await createCaptchaChallenge({
    settings,
  });
  const challengeState = createCaptchaChallengeState({
    captchaCode: captchaChallenge.code,
    settings,
  });

  logCaptchaDebug({
    debugEnabled,
    message: "Generated captcha challenge",
    payload: {
      captchaCaseSensitive: settings.captchaCaseSensitive,
      captchaCode: captchaChallenge.code,
      captchaNoiseLevel: settings.captchaNoiseLevel,
      codeLength: settings.codeLength,
      guildId: member.guild.id,
      userId: member.id,
    },
  });

  const initialChallengeMessageId = await sendCaptchaChallenge({
    captchaAttachment: captchaChallenge.attachment,
    channel,
    member,
    retryAfterFailure: false,
  });
  if (!initialChallengeMessageId) {
    throw new Error("Unable to send initial captcha challenge message.");
  }

  challengeState.challengeMessageId = initialChallengeMessageId;
  return challengeState;
};

const processCaptchaMessageSafely = async ({
  collectedMessage,
  channel,
  collector,
  debugEnabled,
  member,
  messageContent,
  settings,
  state,
}: {
  collectedMessage: CollectedCaptchaEntry;
  channel: TextChannel;
  collector: ReturnType<TextChannel["createMessageCollector"]>;
  debugEnabled: boolean;
  member: GuildMember;
  messageContent: string;
  settings: GuildCaptchaSettings;
  state: CaptchaChallengeState;
}): Promise<void> => {
  try {
    await handleCaptchaResponse({
      channel,
      collectedMessageId: collectedMessage.id,
      collector,
      debugEnabled,
      member,
      messageContent,
      settings,
      state,
    });
  } catch (error: unknown) {
    log.error({
      channelId: channel.id,
      err: error,
      guildId: member.guild.id,
      message: "Failed to process collected captcha message",
      userId: member.id,
    });
  }
};

const processQueuedCaptchaMessages = async ({
  channel,
  collector,
  debugEnabled,
  member,
  queuedMessages,
  settings,
  state,
  setIsProcessing,
}: {
  channel: TextChannel;
  collector: ReturnType<TextChannel["createMessageCollector"]>;
  debugEnabled: boolean;
  member: GuildMember;
  queuedMessages: CollectedCaptchaEntry[];
  settings: GuildCaptchaSettings;
  state: CaptchaChallengeState;
  setIsProcessing: (value: boolean) => void;
}): Promise<void> => {
  setIsProcessing(true);

  while (queuedMessages.length > 0) {
    const collectedMessage = queuedMessages.shift();
    if (!collectedMessage || collector.ended || state.verified) {
      continue;
    }

    await processCaptchaMessageSafely({
      channel,
      collectedMessage,
      collector,
      debugEnabled,
      member,
      messageContent: collectedMessage.content,
      settings,
      state,
    });
  }

  setIsProcessing(false);
  if (queuedMessages.length > 0) {
    await processQueuedCaptchaMessages({
      channel,
      collector,
      debugEnabled,
      member,
      queuedMessages,
      setIsProcessing,
      settings,
      state,
    });
  }
};

const waitForCaptchaQueueToDrain = async ({
  getIsProcessing,
  queuedMessages,
}: {
  getIsProcessing: () => boolean;
  queuedMessages: CollectedCaptchaEntry[];
}): Promise<void> => {
  while (getIsProcessing() || queuedMessages.length > 0) {
    await waitForMilliseconds(50);
  }
};

const runCaptchaChallenge = async ({
  channel,
  debugEnabled,
  member,
  settings,
}: {
  channel: TextChannel;
  debugEnabled: boolean;
  member: GuildMember;
  settings: GuildCaptchaSettings;
}): Promise<void> => {
  const challengeState = await initializeCaptchaChallengeState({
    channel,
    debugEnabled,
    member,
    settings,
  });

  const collector = createCaptchaCollector({
    channel,
    member,
    settings,
  });
  const queuedMessages: CollectedCaptchaEntry[] = [];
  let isProcessingQueue = false;
  collector.on("collect", async (message) => {
    queuedMessages.push({
      content: message.content,
      id: message.id,
    });
    if (isProcessingQueue) {
      return;
    }

    await processQueuedCaptchaMessages({
      channel,
      collector,
      debugEnabled,
      member,
      queuedMessages,
      setIsProcessing: (value) => {
        isProcessingQueue = value;
      },
      settings,
      state: challengeState,
    });
  });

  const collectorReason = await awaitCollectorEndReason(collector);
  await waitForCaptchaQueueToDrain({
    getIsProcessing: () => isProcessingQueue,
    queuedMessages,
  });
  await finalizeCaptchaChallenge({
    channel,
    collectorReason,
    debugEnabled,
    member,
    settings,
    state: challengeState,
  });
};

const handleVerificationWorkflowError = async ({
  channel,
  error,
  member,
}: {
  channel: TextChannel;
  error: unknown;
  member: GuildMember;
}): Promise<void> => {
  log.error({
    err: error,
    guildId: member.guild.id,
    message: "Failed to process captcha verification for guild member",
    userId: member.id,
  });

  await sendChannelMessageSafely({
    channel,
    options: {
      embeds: [
        createVerificationEmbed({
          color: VERIFICATION_EMBED_COLOR_ERROR,
          description: t("verification.message.internalError"),
        }),
      ],
    },
  });
  await waitForMilliseconds(CHANNEL_DELETE_DELAY_MS);
  await deleteChannelSafely({
    channel,
    reason: t("verification.audit.internalError"),
  });
};

const runVerificationWorkflow = async ({
  member,
  source,
}: {
  member: GuildMember;
  source: VerificationSource;
}): Promise<void> => {
  const settings = await getGuildCaptchaSettings(member.guild);
  const debugEnabled = isDebugLoggingEnabled({
    settings,
    source,
  });

  logCaptchaDebug({
    debugEnabled,
    message: "Loaded captcha settings for verification workflow",
    payload: {
      allowAdminAccess: settings.allowAdminAccess,
      attemptAlertChannelId: settings.attemptAlertChannelId,
      captchaCaseSensitive: settings.captchaCaseSensitive,
      captchaCategoryId: settings.captchaCategoryId,
      captchaNoiseLevel: settings.captchaNoiseLevel,
      codeLength: settings.codeLength,
      debugLogging: settings.debugLogging,
      guildId: member.guild.id,
      kickOnFailure: settings.kickOnFailure,
      maxAttempts: settings.maxAttempts,
      source,
      timeoutSeconds: settings.timeoutSeconds,
      userId: member.id,
      verifiedRoleId: settings.verifiedRoleId,
    },
  });

  await purgeStaleMemberChannels(member);
  const channel = await createVerificationChannel({
    debugEnabled,
    member,
    settings,
    source,
  });

  try {
    await runCaptchaChallenge({
      channel,
      debugEnabled,
      member,
      settings,
    });
  } catch (error: unknown) {
    await handleVerificationWorkflowError({
      channel,
      error,
      member,
    });
  }
};

const logDuplicateSession = ({
  member,
  sessionKey,
}: {
  member: GuildMember;
  sessionKey: string;
}): boolean => {
  if (!activeVerificationSessions.has(sessionKey)) {
    return false;
  }

  log.warn({
    guildId: member.guild.id,
    message: "A captcha verification session is already active for this member",
    userId: member.id,
  });
  return true;
};

const runMemberVerificationSession = async ({
  member,
  sessionKey,
  source,
}: {
  member: GuildMember;
  sessionKey: string;
  source: VerificationSource;
}): Promise<void> => {
  const startedAt = Date.now();

  log.info({
    guildId: member.guild.id,
    message: "Starting captcha verification session",
    source,
    userId: member.id,
  });

  try {
    await runVerificationWorkflow({
      member,
      source,
    });

    log.info({
      durationMs: Date.now() - startedAt,
      guildId: member.guild.id,
      message: "Captcha verification session completed",
      source,
      userId: member.id,
    });
  } catch (error: unknown) {
    log.error({
      durationMs: Date.now() - startedAt,
      err: error,
      guildId: member.guild.id,
      message: "Captcha workflow failed",
      source,
      userId: member.id,
    });
  } finally {
    activeVerificationSessions.delete(sessionKey);
  }
};

const startCaptchaVerificationSession = ({
  member,
  source,
}: {
  member: GuildMember;
  source: VerificationSource;
}): boolean => {
  if (member.user.bot) {
    log.debug({
      guildId: member.guild.id,
      message: "Skipping captcha verification for bot member",
      userId: member.id,
    });
    return false;
  }

  const sessionKey = buildSessionKey(member.guild.id, member.id);
  if (logDuplicateSession({ member, sessionKey })) {
    return false;
  }

  activeVerificationSessions.add(sessionKey);
  runMemberVerificationSession({
    member,
    sessionKey,
    source,
  });

  return true;
};

const resolveVerificationMemberIdFromChannel = (
  channel: GuildBasedChannel
): string | null => {
  if (channel.type !== ChannelType.GuildText) {
    return null;
  }

  return parseVerificationChannelTopic(channel.topic);
};

const collectPendingVerificationMemberIds = (guild: Guild): string[] => {
  const pendingMemberIds = new Set<string>();

  for (const guildChannel of guild.channels.cache.values()) {
    const pendingMemberId =
      resolveVerificationMemberIdFromChannel(guildChannel);
    if (pendingMemberId) {
      pendingMemberIds.add(pendingMemberId);
    }
  }

  return [...pendingMemberIds];
};

const resolveGuildMemberForRecovery = async ({
  guild,
  memberId,
}: {
  guild: Guild;
  memberId: string;
}): Promise<GuildMember | null> => {
  const cachedMember = guild.members.cache.get(memberId);
  if (cachedMember) {
    return cachedMember;
  }

  try {
    return await guild.members.fetch(memberId);
  } catch {
    return null;
  }
};

const isMemberStillUnverified = ({
  member,
  settings,
}: {
  member: GuildMember;
  settings: GuildCaptchaSettings;
}): boolean => {
  if (!settings.verifiedRoleId) {
    return true;
  }

  return !member.roles.cache.has(settings.verifiedRoleId);
};

const recoverPendingVerificationForMember = async ({
  guild,
  memberId,
  settings,
}: {
  guild: Guild;
  memberId: string;
  settings: GuildCaptchaSettings;
}): Promise<void> => {
  const member = await resolveGuildMemberForRecovery({
    guild,
    memberId,
  });
  if (!member) {
    return;
  }

  if (!isMemberStillUnverified({ member, settings })) {
    return;
  }

  startCaptchaVerificationSession({
    member,
    source: "recovery",
  });
};

const recoverPendingVerificationForGuild = async (
  guild: Guild
): Promise<void> => {
  await guild.channels.fetch();

  const pendingMemberIds = collectPendingVerificationMemberIds(guild);
  log.info({
    guildId: guild.id,
    message: "Scanned guild for pending captcha verification sessions",
    pendingMemberCount: pendingMemberIds.length,
  });

  if (pendingMemberIds.length === 0) {
    return;
  }

  const settings = await getGuildCaptchaSettings(guild);
  for (const pendingMemberId of pendingMemberIds) {
    await recoverPendingVerificationForMember({
      guild,
      memberId: pendingMemberId,
      settings,
    });
  }
};

export const cleanupOrphanedVerificationChannels = async (
  client: Client<true>
): Promise<void> => {
  for (const guild of client.guilds.cache.values()) {
    try {
      await cleanupOrphanedGuildChannels(guild);
    } catch (error: unknown) {
      log.warn({
        err: error,
        guildId: guild.id,
        message: "Failed to clean orphaned captcha channels for guild",
      });
    }
  }
};

export const recoverPendingVerificationSessions = async (
  client: Client<true>
): Promise<void> => {
  for (const guild of client.guilds.cache.values()) {
    try {
      await recoverPendingVerificationForGuild(guild);
    } catch (error: unknown) {
      log.warn({
        err: error,
        guildId: guild.id,
        message:
          "Failed to recover pending captcha verification sessions for guild",
      });
    }
  }
};

export const triggerCaptchaVerificationForMember = ({
  member,
  source,
}: {
  member: GuildMember;
  source: VerificationSource;
}): boolean => {
  const started = startCaptchaVerificationSession({ member, source });

  log.info({
    guildId: member.guild.id,
    message: "Captcha verification trigger evaluated",
    source,
    started,
    userId: member.id,
  });

  return started;
};

export const handleGuildMemberAdd = (member: GuildMember): void => {
  triggerCaptchaVerificationForMember({
    member,
    source: "guildMemberAdd",
  });
};
