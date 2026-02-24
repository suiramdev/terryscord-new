import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import type {
  ButtonInteraction,
  Client,
  Guild,
  GuildBasedChannel,
  GuildMember,
  MessageCreateOptions,
  OverwriteResolvable,
  PartialGuildMember,
  Role,
  TextChannel,
} from "discord.js";
import { log } from "evlog";

import { t } from "@/i18n";
import { generateCaptchaImage } from "@/integrations/captcha-image";
import { getGuildCaptchaSettings } from "@/integrations/captcha-settings";
import type { GuildCaptchaSettings } from "@/integrations/captcha-settings";

const CAPTCHA_CHANNEL_TOPIC_PREFIX = "captcha-verification";
const CAPTCHA_IMAGE_FILE_NAME = "captcha.png";
const CAPTCHA_REGENERATE_BUTTON_CUSTOM_ID = "captcha-regenerate";
const CHANNEL_DELETE_DELAY_MS = 2000;
const CHANNEL_NAME_DEFAULT_PREFIX = t("verification.channelName.prefix");
const VERIFICATION_EMBED_COLOR_INFO = 2_484_063;
const VERIFICATION_EMBED_COLOR_SUCCESS = 2_212_308;
const VERIFICATION_EMBED_COLOR_WARNING = 15_865_867;
const VERIFICATION_EMBED_COLOR_ERROR = 15_583_145;
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

interface CaptchaQueueState {
  isProcessing: boolean;
  queuedMessages: CollectedCaptchaEntry[];
}

type VerificationSource =
  | "bulkRecreate"
  | "debug"
  | "guildMemberAdd"
  | "recovery";
type VerificationPromptVariant = "initial" | "regenerate" | "retry";

export interface TriggerUnverifiedCaptchaSummary {
  alreadyActiveSessionCount: number;
  alreadyVerifiedCount: number;
  botMemberCount: number;
  nonVerifiedMemberCount: number;
  startedSessionCount: number;
  totalMemberCount: number;
}

const waitForMilliseconds = async (milliseconds: number): Promise<void> => {
  await Bun.sleep(milliseconds);
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
  const { code, imageBuffer } = await generateCaptchaImage({ settings });
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

const collectVerificationChannelsForMember = async ({
  guild,
  memberId,
}: {
  guild: Guild;
  memberId: string;
}): Promise<TextChannel[]> => {
  await guild.channels.fetch();
  const verificationChannels: TextChannel[] = [];

  for (const guildChannel of guild.channels.cache.values()) {
    if (guildChannel.type !== ChannelType.GuildText) {
      continue;
    }

    if (parseVerificationChannelTopic(guildChannel.topic) !== memberId) {
      continue;
    }

    verificationChannels.push(guildChannel);
  }

  return verificationChannels;
};

const deleteVerificationChannelsForMember = async ({
  guild,
  memberId,
  reason,
}: {
  guild: Guild;
  memberId: string;
  reason: string;
}): Promise<void> => {
  const verificationChannels = await collectVerificationChannelsForMember({
    guild,
    memberId,
  });
  for (const verificationChannel of verificationChannels) {
    await deleteChannelSafely({
      channel: verificationChannel,
      reason,
    });
  }
};

const resolveExistingVerificationChannelForMember = async ({
  guild,
  memberId,
}: {
  guild: Guild;
  memberId: string;
}): Promise<TextChannel | null> => {
  const verificationChannels = await collectVerificationChannelsForMember({
    guild,
    memberId,
  });
  return verificationChannels[0] ?? null;
};

const purgeStaleMemberChannels = async (member: GuildMember): Promise<void> => {
  await deleteVerificationChannelsForMember({
    guild: member.guild,
    memberId: member.id,
    reason: t("verification.audit.removeStaleBeforeCreate"),
  });
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

const createCaptchaChallengeActions = (): ActionRowBuilder<ButtonBuilder>[] => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CAPTCHA_REGENERATE_BUTTON_CUSTOM_ID)
      .setLabel(t("verification.button.regenerate"))
      .setStyle(ButtonStyle.Secondary)
  ),
];

const buildVerificationPromptEmbed = ({
  member,
  promptVariant,
}: {
  member: GuildMember;
  promptVariant: VerificationPromptVariant;
}): EmbedBuilder => {
  if (promptVariant === "retry") {
    return createVerificationEmbed({
      color: VERIFICATION_EMBED_COLOR_INFO,
      description: t("verification.message.retryPrompt", {
        memberId: member.id,
      }),
      title: t("verification.message.retryTitle"),
    }).setImage(`attachment://${CAPTCHA_IMAGE_FILE_NAME}`);
  }

  if (promptVariant === "regenerate") {
    return createVerificationEmbed({
      color: VERIFICATION_EMBED_COLOR_INFO,
      description: t("verification.message.regeneratePrompt", {
        memberId: member.id,
      }),
      title: t("verification.message.regenerateTitle"),
    }).setImage(`attachment://${CAPTCHA_IMAGE_FILE_NAME}`);
  }

  return createVerificationEmbed({
    color: VERIFICATION_EMBED_COLOR_INFO,
    description: t("verification.message.welcome", { memberId: member.id }),
    title: t("verification.message.welcomeTitle"),
  }).setImage(`attachment://${CAPTCHA_IMAGE_FILE_NAME}`);
};

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
}: {
  channel: TextChannel;
  member: GuildMember;
}) =>
  channel.createMessageCollector({
    filter: (message) => message.author.id === member.id && !message.author.bot,
  });

const createCaptchaRegenerateCollector = ({
  channel,
  member,
}: {
  channel: TextChannel;
  member: GuildMember;
}) =>
  channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (interaction) =>
      interaction.customId === CAPTCHA_REGENERATE_BUTTON_CUSTOM_ID &&
      interaction.user.id === member.id,
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
  promptVariant,
}: {
  captchaAttachment: AttachmentBuilder;
  channel: TextChannel;
  member: GuildMember;
  promptVariant: VerificationPromptVariant;
}): Promise<string | null> => {
  const embed = buildVerificationPromptEmbed({
    member,
    promptVariant,
  });

  try {
    const sentMessage = await channel.send({
      components: createCaptchaChallengeActions(),
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

const acknowledgeCaptchaRegenerateInteraction = async ({
  interaction,
}: {
  interaction: ButtonInteraction;
}): Promise<boolean> => {
  try {
    await interaction.deferUpdate();
    return true;
  } catch (error: unknown) {
    log.warn({
      channelId: interaction.channelId,
      err: error,
      message: "Failed to acknowledge captcha regenerate interaction",
      userId: interaction.user.id,
    });
    return false;
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

const isDefinedMessageId = (messageId: string | null): messageId is string =>
  typeof messageId === "string";

const removeCaptchaChallengeMessages = async ({
  channel,
  messageIds,
}: {
  channel: TextChannel;
  messageIds: (string | null)[];
}): Promise<void> => {
  const uniqueMessageIds = [...new Set(messageIds.filter(isDefinedMessageId))];
  for (const messageId of uniqueMessageIds) {
    await deleteMessageSafely({
      channel,
      messageId,
    });
  }
};

const refreshCaptchaChallenge = async ({
  channel,
  debugEnabled,
  debugLogMessage,
  messageIdsToDelete,
  member,
  promptVariant,
  settings,
  state,
}: {
  channel: TextChannel;
  debugEnabled: boolean;
  debugLogMessage: string;
  messageIdsToDelete: (string | null)[];
  member: GuildMember;
  promptVariant: VerificationPromptVariant;
  settings: GuildCaptchaSettings;
  state: CaptchaChallengeState;
}): Promise<void> => {
  const nextChallenge = await createCaptchaChallenge({
    settings,
  });
  await removeCaptchaChallengeMessages({
    channel,
    messageIds: messageIdsToDelete,
  });

  const nextChallengeMessageId = await sendCaptchaChallenge({
    captchaAttachment: nextChallenge.attachment,
    channel,
    member,
    promptVariant,
  });
  if (!nextChallengeMessageId) {
    return;
  }

  state.challengeMessageId = nextChallengeMessageId;
  state.expectedResponse = normalizeCaptchaInput({
    caseSensitive: settings.captchaCaseSensitive,
    input: nextChallenge.code,
  });

  logCaptchaDebug({
    debugEnabled,
    message: debugLogMessage,
    payload: {
      attemptsUsed: state.attemptsUsed,
      challengeMessageId: nextChallengeMessageId,
      guildId: member.guild.id,
      userId: member.id,
    },
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
  await refreshCaptchaChallenge({
    channel,
    debugEnabled,
    debugLogMessage: "Rotated captcha challenge after failed attempt",
    member,
    messageIdsToDelete: [failedMessageId, state.challengeMessageId],
    promptVariant: "retry",
    settings,
    state,
  });
};

const regenerateCaptchaChallenge = async ({
  channel,
  debugEnabled,
  member,
  settings,
  state,
}: {
  channel: TextChannel;
  debugEnabled: boolean;
  member: GuildMember;
  settings: GuildCaptchaSettings;
  state: CaptchaChallengeState;
}): Promise<void> => {
  await refreshCaptchaChallenge({
    channel,
    debugEnabled,
    debugLogMessage: "Regenerated captcha challenge from button interaction",
    member,
    messageIdsToDelete: [state.challengeMessageId],
    promptVariant: "regenerate",
    settings,
    state,
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
    await waitForMilliseconds(CHANNEL_DELETE_DELAY_MS);
    await deleteChannelSafely({
      channel,
      reason: t("verification.audit.verificationComplete"),
    });
    return;
  }

  await handleFailedVerification({
    attemptsUsed: state.attemptsUsed,
    channel,
    member,
    reason: collectorReason,
    settings,
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
    promptVariant: "initial",
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

const createCaptchaQueueState = (): CaptchaQueueState => ({
  isProcessing: false,
  queuedMessages: [],
});

const drainQueuedCaptchaMessages = async ({
  channel,
  collector,
  debugEnabled,
  member,
  queueState,
  settings,
  state,
}: {
  channel: TextChannel;
  collector: ReturnType<TextChannel["createMessageCollector"]>;
  debugEnabled: boolean;
  member: GuildMember;
  queueState: CaptchaQueueState;
  settings: GuildCaptchaSettings;
  state: CaptchaChallengeState;
}): Promise<void> => {
  await processQueuedCaptchaMessages({
    channel,
    collector,
    debugEnabled,
    member,
    queuedMessages: queueState.queuedMessages,
    setIsProcessing: (value) => {
      queueState.isProcessing = value;
    },
    settings,
    state,
  });
};

const flushCaptchaQueueIfNeeded = async ({
  channel,
  collector,
  debugEnabled,
  member,
  queueState,
  settings,
  state,
}: {
  channel: TextChannel;
  collector: ReturnType<TextChannel["createMessageCollector"]>;
  debugEnabled: boolean;
  member: GuildMember;
  queueState: CaptchaQueueState;
  settings: GuildCaptchaSettings;
  state: CaptchaChallengeState;
}): Promise<void> => {
  if (
    queueState.isProcessing ||
    queueState.queuedMessages.length === 0 ||
    collector.ended ||
    state.verified
  ) {
    return;
  }

  await drainQueuedCaptchaMessages({
    channel,
    collector,
    debugEnabled,
    member,
    queueState,
    settings,
    state,
  });
};

const enqueueCaptchaMessage = ({
  message,
  queueState,
}: {
  message: CollectedCaptchaEntry;
  queueState: CaptchaQueueState;
}): void => {
  queueState.queuedMessages.push(message);
};

const stopRegenerateCollectorOnEnd = ({
  collector,
  regenerateCollector,
}: {
  collector: ReturnType<TextChannel["createMessageCollector"]>;
  regenerateCollector: ReturnType<typeof createCaptchaRegenerateCollector>;
}): void => {
  collector.on("end", (_collected, reason) => {
    if (!regenerateCollector.ended) {
      regenerateCollector.stop(reason);
    }
  });
};

const logCaptchaRegenerateFailure = ({
  channel,
  error,
  member,
}: {
  channel: TextChannel;
  error: unknown;
  member: GuildMember;
}): void => {
  log.error({
    channelId: channel.id,
    err: error,
    guildId: member.guild.id,
    message: "Failed to regenerate captcha challenge from button",
    userId: member.id,
  });
};

const runCaptchaRegenerationWithQueueLock = async ({
  channel,
  collector,
  debugEnabled,
  member,
  queueState,
  settings,
  state,
}: {
  channel: TextChannel;
  collector: ReturnType<TextChannel["createMessageCollector"]>;
  debugEnabled: boolean;
  member: GuildMember;
  queueState: CaptchaQueueState;
  settings: GuildCaptchaSettings;
  state: CaptchaChallengeState;
}): Promise<void> => {
  queueState.isProcessing = true;
  try {
    await regenerateCaptchaChallenge({
      channel,
      debugEnabled,
      member,
      settings,
      state,
    });
  } catch (error: unknown) {
    logCaptchaRegenerateFailure({
      channel,
      error,
      member,
    });
  } finally {
    queueState.isProcessing = false;
    await flushCaptchaQueueIfNeeded({
      channel,
      collector,
      debugEnabled,
      member,
      queueState,
      settings,
      state,
    });
  }
};

const handleCaptchaRegenerateCollect = async ({
  channel,
  collector,
  debugEnabled,
  interaction,
  member,
  queueState,
  settings,
  state,
}: {
  channel: TextChannel;
  collector: ReturnType<TextChannel["createMessageCollector"]>;
  debugEnabled: boolean;
  interaction: ButtonInteraction;
  member: GuildMember;
  queueState: CaptchaQueueState;
  settings: GuildCaptchaSettings;
  state: CaptchaChallengeState;
}): Promise<void> => {
  if (collector.ended || state.verified) {
    return;
  }

  if (!(await acknowledgeCaptchaRegenerateInteraction({ interaction }))) {
    return;
  }

  if (
    queueState.isProcessing ||
    interaction.message.id !== state.challengeMessageId
  ) {
    return;
  }

  await runCaptchaRegenerationWithQueueLock({
    channel,
    collector,
    debugEnabled,
    member,
    queueState,
    settings,
    state,
  });
};

const waitForCaptchaQueueToDrain = async ({
  queueState,
}: {
  queueState: CaptchaQueueState;
}): Promise<void> => {
  while (queueState.isProcessing || queueState.queuedMessages.length > 0) {
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
  });
  const regenerateCollector = createCaptchaRegenerateCollector({
    channel,
    member,
  });
  const queueState = createCaptchaQueueState();

  collector.on("collect", async (message) => {
    enqueueCaptchaMessage({
      message: {
        content: message.content,
        id: message.id,
      },
      queueState,
    });

    await flushCaptchaQueueIfNeeded({
      channel,
      collector,
      debugEnabled,
      member,
      queueState,
      settings,
      state: challengeState,
    });
  });

  stopRegenerateCollectorOnEnd({
    collector,
    regenerateCollector,
  });

  regenerateCollector.on("collect", async (interaction) => {
    await handleCaptchaRegenerateCollect({
      channel,
      collector,
      debugEnabled,
      interaction,
      member,
      queueState,
      settings,
      state: challengeState,
    });
  });

  const collectorReason = await awaitCollectorEndReason(collector);
  await waitForCaptchaQueueToDrain({
    queueState,
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
};

const resolveVerificationChannelForWorkflow = async ({
  debugEnabled,
  member,
  settings,
  source,
}: {
  debugEnabled: boolean;
  member: GuildMember;
  settings: GuildCaptchaSettings;
  source: VerificationSource;
}): Promise<TextChannel | null> => {
  if (source !== "recovery") {
    await purgeStaleMemberChannels(member);
    return await createVerificationChannel({
      debugEnabled,
      member,
      settings,
      source,
    });
  }

  const existingChannel = await resolveExistingVerificationChannelForMember({
    guild: member.guild,
    memberId: member.id,
  });
  if (existingChannel) {
    return existingChannel;
  }

  logCaptchaDebug({
    debugEnabled,
    message:
      "Skipping recovery verification start because existing captcha channel was not found",
    payload: {
      guildId: member.guild.id,
      source,
      userId: member.id,
    },
  });
  return null;
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

  const channel = await resolveVerificationChannelForWorkflow({
    debugEnabled,
    member,
    settings,
    source,
  });
  if (!channel) {
    return;
  }

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

const createEmptyTriggerUnverifiedCaptchaSummary =
  (): TriggerUnverifiedCaptchaSummary => ({
    alreadyActiveSessionCount: 0,
    alreadyVerifiedCount: 0,
    botMemberCount: 0,
    nonVerifiedMemberCount: 0,
    startedSessionCount: 0,
    totalMemberCount: 0,
  });

const collectUnverifiedMemberCaptchaSummary = ({
  member,
  source,
  summary,
}: {
  member: GuildMember;
  source: VerificationSource;
  summary: TriggerUnverifiedCaptchaSummary;
}): void => {
  summary.nonVerifiedMemberCount += 1;

  if (startCaptchaVerificationSession({ member, source })) {
    summary.startedSessionCount += 1;
    return;
  }

  summary.alreadyActiveSessionCount += 1;
};

const collectMemberCaptchaSummary = ({
  member,
  settings,
  source,
  summary,
}: {
  member: GuildMember;
  settings: GuildCaptchaSettings;
  source: VerificationSource;
  summary: TriggerUnverifiedCaptchaSummary;
}): void => {
  summary.totalMemberCount += 1;

  if (member.user.bot) {
    summary.botMemberCount += 1;
    return;
  }

  if (!isMemberStillUnverified({ member, settings })) {
    summary.alreadyVerifiedCount += 1;
    return;
  }

  collectUnverifiedMemberCaptchaSummary({
    member,
    source,
    summary,
  });
};

const logUnverifiedCaptchaSummary = ({
  guild,
  settings,
  source,
  summary,
}: {
  guild: Guild;
  settings: GuildCaptchaSettings;
  source: VerificationSource;
  summary: TriggerUnverifiedCaptchaSummary;
}): void => {
  log.info({
    alreadyActiveSessionCount: summary.alreadyActiveSessionCount,
    alreadyVerifiedCount: summary.alreadyVerifiedCount,
    botMemberCount: summary.botMemberCount,
    guildId: guild.id,
    message:
      "Bulk captcha verification trigger evaluated for unverified members",
    nonVerifiedMemberCount: summary.nonVerifiedMemberCount,
    source,
    startedSessionCount: summary.startedSessionCount,
    totalMemberCount: summary.totalMemberCount,
    verifiedRoleId: settings.verifiedRoleId,
  });
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

export const triggerCaptchaVerificationForUnverifiedMembers = async ({
  guild,
  source,
}: {
  guild: Guild;
  source: VerificationSource;
}): Promise<TriggerUnverifiedCaptchaSummary> => {
  await guild.members.fetch();

  const settings = await getGuildCaptchaSettings(guild);
  const summary = createEmptyTriggerUnverifiedCaptchaSummary();

  for (const member of guild.members.cache.values()) {
    collectMemberCaptchaSummary({
      member,
      settings,
      source,
      summary,
    });
  }

  logUnverifiedCaptchaSummary({
    guild,
    settings,
    source,
    summary,
  });

  return summary;
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

export const handleGuildMemberRemove = async (
  member: GuildMember | PartialGuildMember
): Promise<void> => {
  activeVerificationSessions.delete(
    buildSessionKey(member.guild.id, member.id)
  );

  await deleteVerificationChannelsForMember({
    guild: member.guild,
    memberId: member.id,
    reason: t("verification.audit.memberLeft"),
  });
};
