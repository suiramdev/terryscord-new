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
} from "discord.js";

import { replyWithEmbed } from "@/discord/embeds";
import type { BotEmbedTone } from "@/discord/embeds";
import { triggerCaptchaVerificationForMember } from "@/discord/events/guild-member-add";
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
  const { guild } = interaction;
  if (!guild) {
    return createCommandError("This command can only be used inside a server.");
  }

  if (!interaction.memberPermissions?.has(ADMINISTRATOR_PERMISSION)) {
    return createCommandError(
      "You must have administrator permission to manage captcha settings."
    );
  }

  const botMember = await resolveBotMember(guild);
  if (!botMember) {
    return createCommandError(
      "I could not load my bot member data in this guild. Try again."
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
    await replyEphemeral({
      content:
        "Failed to save captcha settings. Check database connectivity and try again.",
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
  role,
}: {
  botMember: GuildMember;
  guild: Guild;
  role: Role;
}): string | null => {
  if (role.id === guild.roles.everyone.id) {
    return "The @everyone role cannot be configured as the verified role.";
  }

  if (role.managed) {
    return "Managed/integration roles cannot be configured as the verified role.";
  }

  if (role.position >= botMember.roles.highest.position) {
    return "That role is above my highest role, so I cannot assign it.";
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

const validateChannelNameFormat = (format: string): string | null => {
  const trimmed = format.trim();
  if (trimmed.length < 3 || trimmed.length > 80) {
    return "Channel name format must be between 3 and 80 characters.";
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

const validateCategoryBotPermissions = ({
  botMember,
  category,
}: {
  botMember: GuildMember;
  category: CategoryChannel;
}): string | null => {
  const botPermissions = category.permissionsFor(botMember);
  if (!botPermissions?.has(PermissionFlagsBits.ViewChannel)) {
    return "I must be able to view that category to create captcha channels in it.";
  }

  if (!botPermissions.has(PermissionFlagsBits.ManageChannels)) {
    return "I need `Manage Channels` permission in that category to create captcha channels.";
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
    successMessage: `Captcha category set to **${category.name}**.`,
  });
};

const formatBoolean = (value: boolean): string =>
  value ? "enabled" : "disabled";

const formatOptionalValue = (value: string | null): string =>
  value && value.length > 0 ? value : "not configured";

const buildShowMessage = ({
  settings,
  storedExists,
}: {
  settings: GuildCaptchaSettings;
  storedExists: boolean;
}): string => {
  const source = storedExists
    ? "Database settings loaded (fallbacks still applied for invalid/missing values)."
    : "No settings stored yet; hardcoded defaults are active.";

  return [
    "Captcha settings:",
    source,
    `Verified role: ${formatOptionalValue(settings.verifiedRoleId)}`,
    `Captcha category: ${formatOptionalValue(settings.captchaCategoryId)}`,
    `Max attempts: ${settings.maxAttempts}`,
    `Timeout (seconds): ${settings.timeoutSeconds}`,
    `Kick on failure: ${formatBoolean(settings.kickOnFailure)}`,
    `Allow admin access: ${formatBoolean(settings.allowAdminAccess)}`,
    `Channel name format: ${settings.channelNameFormat}`,
    `Captcha type: ${settings.captchaType}`,
    `Code length: ${settings.codeLength}`,
    `Noise level: ${settings.captchaNoiseLevel}`,
    `Case sensitive answers: ${formatBoolean(settings.captchaCaseSensitive)}`,
    `Debug logging: ${formatBoolean(settings.debugLogging)}`,
  ].join("\n");
};

const handleSetVerifiedRole = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const role = await resolveRoleFromOption({
    guild: context.guild,
    interaction,
  });
  if (!role) {
    await replyEphemeral({
      content: "The selected role could not be found.",
      interaction,
    });
    return;
  }

  const validationError = validateRoleSelection({
    botMember: context.botMember,
    guild: context.guild,
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
    successMessage: `Verified role set to <@&${role.id}>.`,
  });
};

const handleSetCategory = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const selectedChannel = interaction.options.getChannel("category", true);
  if (selectedChannel.type !== ChannelType.GuildCategory) {
    await replyEphemeral({
      content: "Selected channel must be a category.",
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
      content: "The selected category could not be resolved in this guild.",
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
  const categoryId = interaction.options.getString("category-id", true).trim();
  const category = await resolveCategoryById({
    categoryId,
    guild: context.guild,
  });
  if (!category) {
    await replyEphemeral({
      content:
        "The provided category ID is invalid or does not belong to a category in this guild.",
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

const handleSetMaxAttempts = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const value = interaction.options.getInteger("value", true);
  if (
    value < CAPTCHA_LIMITS.maxAttempts.min ||
    value > CAPTCHA_LIMITS.maxAttempts.max
  ) {
    await replyEphemeral({
      content: `Max attempts must be between ${CAPTCHA_LIMITS.maxAttempts.min} and ${CAPTCHA_LIMITS.maxAttempts.max}.`,
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
    successMessage: `Max attempts set to **${value}**.`,
  });
};

const handleSetTimeoutSeconds = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const value = interaction.options.getInteger("value", true);
  if (
    value < CAPTCHA_LIMITS.timeoutSeconds.min ||
    value > CAPTCHA_LIMITS.timeoutSeconds.max
  ) {
    await replyEphemeral({
      content: `Timeout must be between ${CAPTCHA_LIMITS.timeoutSeconds.min} and ${CAPTCHA_LIMITS.timeoutSeconds.max} seconds.`,
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
    successMessage: `Timeout set to **${value}** seconds.`,
  });
};

const handleSetKickOnFailure = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const enabled = interaction.options.getBoolean("enabled", true);
  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      kickOnFailure: enabled,
    },
    successMessage: `Kick on failure ${formatBoolean(enabled)}.`,
  });
};

const handleSetAllowAdminAccess = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const enabled = interaction.options.getBoolean("enabled", true);
  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      allowAdminAccess: enabled,
    },
    successMessage: `Admin access to captcha channels ${formatBoolean(enabled)}.`,
  });
};

const handleSetChannelNameFormat = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const format = interaction.options.getString("format", true);
  const validationError = validateChannelNameFormat(format);
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
    successMessage:
      "Channel name format updated. Supported placeholders: {username}, {userid}, {suffix}, {prefix}.",
  });
};

const isSupportedCaptchaType = (value: string): boolean =>
  CAPTCHA_TYPE_VALUES.includes(value as (typeof CAPTCHA_TYPE_VALUES)[number]);

const handleSetCaptchaType = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const value = interaction.options.getString("type", true);
  if (!isSupportedCaptchaType(value)) {
    await replyEphemeral({
      content: `Unsupported captcha type. Supported: ${CAPTCHA_TYPE_VALUES.join(", ")}.`,
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
    successMessage: `Captcha type set to **${value}**.`,
  });
};

const handleSetCodeLength = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const value = interaction.options.getInteger("value", true);
  if (
    value < CAPTCHA_LIMITS.codeLength.min ||
    value > CAPTCHA_LIMITS.codeLength.max
  ) {
    await replyEphemeral({
      content: `Code length must be between ${CAPTCHA_LIMITS.codeLength.min} and ${CAPTCHA_LIMITS.codeLength.max}.`,
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
    successMessage: `Captcha code length set to **${value}**.`,
  });
};

const handleSetNoiseLevel = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const value = interaction.options.getInteger("value", true);
  if (
    value < CAPTCHA_LIMITS.noiseLevel.min ||
    value > CAPTCHA_LIMITS.noiseLevel.max
  ) {
    await replyEphemeral({
      content: `Noise level must be between ${CAPTCHA_LIMITS.noiseLevel.min} and ${CAPTCHA_LIMITS.noiseLevel.max}.`,
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
    successMessage: `Captcha noise level set to **${value}**.`,
  });
};

const handleSetCaseSensitive = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const enabled = interaction.options.getBoolean("enabled", true);
  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      captchaCaseSensitive: enabled,
    },
    successMessage: `Captcha case-sensitive answer matching ${formatBoolean(enabled)}.`,
  });
};

const handleSetDebugLogging = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const enabled = interaction.options.getBoolean("enabled", true);
  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch: {
      debugLogging: enabled,
    },
    successMessage: `Captcha debug logging ${formatBoolean(enabled)}.`,
  });
};

const createFullResetPatch = (): GuildCaptchaSettingsPatch => ({
  allowAdminAccess: null,
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
  const subcommand = interaction.options.getSubcommand(true);
  const handler = setSubcommandHandlers[subcommand];
  if (!handler) {
    await replyEphemeral({
      content: "Unsupported captcha setting subcommand.",
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
  const [effectiveSettings, storedSettings] = await Promise.all([
    getGuildCaptchaSettings(context.guild),
    getStoredGuildCaptchaSettings(context.guild.id),
  ]);

  await replyEphemeral({
    content: buildShowMessage({
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

const handleDebugRun = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  if (env.NODE_ENV !== "development") {
    await replyEphemeral({
      content:
        "`/captcha debug-run` is disabled outside development mode to avoid accidental production use.",
      interaction,
    });
    return;
  }

  const targetUser = interaction.options.getUser("member", true);
  const targetMember = await resolveGuildMemberById({
    guild: context.guild,
    userId: targetUser.id,
  });

  if (!targetMember) {
    await replyEphemeral({
      content: "That user is not currently a member of this guild.",
      interaction,
    });
    return;
  }

  const started = triggerCaptchaVerificationForMember({
    member: targetMember,
    source: "debug",
  });

  await replyEphemeral({
    content: started
      ? `Started captcha verification workflow for <@${targetMember.id}>.`
      : "Could not start captcha verification because a session is already active for that member.",
    interaction,
    tone: started ? "debug" : "error",
  });
};

const handleReset = async ({
  context,
  interaction,
}: HandlerArgs): Promise<void> => {
  const option = interaction.options.getString("option", true) as ResetOption;
  const patch = getResetPatch(option);

  await savePatchAndReply({
    guildId: context.guild.id,
    interaction,
    patch,
    successMessage:
      option === "all"
        ? "All captcha settings were reset to fallback defaults."
        : `Captcha setting **${option}** was reset to fallback default behavior.`,
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
  const subcommand = interaction.options.getSubcommand(true);
  const handler = topLevelSubcommandHandlers[subcommand];
  if (!handler) {
    await replyEphemeral({
      content: "Unsupported captcha subcommand.",
      interaction,
    });
    return;
  }

  await handler({ context, interaction });
};

export const captchaCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("captcha")
    .setDescription("Manage captcha verification settings")
    .setDMPermission(false)
    .setDefaultMemberPermissions(ADMINISTRATOR_PERMISSION)
    .addSubcommandGroup((group) =>
      group
        .setName(SET_GROUP_NAME)
        .setDescription("Set captcha configuration options")
        .addSubcommand((subcommand) =>
          subcommand
            .setName("verified-role")
            .setDescription("Set role assigned after captcha success")
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription("Role to assign")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("captcha-category")
            .setDescription("Set category used for captcha channels")
            .addChannelOption((option) =>
              option
                .setName("category")
                .setDescription("Category for temporary captcha channels")
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("captcha-category-id")
            .setDescription("Set category using a raw category channel ID")
            .addStringOption((option) =>
              option
                .setName("category-id")
                .setDescription("Category channel ID")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("max-attempts")
            .setDescription("Set maximum captcha attempts")
            .addIntegerOption((option) =>
              option
                .setName("value")
                .setDescription("Maximum attempts")
                .setMinValue(CAPTCHA_LIMITS.maxAttempts.min)
                .setMaxValue(CAPTCHA_LIMITS.maxAttempts.max)
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("timeout-seconds")
            .setDescription("Set captcha timeout in seconds")
            .addIntegerOption((option) =>
              option
                .setName("value")
                .setDescription("Timeout in seconds")
                .setMinValue(CAPTCHA_LIMITS.timeoutSeconds.min)
                .setMaxValue(CAPTCHA_LIMITS.timeoutSeconds.max)
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("kick-on-failure")
            .setDescription("Toggle kicking users who fail verification")
            .addBooleanOption((option) =>
              option
                .setName("enabled")
                .setDescription("Enable or disable kick on failure")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("allow-admin-access")
            .setDescription(
              "Toggle administrator visibility of captcha channels"
            )
            .addBooleanOption((option) =>
              option
                .setName("enabled")
                .setDescription("Enable or disable admin access")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("channel-name-format")
            .setDescription("Set temporary captcha channel naming format")
            .addStringOption((option) =>
              option
                .setName("format")
                .setDescription("Use {username}, {userid}, {suffix}, {prefix}")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("captcha-type")
            .setDescription("Set captcha challenge type")
            .addStringOption((option) =>
              option
                .setName("type")
                .setDescription("Captcha type")
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
            .setDescription("Set captcha code length")
            .addIntegerOption((option) =>
              option
                .setName("value")
                .setDescription("Captcha code length")
                .setMinValue(CAPTCHA_LIMITS.codeLength.min)
                .setMaxValue(CAPTCHA_LIMITS.codeLength.max)
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("noise-level")
            .setDescription("Set captcha noise level for decoys and traces")
            .addIntegerOption((option) =>
              option
                .setName("value")
                .setDescription("Noise level from 0 (none) to 100 (high)")
                .setMinValue(CAPTCHA_LIMITS.noiseLevel.min)
                .setMaxValue(CAPTCHA_LIMITS.noiseLevel.max)
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("case-sensitive")
            .setDescription("Toggle case-sensitive captcha answer matching")
            .addBooleanOption((option) =>
              option
                .setName("enabled")
                .setDescription("Enable or disable case-sensitive matching")
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("debug-logging")
            .setDescription("Toggle captcha debug logs")
            .addBooleanOption((option) =>
              option
                .setName("enabled")
                .setDescription("Enable or disable debug logs")
                .setRequired(true)
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("show")
        .setDescription("Show effective captcha settings for this guild")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("debug-run")
        .setDescription(
          "Development-only: trigger captcha flow for an existing member"
        )
        .addUserOption((option) =>
          option
            .setName("member")
            .setDescription("Member to run captcha verification for")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reset")
        .setDescription(
          "Reset one or more captcha settings to fallback defaults"
        )
        .addStringOption((option) =>
          option
            .setName("option")
            .setDescription("Setting to reset")
            .addChoices(
              ...RESET_OPTIONS.map((value) => ({
                name: value,
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
