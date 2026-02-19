import { env } from "@terryscord/env/bot";
import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type {
  CategoryChannel,
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  Role,
  TextChannel,
} from "discord.js";

import { replyWithEmbed } from "@/discord/embeds";
import type { BotEmbedTone } from "@/discord/embeds";
import { triggerCaptchaVerificationForMember } from "@/discord/events/guild-member-add";
import { t } from "@/i18n";
import {
  CAPTCHA_LIMITS,
  CAPTCHA_TYPE_VALUES,
  getGuildCaptchaSettings,
  getStoredGuildCaptchaSettings,
  upsertGuildCaptchaSettings,
} from "@/integrations/captcha-settings";
import type {
  GuildCaptchaSettings,
  GuildCaptchaSettingsPatch,
} from "@/integrations/captcha-settings";

import type { SlashCommand } from "./types";

const ADMINISTRATOR_PERMISSION = PermissionFlagsBits.Administrator;
const SET_GROUP_NAME = "set";

const RESET_OPTIONS = [
  "attempt-alert-channel",
  "verified-role",
  "captcha-category",
  "max-attempts",
  "timeout-seconds",
  "kick-on-failure",
  "allow-admin-access",
  "channel-name-format",
  "captcha-type",
  "code-length",
  "noise-level",
  "case-sensitive",
  "debug-logging",
  "all",
] as const;

type ResetOption = (typeof RESET_OPTIONS)[number];

const RESET_OPTION_LABEL_KEYS: Record<ResetOption, Parameters<typeof t>[0]> = {
  all: "commands.captcha.resetChoice.all",
  "allow-admin-access": "commands.captcha.resetChoice.allowAdminAccess",
  "attempt-alert-channel": "commands.captcha.resetChoice.attemptAlertChannel",
  "captcha-category": "commands.captcha.resetChoice.captchaCategory",
  "captcha-type": "commands.captcha.resetChoice.captchaType",
  "case-sensitive": "commands.captcha.resetChoice.caseSensitive",
  "channel-name-format": "commands.captcha.resetChoice.channelNameFormat",
  "code-length": "commands.captcha.resetChoice.codeLength",
  "debug-logging": "commands.captcha.resetChoice.debugLogging",
  "kick-on-failure": "commands.captcha.resetChoice.kickOnFailure",
  "max-attempts": "commands.captcha.resetChoice.maxAttempts",
  "noise-level": "commands.captcha.resetChoice.noiseLevel",
  "timeout-seconds": "commands.captcha.resetChoice.timeoutSeconds",
  "verified-role": "commands.captcha.resetChoice.verifiedRole",
};

const getInteractionLocale = (
  interaction: ChatInputCommandInteraction
): string | null => interaction.locale ?? interaction.guildLocale ?? null;

const getResetOptionLabel = (option: ResetOption): string =>
  t(RESET_OPTION_LABEL_KEYS[option]);

interface CommandError {
  message: string;
  type: "error";
}

interface AdminContext {
  botMember: GuildMember;
  guild: Guild;
  type: "success";
}

type AdminContextResult = AdminContext | CommandError;

interface HandlerArgs {
  context: AdminContext;
  interaction: ChatInputCommandInteraction;
}

type SubcommandHandler = (args: HandlerArgs) => Promise<void>;

const replyEphemeral = async ({
  content,
  interaction,
  tone = "error",
}: {
  content: string;
  interaction: ChatInputCommandInteraction;
  tone?: BotEmbedTone;
}): Promise<void> => {
  await replyWithEmbed({
    interaction,
    message: content,
    tone,
  });
};

const createCommandError = (message: string): CommandError => ({
  message,
  type: "error",
});

const resolveBotMember = async (guild: Guild): Promise<GuildMember | null> => {
  if (guild.members.me) {
    return guild.members.me;
  }

  try {
    return await guild.members.fetchMe();
  } catch {
    return null;
  }
};

const resolveAdminContext = async (
  interaction: ChatInputCommandInteraction
): Promise<AdminContextResult> => {
  const preferredLocale = getInteractionLocale(interaction);
  const { guild } = interaction;
  if (!guild) {
    return createCommandError(
      t("captcha.errors.serverOnly", undefined, preferredLocale)
    );
  }

  if (!interaction.memberPermissions?.has(ADMINISTRATOR_PERMISSION)) {
    return createCommandError(
      t("captcha.errors.adminRequired", undefined, preferredLocale)
    );
  }

  const botMember = await resolveBotMember(guild);
  if (!botMember) {
    return createCommandError(
      t("captcha.errors.botMemberUnavailable", undefined, preferredLocale)
    );
  }

  return {
    botMember,
    guild,
    type: "success",
  };
};

const savePatch = async ({
  guildId,
  patch,
}: {
  guildId: string;
  patch: GuildCaptchaSettingsPatch;
}): Promise<boolean> => {
  try {
    await upsertGuildCaptchaSettings({ guildId, patch });
    return true;
  } catch {
    return false;
  }
};

const savePatchAndReply = async ({
  guildId,
  interaction,
  patch,
  successMessage,
}: {
  guildId: string;
  interaction: ChatInputCommandInteraction;
  patch: GuildCaptchaSettingsPatch;
  successMessage: string;
}): Promise<void> => {
  const saved = await savePatch({ guildId, patch });
  if (!saved) {
    const preferredLocale = getInteractionLocale(interaction);
    await replyEphemeral({
      content: t("captcha.errors.saveFailed", undefined, preferredLocale),
      interaction,
    });
    return;
  }

  await replyEphemeral({
    content: successMessage,
    interaction,
    tone: "success",
  });
};

const validateRoleSelection = ({
  botMember,
  guild,
  preferredLocale,
  role,
}: {
  botMember: GuildMember;
  guild: Guild;
  preferredLocale?: string | null;
  role: Role;
}): string | null => {
  if (role.id === guild.roles.everyone.id) {
    return t("captcha.errors.roleEveryone", undefined, preferredLocale);
  }

  if (role.managed) {
    return t("captcha.errors.roleManaged", undefined, preferredLocale);
  }

  if (role.position >= botMember.roles.highest.position) {
    return t("captcha.errors.roleAboveBot", undefined, preferredLocale);
  }

  return null;
};

const resolveRoleFromOption = ({
  guild,
  interaction,
}: {
  guild: Guild;
  interaction: ChatInputCommandInteraction;
}): Promise<Role | null> => {
  const selectedRole = interaction.options.getRole("role", true);
  const cachedRole = guild.roles.cache.get(selectedRole.id);
  if (cachedRole) {
    return Promise.resolve(cachedRole);
  }

  return guild.roles.fetch(selectedRole.id);
};

const validateChannelNameFormat = ({
  format,
  preferredLocale,
}: {
  format: string;
  preferredLocale?: string | null;
}): string | null => {
  const trimmed = format.trim();
  if (trimmed.length < 3 || trimmed.length > 80) {
    return t("captcha.errors.channelFormatLength", undefined, preferredLocale);
  }

  return null;
};

const resolveCachedCategoryById = ({
  categoryId,
  guild,
}: {
  categoryId: string;
  guild: Guild;
}): CategoryChannel | null => {
  const cachedChannel = guild.channels.cache.get(categoryId);
  if (cachedChannel?.type !== ChannelType.GuildCategory) {
    return null;
  }

  return cachedChannel;
};

const resolveFetchedCategoryById = async ({
  categoryId,
  guild,
}: {
  categoryId: string;
  guild: Guild;
}): Promise<CategoryChannel | null> => {
  try {
    const fetchedChannel = await guild.channels.fetch(categoryId);
    if (!fetchedChannel || fetchedChannel.type !== ChannelType.GuildCategory) {
      return null;
    }

    return fetchedChannel;
  } catch {
    return null;
  }
};

const resolveCategoryById = ({
  categoryId,
  guild,
}: {
  categoryId: string;
  guild: Guild;
}): Promise<CategoryChannel | null> => {
  const cachedCategory = resolveCachedCategoryById({ categoryId, guild });
  if (cachedCategory) {
    return Promise.resolve(cachedCategory);
  }

  return resolveFetchedCategoryById({ categoryId, guild });
};

const resolveTextChannelById = async ({
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

const validateCategoryBotPermissions = ({
  botMember,
  category,
  preferredLocale,
}: {
  botMember: GuildMember;
  category: CategoryChannel;
  preferredLocale?: string | null;
}): string | null => {
  const botPermissions = category.permissionsFor(botMember);
  if (!botPermissions?.has(PermissionFlagsBits.ViewChannel)) {
    return t(
      "captcha.errors.categoryViewPermission",
      undefined,
      preferredLocale
    );
  }

  if (!botPermissions.has(PermissionFlagsBits.ManageChannels)) {
    return t(
      "captcha.errors.categoryManagePermission",
      undefined,
      preferredLocale
    );
  }

  return null;
};

const saveCategoryAndReply = async ({
  category,
  context,
  interaction,
}: {
  category: CategoryChannel;
  context: AdminContext;
  interaction: ChatInputCommandInteraction;
}): Promise<void> => {
  const permissionError = validateCategoryBotPermissions({
    botMember: context.botMember,
    category,
    preferredLocale: getInteractionLocale(interaction),
  });
  if (permissionError) {
    await replyEphemeral({
      content: permissionError,
      interaction,
    });
    return;
  }

  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      captchaCategoryId: category.id,
    },
    successMessage: t(
      "captcha.success.categorySet",
      { categoryName: category.name },
      getInteractionLocale(interaction)
    ),
  });
};

const formatBoolean = (
  value: boolean,
  preferredLocale?: string | null
): string =>
  t(value ? "common.enabled" : "common.disabled", undefined, preferredLocale);

const formatOptionalValue = (
  value: string | null,
  preferredLocale?: string | null
): string =>
  value && value.length > 0
    ? value
    : t("common.notConfigured", undefined, preferredLocale);

const formatOptionalChannelMention = (
  channelId: string | null,
  preferredLocale?: string | null
): string =>
  channelId && channelId.length > 0
    ? `<#${channelId}>`
    : t("common.notConfigured", undefined, preferredLocale);

const buildShowMessage = ({
  preferredLocale,
  settings,
  storedExists,
}: {
  preferredLocale?: string | null;
  settings: GuildCaptchaSettings;
  storedExists: boolean;
}): string => {
  const source = storedExists
    ? t("captcha.show.sourceStored", undefined, preferredLocale)
    : t("captcha.show.sourceDefault", undefined, preferredLocale);

  return [
    t("captcha.show.title", undefined, preferredLocale),
    source,
    t(
      "captcha.show.verifiedRole",
      { value: formatOptionalValue(settings.verifiedRoleId, preferredLocale) },
      preferredLocale
    ),
    t(
      "captcha.show.captchaCategory",
      {
        value: formatOptionalValue(settings.captchaCategoryId, preferredLocale),
      },
      preferredLocale
    ),
    t(
      "captcha.show.attemptAlertChannel",
      {
        value: formatOptionalChannelMention(
          settings.attemptAlertChannelId,
          preferredLocale
        ),
      },
      preferredLocale
    ),
    t(
      "captcha.show.maxAttempts",
      { value: settings.maxAttempts },
      preferredLocale
    ),
    t(
      "captcha.show.timeoutSeconds",
      { value: settings.timeoutSeconds },
      preferredLocale
    ),
    t(
      "captcha.show.kickOnFailure",
      { value: formatBoolean(settings.kickOnFailure, preferredLocale) },
      preferredLocale
    ),
    t(
      "captcha.show.allowAdminAccess",
      { value: formatBoolean(settings.allowAdminAccess, preferredLocale) },
      preferredLocale
    ),
    t(
      "captcha.show.channelNameFormat",
      { value: settings.channelNameFormat },
      preferredLocale
    ),
    t(
      "captcha.show.captchaType",
      { value: settings.captchaType },
      preferredLocale
    ),
    t(
      "captcha.show.codeLength",
      { value: settings.codeLength },
      preferredLocale
    ),
    t(
      "captcha.show.noiseLevel",
      { value: settings.captchaNoiseLevel },
      preferredLocale
    ),
    t(
      "captcha.show.caseSensitiveAnswers",
      { value: formatBoolean(settings.captchaCaseSensitive, preferredLocale) },
      preferredLocale
    ),
    t(
      "captcha.show.debugLogging",
      { value: formatBoolean(settings.debugLogging, preferredLocale) },
      preferredLocale
    ),
  ].join("\n");
};

const handleSetVerifiedRole = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const role = await resolveRoleFromOption({
    guild: context.guild,
    interaction,
  });
  if (!role) {
    await replyEphemeral({
      content: t(
        "captcha.errors.selectedRoleNotFound",
        undefined,
        preferredLocale
      ),
      interaction,
    });
    return;
  }

  const validationError = validateRoleSelection({
    botMember: context.botMember,
    guild: context.guild,
    preferredLocale,
    role,
  });
  if (validationError) {
    await replyEphemeral({
      content: validationError,
      interaction,
    });
    return;
  }

  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      verifiedRoleId: role.id,
    },
    successMessage: t(
      "captcha.success.verifiedRoleSet",
      { roleId: role.id },
      preferredLocale
    ),
  });
};

const handleSetCategory = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const selectedChannel = interaction.options.getChannel("category", true);
  if (selectedChannel.type !== ChannelType.GuildCategory) {
    await replyEphemeral({
      content: t(
        "captcha.errors.selectedChannelNotCategory",
        undefined,
        preferredLocale
      ),
      interaction,
    });
    return;
  }

  const category = await resolveCategoryById({
    categoryId: selectedChannel.id,
    guild: context.guild,
  });
  if (!category) {
    await replyEphemeral({
      content: t(
        "captcha.errors.selectedCategoryNotResolved",
        undefined,
        preferredLocale
      ),
      interaction,
    });
    return;
  }

  await saveCategoryAndReply({
    category,
    context,
    interaction,
  });
};

const handleSetCategoryById = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const categoryId = interaction.options.getString("category-id", true).trim();
  const category = await resolveCategoryById({
    categoryId,
    guild: context.guild,
  });
  if (!category) {
    await replyEphemeral({
      content: t(
        "captcha.errors.categoryIdInvalid",
        undefined,
        preferredLocale
      ),
      interaction,
    });
    return;
  }

  await saveCategoryAndReply({
    category,
    context,
    interaction,
  });
};

const isValidAttemptAlertChannelType = (channelType: ChannelType): boolean =>
  channelType === ChannelType.GuildText;

const resolveAttemptAlertChannelForSetting = ({
  guild,
  selectedChannel,
}: {
  guild: Guild;
  selectedChannel: ReturnType<
    ChatInputCommandInteraction["options"]["getChannel"]
  >;
}): Promise<TextChannel | null> => {
  if (
    !selectedChannel ||
    !isValidAttemptAlertChannelType(selectedChannel.type)
  ) {
    return Promise.resolve(null);
  }

  return resolveTextChannelById({
    channelId: selectedChannel.id,
    guild,
  });
};

const getAttemptAlertChannelPermissionError = ({
  botMember,
  channel,
  preferredLocale,
}: {
  botMember: GuildMember;
  channel: TextChannel;
  preferredLocale?: string | null;
}): string | null => {
  const botPermissions = channel.permissionsFor(botMember);
  if (!botPermissions?.has(PermissionFlagsBits.ViewChannel)) {
    return t(
      "captcha.errors.attemptAlertChannelViewPermission",
      undefined,
      preferredLocale
    );
  }

  if (!botPermissions.has(PermissionFlagsBits.SendMessages)) {
    return t(
      "captcha.errors.attemptAlertChannelSendPermission",
      undefined,
      preferredLocale
    );
  }

  return null;
};

const handleSetAttemptAlertChannel = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const alertChannel = await resolveAttemptAlertChannelForSetting({
    guild: context.guild,
    selectedChannel: interaction.options.getChannel("channel", true),
  });
  if (!alertChannel) {
    await replyEphemeral({
      content: t(
        "captcha.errors.selectedChannelNotAttemptAlert",
        undefined,
        preferredLocale
      ),
      interaction,
    });
    return;
  }

  const permissionError = getAttemptAlertChannelPermissionError({
    botMember: context.botMember,
    channel: alertChannel,
    preferredLocale,
  });
  if (permissionError) {
    await replyEphemeral({
      content: permissionError,
      interaction,
    });
    return;
  }

  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      attemptAlertChannelId: alertChannel.id,
    },
    successMessage: t(
      "captcha.success.attemptAlertChannelSet",
      { channelId: alertChannel.id },
      preferredLocale
    ),
  });
};

const handleSetMaxAttempts = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const value = interaction.options.getInteger("value", true);
  if (
    value < CAPTCHA_LIMITS.maxAttempts.min ||
    value > CAPTCHA_LIMITS.maxAttempts.max
  ) {
    await replyEphemeral({
      content: t(
        "captcha.errors.maxAttemptsRange",
        {
          max: CAPTCHA_LIMITS.maxAttempts.max,
          min: CAPTCHA_LIMITS.maxAttempts.min,
        },
        preferredLocale
      ),
      interaction,
    });
    return;
  }

  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      maxAttempts: value,
    },
    successMessage: t(
      "captcha.success.maxAttemptsSet",
      { value },
      preferredLocale
    ),
  });
};

const handleSetTimeoutSeconds = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const value = interaction.options.getInteger("value", true);
  if (
    value < CAPTCHA_LIMITS.timeoutSeconds.min ||
    value > CAPTCHA_LIMITS.timeoutSeconds.max
  ) {
    await replyEphemeral({
      content: t(
        "captcha.errors.timeoutRange",
        {
          max: CAPTCHA_LIMITS.timeoutSeconds.max,
          min: CAPTCHA_LIMITS.timeoutSeconds.min,
        },
        preferredLocale
      ),
      interaction,
    });
    return;
  }

  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      timeoutSeconds: value,
    },
    successMessage: t("captcha.success.timeoutSet", { value }, preferredLocale),
  });
};

const handleSetKickOnFailure = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const enabled = interaction.options.getBoolean("enabled", true);
  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      kickOnFailure: enabled,
    },
    successMessage: t(
      "captcha.success.kickOnFailureSet",
      { value: formatBoolean(enabled, preferredLocale) },
      preferredLocale
    ),
  });
};

const handleSetAllowAdminAccess = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const enabled = interaction.options.getBoolean("enabled", true);
  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      allowAdminAccess: enabled,
    },
    successMessage: t(
      "captcha.success.adminAccessSet",
      { value: formatBoolean(enabled, preferredLocale) },
      preferredLocale
    ),
  });
};

const handleSetChannelNameFormat = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const format = interaction.options.getString("format", true);
  const validationError = validateChannelNameFormat({
    format,
    preferredLocale,
  });
  if (validationError) {
    await replyEphemeral({
      content: validationError,
      interaction,
    });
    return;
  }

  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      channelNameFormat: format.trim(),
    },
    successMessage: t(
      "captcha.success.channelNameFormatUpdated",
      undefined,
      preferredLocale
    ),
  });
};

const isSupportedCaptchaType = (value: string): boolean =>
  CAPTCHA_TYPE_VALUES.includes(value as (typeof CAPTCHA_TYPE_VALUES)[number]);

const handleSetCaptchaType = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const value = interaction.options.getString("type", true);
  if (!isSupportedCaptchaType(value)) {
    await replyEphemeral({
      content: t(
        "captcha.errors.unsupportedCaptchaType",
        { supported: CAPTCHA_TYPE_VALUES.join(", ") },
        preferredLocale
      ),
      interaction,
    });
    return;
  }

  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      captchaType: value,
    },
    successMessage: t(
      "captcha.success.captchaTypeSet",
      { value },
      preferredLocale
    ),
  });
};

const handleSetCodeLength = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const value = interaction.options.getInteger("value", true);
  if (
    value < CAPTCHA_LIMITS.codeLength.min ||
    value > CAPTCHA_LIMITS.codeLength.max
  ) {
    await replyEphemeral({
      content: t(
        "captcha.errors.codeLengthRange",
        {
          max: CAPTCHA_LIMITS.codeLength.max,
          min: CAPTCHA_LIMITS.codeLength.min,
        },
        preferredLocale
      ),
      interaction,
    });
    return;
  }

  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      codeLength: value,
    },
    successMessage: t(
      "captcha.success.codeLengthSet",
      { value },
      preferredLocale
    ),
  });
};

const handleSetNoiseLevel = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const value = interaction.options.getInteger("value", true);
  if (
    value < CAPTCHA_LIMITS.noiseLevel.min ||
    value > CAPTCHA_LIMITS.noiseLevel.max
  ) {
    await replyEphemeral({
      content: t(
        "captcha.errors.noiseLevelRange",
        {
          max: CAPTCHA_LIMITS.noiseLevel.max,
          min: CAPTCHA_LIMITS.noiseLevel.min,
        },
        preferredLocale
      ),
      interaction,
    });
    return;
  }

  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      captchaNoiseLevel: value,
    },
    successMessage: t(
      "captcha.success.noiseLevelSet",
      { value },
      preferredLocale
    ),
  });
};

const handleSetCaseSensitive = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const enabled = interaction.options.getBoolean("enabled", true);
  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      captchaCaseSensitive: enabled,
    },
    successMessage: t(
      "captcha.success.caseSensitiveSet",
      { value: formatBoolean(enabled, preferredLocale) },
      preferredLocale
    ),
  });
};

const handleSetDebugLogging = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const enabled = interaction.options.getBoolean("enabled", true);
  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      debugLogging: enabled,
    },
    successMessage: t(
      "captcha.success.debugLoggingSet",
      { value: formatBoolean(enabled, preferredLocale) },
      preferredLocale
    ),
  });
};

const createFullResetPatch = (): GuildCaptchaSettingsPatch => ({
  allowAdminAccess: null,
  attemptAlertChannelId: null,
  captchaCaseSensitive: null,
  captchaCategoryId: null,
  captchaNoiseLevel: null,
  captchaType: null,
  channelNameFormat: null,
  codeLength: null,
  debugLogging: null,
  kickOnFailure: null,
  maxAttempts: null,
  timeoutSeconds: null,
  verifiedRoleId: null,
});

const resetPatches: Record<ResetOption, GuildCaptchaSettingsPatch> = {
  all: createFullResetPatch(),
  "allow-admin-access": { allowAdminAccess: null },
  "attempt-alert-channel": { attemptAlertChannelId: null },
  "captcha-category": { captchaCategoryId: null },
  "captcha-type": { captchaType: null },
  "case-sensitive": { captchaCaseSensitive: null },
  "channel-name-format": { channelNameFormat: null },
  "code-length": { codeLength: null },
  "debug-logging": { debugLogging: null },
  "kick-on-failure": { kickOnFailure: null },
  "max-attempts": { maxAttempts: null },
  "noise-level": { captchaNoiseLevel: null },
  "timeout-seconds": { timeoutSeconds: null },
  "verified-role": { verifiedRoleId: null },
};

const getResetPatch = (option: ResetOption): GuildCaptchaSettingsPatch =>
  resetPatches[option];

const setSubcommandHandlers: Record<string, SubcommandHandler> = {
  "allow-admin-access": handleSetAllowAdminAccess,
  "attempt-alert-channel": handleSetAttemptAlertChannel,
  "captcha-category": handleSetCategory,
  "captcha-category-id": handleSetCategoryById,
  "captcha-type": handleSetCaptchaType,
  "case-sensitive": handleSetCaseSensitive,
  "channel-name-format": handleSetChannelNameFormat,
  "code-length": handleSetCodeLength,
  "debug-logging": handleSetDebugLogging,
  "kick-on-failure": handleSetKickOnFailure,
  "max-attempts": handleSetMaxAttempts,
  "noise-level": handleSetNoiseLevel,
  "timeout-seconds": handleSetTimeoutSeconds,
  "verified-role": handleSetVerifiedRole,
};

const runSetSubcommand = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const subcommand = interaction.options.getSubcommand(true);
  const handler = setSubcommandHandlers[subcommand];
  if (!handler) {
    await replyEphemeral({
      content: t(
        "captcha.errors.unsupportedSetSubcommand",
        undefined,
        preferredLocale
      ),
      interaction,
    });
    return;
  }

  await handler({ context, interaction });
};

const handleShow = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const [effectiveSettings, storedSettings] = await Promise.all([
    getGuildCaptchaSettings(context.guild),
    getStoredGuildCaptchaSettings(context.guild.id),
  ]);

  await replyEphemeral({
    content: buildShowMessage({
      preferredLocale,
      settings: effectiveSettings,
      storedExists: storedSettings !== null,
    }),
    interaction,
    tone: "important",
  });
};

const resolveGuildMemberById = async ({
  guild,
  userId,
}: {
  guild: Guild;
  userId: string;
}): Promise<GuildMember | null> => {
  const cachedMember = guild.members.cache.get(userId);
  if (cachedMember) {
    return cachedMember;
  }

  try {
    return await guild.members.fetch(userId);
  } catch {
    return null;
  }
};

const replyDebugRunResult = async ({
  interaction,
  preferredLocale,
  targetMember,
}: {
  interaction: ChatInputCommandInteraction;
  preferredLocale: string | null;
  targetMember: GuildMember;
}): Promise<void> => {
  const started = triggerCaptchaVerificationForMember({
    member: targetMember,
    source: "debug",
  });

  await replyEphemeral({
    content: started
      ? t(
          "captcha.success.debugRunStarted",
          { memberId: targetMember.id },
          preferredLocale
        )
      : t("captcha.success.workflowAlreadyActive", undefined, preferredLocale),
    interaction,
    tone: started ? "debug" : "error",
  });
};

const handleDebugRun = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  if (env.NODE_ENV !== "development") {
    await replyEphemeral({
      content: t("captcha.errors.debugRunDisabled", undefined, preferredLocale),
      interaction,
    });
    return;
  }

  const targetMember = await resolveGuildMemberById({
    guild: context.guild,
    userId: interaction.options.getUser("member", true).id,
  });

  if (!targetMember) {
    await replyEphemeral({
      content: t(
        "captcha.errors.userNotGuildMember",
        undefined,
        preferredLocale
      ),
      interaction,
    });
    return;
  }

  await replyDebugRunResult({
    interaction,
    preferredLocale,
    targetMember,
  });
};

const handleReset = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const option = interaction.options.getString("option", true) as ResetOption;
  const patch = getResetPatch(option);

  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch,
    successMessage:
      option === "all"
        ? t("captcha.success.resetAll", undefined, preferredLocale)
        : t(
            "captcha.success.resetSingle",
            { option: getResetOptionLabel(option) },
            preferredLocale
          ),
  });
};

const topLevelSubcommandHandlers: Record<string, SubcommandHandler> = {
  "debug-run": handleDebugRun,
  reset: handleReset,
  show: handleShow,
};

const runTopLevelSubcommand = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);
  const subcommand = interaction.options.getSubcommand(true);
  const handler = topLevelSubcommandHandlers[subcommand];
  if (!handler) {
    await replyEphemeral({
      content: t(
        "captcha.errors.unsupportedSubcommand",
        undefined,
        preferredLocale
      ),
      interaction,
    });
    return;
  }

  await handler({ context, interaction });
};

export const captchaCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("captcha")
    .setDescription(t("commands.captcha.description"))
    .setDMPermission(false)
    .setDefaultMemberPermissions(ADMINISTRATOR_PERMISSION)
    .addSubcommandGroup((group) =>
      group
        .setName(SET_GROUP_NAME)
        .setDescription(t("commands.captcha.groupSet.description"))
        .addSubcommand((subcommand) =>
          subcommand
            .setName("verified-role")
            .setDescription(t("commands.captcha.sub.verifiedRole.description"))
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription(t("commands.captcha.option.role.description"))
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("captcha-category")
            .setDescription(t("commands.captcha.sub.category.description"))
            .addChannelOption((option) =>
              option
                .setName("category")
                .setDescription(
                  t("commands.captcha.option.category.description")
                )
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("captcha-category-id")
            .setDescription(t("commands.captcha.sub.categoryById.description"))
            .addStringOption((option) =>
              option
                .setName("category-id")
                .setDescription(
                  t("commands.captcha.option.categoryId.description")
                )
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("max-attempts")
            .setDescription(t("commands.captcha.sub.maxAttempts.description"))
            .addIntegerOption((option) =>
              option
                .setName("value")
                .setDescription(
                  t("commands.captcha.option.maxAttemptsValue.description")
                )
                .setMinValue(CAPTCHA_LIMITS.maxAttempts.min)
                .setMaxValue(CAPTCHA_LIMITS.maxAttempts.max)
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("attempt-alert-channel")
            .setDescription(
              t("commands.captcha.sub.attemptAlertChannel.description")
            )
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription(
                  t("commands.captcha.option.attemptAlertChannel.description")
                )
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("timeout-seconds")
            .setDescription(t("commands.captcha.sub.timeout.description"))
            .addIntegerOption((option) =>
              option
                .setName("value")
                .setDescription(
                  t("commands.captcha.option.timeoutValue.description")
                )
                .setMinValue(CAPTCHA_LIMITS.timeoutSeconds.min)
                .setMaxValue(CAPTCHA_LIMITS.timeoutSeconds.max)
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("kick-on-failure")
            .setDescription(t("commands.captcha.sub.kickOnFailure.description"))
            .addBooleanOption((option) =>
              option
                .setName("enabled")
                .setDescription(
                  t("commands.captcha.option.enabledKick.description")
                )
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("allow-admin-access")
            .setDescription(
              t("commands.captcha.sub.allowAdminAccess.description")
            )
            .addBooleanOption((option) =>
              option
                .setName("enabled")
                .setDescription(
                  t("commands.captcha.option.enabledAdminAccess.description")
                )
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("channel-name-format")
            .setDescription(
              t("commands.captcha.sub.channelNameFormat.description")
            )
            .addStringOption((option) =>
              option
                .setName("format")
                .setDescription(t("commands.captcha.option.format.description"))
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("captcha-type")
            .setDescription(t("commands.captcha.sub.captchaType.description"))
            .addStringOption((option) =>
              option
                .setName("type")
                .setDescription(t("commands.captcha.option.type.description"))
                .addChoices(
                  ...CAPTCHA_TYPE_VALUES.map((value) => ({
                    name: value,
                    value,
                  }))
                )
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("code-length")
            .setDescription(t("commands.captcha.sub.codeLength.description"))
            .addIntegerOption((option) =>
              option
                .setName("value")
                .setDescription(
                  t("commands.captcha.option.codeLengthValue.description")
                )
                .setMinValue(CAPTCHA_LIMITS.codeLength.min)
                .setMaxValue(CAPTCHA_LIMITS.codeLength.max)
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("noise-level")
            .setDescription(t("commands.captcha.sub.noiseLevel.description"))
            .addIntegerOption((option) =>
              option
                .setName("value")
                .setDescription(
                  t("commands.captcha.option.noiseLevelValue.description")
                )
                .setMinValue(CAPTCHA_LIMITS.noiseLevel.min)
                .setMaxValue(CAPTCHA_LIMITS.noiseLevel.max)
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("case-sensitive")
            .setDescription(t("commands.captcha.sub.caseSensitive.description"))
            .addBooleanOption((option) =>
              option
                .setName("enabled")
                .setDescription(
                  t("commands.captcha.option.enabledCaseSensitive.description")
                )
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("debug-logging")
            .setDescription(t("commands.captcha.sub.debugLogging.description"))
            .addBooleanOption((option) =>
              option
                .setName("enabled")
                .setDescription(
                  t("commands.captcha.option.enabledDebugLogging.description")
                )
                .setRequired(true)
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription(t("commands.captcha.sub.show.description"))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("debug-run")
        .setDescription(t("commands.captcha.sub.debugRun.description"))
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription(t("commands.captcha.option.member.description"))
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription(t("commands.captcha.sub.reset.description"))
        .addStringOption((option) =>
          option
            .setName("option")
            .setDescription(
              t("commands.captcha.option.resetSetting.description")
            )
            .addChoices(
              ...RESET_OPTIONS.map((value) => ({
                name: getResetOptionLabel(value),
                value,
              }))
            )
            .setRequired(true)
        )
    ),
  async execute(interaction): Promise<void> {
    const adminContext = await resolveAdminContext(interaction);
    if (adminContext.type === "error") {
      await replyEphemeral({
        content: adminContext.message,
        interaction,
      });
      return;
    }

    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    if (subcommandGroup === SET_GROUP_NAME) {
      await runSetSubcommand({
        context: adminContext,
        interaction,
      });
      return;
    }

    await runTopLevelSubcommand({
      context: adminContext,
      interaction,
    });
  },
};
