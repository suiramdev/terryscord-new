/* eslint-disable max-statements */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type {
  AnyComponentBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ComponentEmojiResolvable,
  Guild,
  GuildMember,
  InteractionReplyOptions,
  Message,
  Role,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import { log } from "evlog";

import { createMinimalEmbed, replyWithEmbed } from "@/discord/embeds";
import type { BotEmbedTone } from "@/discord/embeds";
import { t } from "@/i18n";

import type { SlashCommand } from "./types";

const ADMINISTRATOR_PERMISSION = PermissionFlagsBits.Administrator;
const MANAGE_ROLES_PERMISSION = PermissionFlagsBits.ManageRoles;

const COMMAND_NAME = "role-pick-button";
const ADD_SUBCOMMAND = "add";
const REMOVE_SUBCOMMAND = "remove";
const RESTORE_SUBCOMMAND = "restore";

const CHANNEL_OPTION = "channel";
const EMOJI_OPTION = "emoji";
const LABEL_OPTION = "label";
const MESSAGE_ID_OPTION = "message-id";
const ROLE_OPTION = "role";
const STYLE_OPTION = "style";

const ROLE_PICK_BUTTON_PREFIX = "role-pick";
const MAX_ACTION_ROWS = 5;
const MAX_BUTTONS_PER_ROW = 5;

const SNOWFLAKE_PATTERN = /\d{17,20}/;
const CUSTOM_EMOJI_PATTERN = /^<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/;

type RolePickSubcommand =
  | typeof ADD_SUBCOMMAND
  | typeof REMOVE_SUBCOMMAND
  | typeof RESTORE_SUBCOMMAND;

type RolePickButtonStyleValue = "danger" | "primary" | "secondary" | "success";

type CommandResult<T> =
  | {
      type: "success";
      value: T;
    }
  | {
      message: string;
      type: "error";
    };

interface ParsedRolePickCustomId {
  guildId: string;
  messageId: string;
  roleId: string;
}

interface RolePickButtonConfig {
  emoji: ComponentEmojiResolvable | null;
  label: string;
  style: ButtonStyle;
}

interface CommandContext {
  botMember: GuildMember;
  guild: Guild;
  preferredLocale: string | null;
}

interface TargetMessageContext {
  channel: Message["channel"];
  message: Message;
  messageId: string;
}

interface AddPreparation {
  command: CommandContext;
  config: RolePickButtonConfig;
  customId: string;
  role: Role;
  target: TargetMessageContext;
}

interface RemovePreparation {
  command: CommandContext;
  customId: string;
  target: TargetMessageContext;
}

interface RestorePreparation {
  command: CommandContext;
  target: TargetMessageContext;
}

interface RolePickButtonInteractionContext {
  botMember: GuildMember;
  member: GuildMember;
  parsed: ParsedRolePickCustomId;
  preferredLocale: string | null;
  role: Role;
}

type RoleToggleAction = "added" | "removed";

interface ParsedEmojiMention {
  animated: boolean;
  id: string;
  name: string;
}

const ROLE_PICK_STYLE_VALUES: Record<RolePickButtonStyleValue, ButtonStyle> = {
  danger: ButtonStyle.Danger,
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
};

const toSuccess = <T>(value: T): CommandResult<T> => ({
  type: "success",
  value,
});

const toSuccessVoid = (): CommandResult<void> => ({
  type: "success",
  value: undefined,
});

const toError = (message: string): CommandResult<never> => ({
  message,
  type: "error",
});

const getPreferredLocale = ({
  guildLocale,
  locale,
}: {
  guildLocale?: string | null;
  locale?: string | null;
}): string | null => locale ?? guildLocale ?? null;

const resolveRolePickSubcommand = (
  interaction: ChatInputCommandInteraction
): RolePickSubcommand | null => {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === ADD_SUBCOMMAND) {
    return ADD_SUBCOMMAND;
  }

  if (subcommand === REMOVE_SUBCOMMAND) {
    return REMOVE_SUBCOMMAND;
  }

  if (subcommand === RESTORE_SUBCOMMAND) {
    return RESTORE_SUBCOMMAND;
  }

  return null;
};

const extractSnowflake = (value: string): string | null => {
  const match = value.match(SNOWFLAKE_PATTERN);
  if (!match) {
    return null;
  }

  const [snowflake] = match;
  return snowflake ?? null;
};

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

const resolveCommandContext = async (
  interaction: ChatInputCommandInteraction
): Promise<CommandResult<CommandContext>> => {
  const preferredLocale = getPreferredLocale({
    guildLocale: interaction.guildLocale,
    locale: interaction.locale,
  });

  const { guild } = interaction;
  if (!guild) {
    return toError(
      t("rolePickButton.errors.serverOnly", undefined, preferredLocale)
    );
  }

  if (!interaction.memberPermissions?.has(ADMINISTRATOR_PERMISSION)) {
    return toError(
      t("rolePickButton.errors.adminRequired", undefined, preferredLocale)
    );
  }

  const botMember = await resolveBotMember(guild);
  if (!botMember) {
    return toError(
      t(
        "rolePickButton.errors.botMemberUnavailable",
        undefined,
        preferredLocale
      )
    );
  }

  return toSuccess({
    botMember,
    guild,
    preferredLocale,
  });
};

const parseEmojiMention = (input: string): ParsedEmojiMention | null => {
  const match = CUSTOM_EMOJI_PATTERN.exec(input);
  if (!match) {
    return null;
  }

  const [, animatedFlag, name, id] = match;
  if (!name || !id) {
    return null;
  }

  return {
    animated: animatedFlag === "a",
    id,
    name,
  };
};

const parseButtonEmoji = ({
  input,
}: {
  input: string | null;
}): CommandResult<ComponentEmojiResolvable | null> => {
  const trimmedInput = input?.trim();
  if (!trimmedInput) {
    return toSuccess(null);
  }

  const customEmoji = parseEmojiMention(trimmedInput);
  if (customEmoji) {
    return toSuccess({
      animated: customEmoji.animated,
      id: customEmoji.id,
      name: customEmoji.name,
    });
  }

  return toSuccess(trimmedInput);
};

const resolveButtonStyle = ({
  style,
}: {
  style: RolePickButtonStyleValue;
}): ButtonStyle => ROLE_PICK_STYLE_VALUES[style];

const resolveButtonConfig = (
  interaction: ChatInputCommandInteraction
): CommandResult<RolePickButtonConfig> => {
  const label = interaction.options.getString(LABEL_OPTION, true).trim();
  const style = interaction.options.getString(
    STYLE_OPTION,
    true
  ) as RolePickButtonStyleValue;

  const emojiResult = parseButtonEmoji({
    input: interaction.options.getString(EMOJI_OPTION),
  });
  if (emojiResult.type === "error") {
    return emojiResult;
  }

  return toSuccess({
    emoji: emojiResult.value,
    label,
    style: resolveButtonStyle({ style }),
  });
};

const resolveMessageIdOption = ({
  interaction,
  preferredLocale,
}: {
  interaction: ChatInputCommandInteraction;
  preferredLocale: string | null;
}): CommandResult<string> => {
  const messageInput = interaction.options.getString(MESSAGE_ID_OPTION, true);
  const messageId = extractSnowflake(messageInput);
  if (!messageId) {
    return toError(
      t("rolePickButton.errors.invalidMessageId", undefined, preferredLocale)
    );
  }

  return toSuccess(messageId);
};

const isMessageChannel = (channel: unknown): channel is Message["channel"] =>
  typeof channel === "object" &&
  channel !== null &&
  "messages" in channel &&
  "send" in channel;

const resolveTargetChannel = ({
  interaction,
  preferredLocale,
}: {
  interaction: ChatInputCommandInteraction;
  preferredLocale: string | null;
}): CommandResult<Message["channel"]> => {
  const selectedChannel = interaction.options.getChannel(CHANNEL_OPTION, true);
  if (!isMessageChannel(selectedChannel)) {
    return toError(
      t(
        "rolePickButton.errors.channelNotCompatible",
        undefined,
        preferredLocale
      )
    );
  }

  return toSuccess(selectedChannel);
};

const fetchTargetMessage = async ({
  channel,
  messageId,
  preferredLocale,
}: {
  channel: Message["channel"];
  messageId: string;
  preferredLocale: string | null;
}): Promise<CommandResult<Message>> => {
  try {
    const fetchedMessage = await channel.messages.fetch(messageId);
    return toSuccess(fetchedMessage);
  } catch {
    return toError(
      t("rolePickButton.errors.messageNotFound", undefined, preferredLocale)
    );
  }
};

const ensureMessageEditable = ({
  message,
  preferredLocale,
}: {
  message: Message;
  preferredLocale: string | null;
}): CommandResult<Message> => {
  if (!message.editable) {
    return toError(
      t("rolePickButton.errors.messageNotEditable", undefined, preferredLocale)
    );
  }

  return toSuccess(message);
};

const resolveTargetMessage = async ({
  command,
  interaction,
}: {
  command: CommandContext;
  interaction: ChatInputCommandInteraction;
}): Promise<CommandResult<TargetMessageContext>> => {
  const messageIdResult = resolveMessageIdOption({
    interaction,
    preferredLocale: command.preferredLocale,
  });
  if (messageIdResult.type === "error") {
    return messageIdResult;
  }

  const channelResult = resolveTargetChannel({
    interaction,
    preferredLocale: command.preferredLocale,
  });
  if (channelResult.type === "error") {
    return channelResult;
  }

  const messageResult = await fetchTargetMessage({
    channel: channelResult.value,
    messageId: messageIdResult.value,
    preferredLocale: command.preferredLocale,
  });
  if (messageResult.type === "error") {
    return messageResult;
  }

  const editableResult = ensureMessageEditable({
    message: messageResult.value,
    preferredLocale: command.preferredLocale,
  });
  if (editableResult.type === "error") {
    return editableResult;
  }

  return toSuccess({
    channel: channelResult.value,
    message: editableResult.value,
    messageId: messageIdResult.value,
  });
};

const resolveRoleByOption = async ({
  command,
  interaction,
}: {
  command: CommandContext;
  interaction: ChatInputCommandInteraction;
}): Promise<CommandResult<Role>> => {
  const selectedRole = interaction.options.getRole(ROLE_OPTION, true);
  const cachedRole = command.guild.roles.cache.get(selectedRole.id);
  if (cachedRole) {
    return toSuccess(cachedRole);
  }

  try {
    const fetchedRole = await command.guild.roles.fetch(selectedRole.id);
    if (!fetchedRole) {
      return toError(
        t(
          "rolePickButton.errors.roleNotFound",
          undefined,
          command.preferredLocale
        )
      );
    }

    return toSuccess(fetchedRole);
  } catch {
    return toError(
      t(
        "rolePickButton.errors.roleNotFound",
        undefined,
        command.preferredLocale
      )
    );
  }
};

const validateAssignableRole = ({
  command,
  role,
}: {
  command: CommandContext;
  role: Role;
}): CommandResult<Role> => {
  if (!command.botMember.permissions.has(MANAGE_ROLES_PERMISSION)) {
    return toError(
      t(
        "rolePickButton.errors.botMissingManageRoles",
        undefined,
        command.preferredLocale
      )
    );
  }

  if (role.id === command.guild.roles.everyone.id) {
    return toError(
      t(
        "rolePickButton.errors.roleEveryone",
        undefined,
        command.preferredLocale
      )
    );
  }

  if (role.managed) {
    return toError(
      t("rolePickButton.errors.roleManaged", undefined, command.preferredLocale)
    );
  }

  if (role.position >= command.botMember.roles.highest.position) {
    return toError(
      t(
        "rolePickButton.errors.roleAboveBot",
        undefined,
        command.preferredLocale
      )
    );
  }

  return toSuccess(role);
};

const createRolePickCustomId = ({
  guildId,
  messageId,
  roleId,
}: {
  guildId: string;
  messageId: string;
  roleId: string;
}): string => `${ROLE_PICK_BUTTON_PREFIX}:${guildId}:${messageId}:${roleId}`;

const parseRolePickCustomId = (
  customId: string
): ParsedRolePickCustomId | null => {
  const parts = customId.split(":");
  if (parts.length !== 4) {
    return null;
  }

  const [prefix, guildId, messageId, roleId] = parts;
  if (prefix !== ROLE_PICK_BUTTON_PREFIX) {
    return null;
  }

  if (!guildId || !messageId || !roleId) {
    return null;
  }

  if (!SNOWFLAKE_PATTERN.test(guildId)) {
    return null;
  }

  if (!SNOWFLAKE_PATTERN.test(messageId)) {
    return null;
  }

  if (!SNOWFLAKE_PATTERN.test(roleId)) {
    return null;
  }

  return {
    guildId,
    messageId,
    roleId,
  };
};

export const isRolePickButtonCustomId = (customId: string): boolean =>
  Boolean(parseRolePickCustomId(customId));

const toEditableRows = (
  message: Message,
  preferredLocale: string | null
): CommandResult<ActionRowBuilder<AnyComponentBuilder>[]> => {
  const rows: ActionRowBuilder<AnyComponentBuilder>[] = [];

  for (const component of message.components) {
    const componentData = component.toJSON();
    if (componentData.type !== ComponentType.ActionRow) {
      return toError(
        t(
          "rolePickButton.errors.unsupportedComponentLayout",
          undefined,
          preferredLocale
        )
      );
    }

    rows.push(ActionRowBuilder.from(componentData));
  }

  return toSuccess(rows);
};

const toComponentCustomId = (component: AnyComponentBuilder): string | null => {
  const data = component.toJSON();
  if (!("custom_id" in data)) {
    return null;
  }

  const customId = data.custom_id;
  if (typeof customId !== "string") {
    return null;
  }

  return customId;
};

const isButtonBuilder = (component: AnyComponentBuilder): boolean =>
  component.toJSON().type === ComponentType.Button;

const canAppendButtonToRow = (
  row: ActionRowBuilder<AnyComponentBuilder>
): boolean =>
  row.components.length < MAX_BUTTONS_PER_ROW &&
  row.components.every((component) => isButtonBuilder(component));

const hasButtonCustomId = ({
  customId,
  rows,
}: {
  customId: string;
  rows: ActionRowBuilder<AnyComponentBuilder>[];
}): boolean =>
  rows.some((row) =>
    row.components.some(
      (component) => toComponentCustomId(component) === customId
    )
  );

const buildRolePickButton = ({
  config,
  customId,
}: {
  config: RolePickButtonConfig;
  customId: string;
}): ButtonBuilder => {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(config.label)
    .setStyle(config.style);

  if (config.emoji) {
    button.setEmoji(config.emoji);
  }

  return button;
};

const addRolePickButtonToRows = ({
  command,
  config,
  customId,
  rows,
}: {
  command: CommandContext;
  config: RolePickButtonConfig;
  customId: string;
  rows: ActionRowBuilder<AnyComponentBuilder>[];
}): CommandResult<ActionRowBuilder<AnyComponentBuilder>[]> => {
  if (hasButtonCustomId({ customId, rows })) {
    return toError(
      t(
        "rolePickButton.errors.buttonAlreadyExists",
        undefined,
        command.preferredLocale
      )
    );
  }

  const button = buildRolePickButton({ config, customId });
  const targetRow = rows.find((row) => canAppendButtonToRow(row));
  if (targetRow) {
    targetRow.addComponents(button);
    return toSuccess(rows);
  }

  if (rows.length >= MAX_ACTION_ROWS) {
    return toError(
      t(
        "rolePickButton.errors.maxComponentsReached",
        undefined,
        command.preferredLocale
      )
    );
  }

  const newRow = new ActionRowBuilder<AnyComponentBuilder>().addComponents(
    button
  );
  return toSuccess([...rows, newRow]);
};

const compactRows = (
  rows: ActionRowBuilder<AnyComponentBuilder>[]
): ActionRowBuilder<AnyComponentBuilder>[] =>
  rows.filter((row) => row.components.length > 0);

const removeButtonsFromRows = ({
  matcher,
  rows,
}: {
  matcher: (customId: string) => boolean;
  rows: ActionRowBuilder<AnyComponentBuilder>[];
}): {
  removedCount: number;
  rows: ActionRowBuilder<AnyComponentBuilder>[];
} => {
  let removedCount = 0;

  for (const row of rows) {
    const retained: AnyComponentBuilder[] = [];

    for (const component of row.components) {
      const customId = toComponentCustomId(component);
      if (!customId) {
        retained.push(component);
        continue;
      }

      const shouldRemove = matcher(customId);
      if (shouldRemove) {
        removedCount += 1;
        continue;
      }

      retained.push(component);
    }

    row.setComponents(...retained);
  }

  return {
    removedCount,
    rows: compactRows(rows),
  };
};

const isRolePickCustomIdMatch = (customId: string): boolean =>
  isRolePickButtonCustomId(customId);

const removeSpecificButtonFromRows = ({
  customId,
  rows,
}: {
  customId: string;
  rows: ActionRowBuilder<AnyComponentBuilder>[];
}): {
  removedCount: number;
  rows: ActionRowBuilder<AnyComponentBuilder>[];
} => removeButtonsFromRows({ matcher: (value) => value === customId, rows });

const removeAllRolePickButtonsFromRows = ({
  rows,
}: {
  rows: ActionRowBuilder<AnyComponentBuilder>[];
}): {
  removedCount: number;
  rows: ActionRowBuilder<AnyComponentBuilder>[];
} => removeButtonsFromRows({ matcher: isRolePickCustomIdMatch, rows });

const updateMessageComponents = async ({
  command,
  message,
  rows,
}: {
  command: CommandContext;
  message: Message;
  rows: ActionRowBuilder<AnyComponentBuilder>[];
}): Promise<CommandResult<void>> => {
  try {
    await message.edit({ components: rows.map((row) => row.toJSON()) });
    return toSuccessVoid();
  } catch {
    return toError(
      t(
        "rolePickButton.errors.messageEditFailed",
        undefined,
        command.preferredLocale
      )
    );
  }
};

const replyCommandError = async ({
  interaction,
  message,
}: {
  interaction: ChatInputCommandInteraction;
  message: string;
}): Promise<void> => {
  await replyWithEmbed({
    interaction,
    message,
    tone: "error",
  });
};

const replyCommandSuccess = async ({
  interaction,
  message,
}: {
  interaction: ChatInputCommandInteraction;
  message: string;
}): Promise<void> => {
  await replyWithEmbed({
    interaction,
    message,
    tone: "success",
  });
};

const prepareAddSubcommand = async (
  interaction: ChatInputCommandInteraction
): Promise<CommandResult<AddPreparation>> => {
  const commandResult = await resolveCommandContext(interaction);
  if (commandResult.type === "error") {
    return commandResult;
  }

  const targetResult = await resolveTargetMessage({
    command: commandResult.value,
    interaction,
  });
  if (targetResult.type === "error") {
    return targetResult;
  }

  const roleResult = await resolveRoleByOption({
    command: commandResult.value,
    interaction,
  });
  if (roleResult.type === "error") {
    return roleResult;
  }

  const assignableResult = validateAssignableRole({
    command: commandResult.value,
    role: roleResult.value,
  });
  if (assignableResult.type === "error") {
    return assignableResult;
  }

  const configResult = resolveButtonConfig(interaction);
  if (configResult.type === "error") {
    return configResult;
  }

  const customId = createRolePickCustomId({
    guildId: commandResult.value.guild.id,
    messageId: targetResult.value.messageId,
    roleId: assignableResult.value.id,
  });

  return toSuccess({
    command: commandResult.value,
    config: configResult.value,
    customId,
    role: assignableResult.value,
    target: targetResult.value,
  });
};

const prepareRemoveSubcommand = async (
  interaction: ChatInputCommandInteraction
): Promise<CommandResult<RemovePreparation>> => {
  const commandResult = await resolveCommandContext(interaction);
  if (commandResult.type === "error") {
    return commandResult;
  }

  const targetResult = await resolveTargetMessage({
    command: commandResult.value,
    interaction,
  });
  if (targetResult.type === "error") {
    return targetResult;
  }

  const roleResult = await resolveRoleByOption({
    command: commandResult.value,
    interaction,
  });
  if (roleResult.type === "error") {
    return roleResult;
  }

  const customId = createRolePickCustomId({
    guildId: commandResult.value.guild.id,
    messageId: targetResult.value.messageId,
    roleId: roleResult.value.id,
  });

  return toSuccess({
    command: commandResult.value,
    customId,
    target: targetResult.value,
  });
};

const prepareRestoreSubcommand = async (
  interaction: ChatInputCommandInteraction
): Promise<CommandResult<RestorePreparation>> => {
  const commandResult = await resolveCommandContext(interaction);
  if (commandResult.type === "error") {
    return commandResult;
  }

  const targetResult = await resolveTargetMessage({
    command: commandResult.value,
    interaction,
  });
  if (targetResult.type === "error") {
    return targetResult;
  }

  return toSuccess({
    command: commandResult.value,
    target: targetResult.value,
  });
};

const executeAddSubcommand = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const preparation = await prepareAddSubcommand(interaction);
  if (preparation.type === "error") {
    await replyCommandError({ interaction, message: preparation.message });
    return;
  }

  const existingRows = toEditableRows(
    preparation.value.target.message,
    preparation.value.command.preferredLocale
  );
  if (existingRows.type === "error") {
    await replyCommandError({ interaction, message: existingRows.message });
    return;
  }

  const rowsResult = addRolePickButtonToRows({
    command: preparation.value.command,
    config: preparation.value.config,
    customId: preparation.value.customId,
    rows: existingRows.value,
  });
  if (rowsResult.type === "error") {
    await replyCommandError({ interaction, message: rowsResult.message });
    return;
  }

  const updateResult = await updateMessageComponents({
    command: preparation.value.command,
    message: preparation.value.target.message,
    rows: rowsResult.value,
  });
  if (updateResult.type === "error") {
    await replyCommandError({ interaction, message: updateResult.message });
    return;
  }

  await replyCommandSuccess({
    interaction,
    message: t(
      "rolePickButton.success.added",
      {
        channelId: preparation.value.target.channel.id,
        label: preparation.value.config.label,
        roleId: preparation.value.role.id,
      },
      preparation.value.command.preferredLocale
    ),
  });
};

const executeRemoveSubcommand = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const preparation = await prepareRemoveSubcommand(interaction);
  if (preparation.type === "error") {
    await replyCommandError({ interaction, message: preparation.message });
    return;
  }

  const existingRows = toEditableRows(
    preparation.value.target.message,
    preparation.value.command.preferredLocale
  );
  if (existingRows.type === "error") {
    await replyCommandError({ interaction, message: existingRows.message });
    return;
  }

  const removed = removeSpecificButtonFromRows({
    customId: preparation.value.customId,
    rows: existingRows.value,
  });
  if (removed.removedCount === 0) {
    await replyCommandError({
      interaction,
      message: t(
        "rolePickButton.errors.buttonNotFound",
        undefined,
        preparation.value.command.preferredLocale
      ),
    });
    return;
  }

  const updateResult = await updateMessageComponents({
    command: preparation.value.command,
    message: preparation.value.target.message,
    rows: removed.rows,
  });
  if (updateResult.type === "error") {
    await replyCommandError({ interaction, message: updateResult.message });
    return;
  }

  await replyCommandSuccess({
    interaction,
    message: t(
      "rolePickButton.success.removed",
      {
        count: removed.removedCount,
      },
      preparation.value.command.preferredLocale
    ),
  });
};

const executeRestoreSubcommand = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const preparation = await prepareRestoreSubcommand(interaction);
  if (preparation.type === "error") {
    await replyCommandError({ interaction, message: preparation.message });
    return;
  }

  const existingRows = toEditableRows(
    preparation.value.target.message,
    preparation.value.command.preferredLocale
  );
  if (existingRows.type === "error") {
    await replyCommandError({ interaction, message: existingRows.message });
    return;
  }

  const removed = removeAllRolePickButtonsFromRows({
    rows: existingRows.value,
  });
  if (removed.removedCount === 0) {
    await replyCommandError({
      interaction,
      message: t(
        "rolePickButton.errors.restoreNoButtons",
        undefined,
        preparation.value.command.preferredLocale
      ),
    });
    return;
  }

  const updateResult = await updateMessageComponents({
    command: preparation.value.command,
    message: preparation.value.target.message,
    rows: removed.rows,
  });
  if (updateResult.type === "error") {
    await replyCommandError({ interaction, message: updateResult.message });
    return;
  }

  await replyCommandSuccess({
    interaction,
    message: t(
      "rolePickButton.success.restored",
      {
        count: removed.removedCount,
      },
      preparation.value.command.preferredLocale
    ),
  });
};

const executeRolePickSubcommand = async ({
  interaction,
  subcommand,
}: {
  interaction: ChatInputCommandInteraction;
  subcommand: RolePickSubcommand;
}): Promise<void> => {
  if (subcommand === ADD_SUBCOMMAND) {
    await executeAddSubcommand(interaction);
    return;
  }

  if (subcommand === REMOVE_SUBCOMMAND) {
    await executeRemoveSubcommand(interaction);
    return;
  }

  await executeRestoreSubcommand(interaction);
};

const createButtonInteractionPayload = ({
  message,
  tone,
}: {
  message: string;
  tone: BotEmbedTone;
}): InteractionReplyOptions => ({
  embeds: [createMinimalEmbed({ message, tone })],
  flags: MessageFlags.Ephemeral as const,
});

const replyToButtonInteraction = async ({
  interaction,
  message,
  tone,
}: {
  interaction: ButtonInteraction;
  message: string;
  tone: BotEmbedTone;
}): Promise<void> => {
  const payload = createButtonInteractionPayload({ message, tone });

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }

  await interaction.reply(payload);
};

const resolveInteractionRole = async ({
  interaction,
  parsed,
  preferredLocale,
}: {
  interaction: ButtonInteraction;
  parsed: ParsedRolePickCustomId;
  preferredLocale: string | null;
}): Promise<CommandResult<Role>> => {
  const cachedRole = interaction.guild?.roles.cache.get(parsed.roleId);
  if (cachedRole) {
    return toSuccess(cachedRole);
  }

  try {
    const fetchedRole = await interaction.guild?.roles.fetch(parsed.roleId);
    if (!fetchedRole) {
      return toError(
        t("rolePickButton.errors.roleNotFound", undefined, preferredLocale)
      );
    }

    return toSuccess(fetchedRole);
  } catch {
    return toError(
      t("rolePickButton.errors.roleNotFound", undefined, preferredLocale)
    );
  }
};

const resolveButtonInteractionContext = async (
  interaction: ButtonInteraction
): Promise<CommandResult<RolePickButtonInteractionContext>> => {
  const preferredLocale = getPreferredLocale({
    guildLocale: interaction.guildLocale,
    locale: interaction.locale,
  });

  const parsed = parseRolePickCustomId(interaction.customId);
  if (!parsed) {
    return toError(
      t("rolePickButton.interaction.invalidButton", undefined, preferredLocale)
    );
  }

  if (!interaction.guild || !interaction.guildId) {
    return toError(
      t("rolePickButton.errors.serverOnly", undefined, preferredLocale)
    );
  }

  if (
    parsed.guildId !== interaction.guildId ||
    parsed.messageId !== interaction.message.id
  ) {
    return toError(
      t("rolePickButton.interaction.invalidButton", undefined, preferredLocale)
    );
  }

  const botMember = await resolveBotMember(interaction.guild);
  if (!botMember) {
    return toError(
      t(
        "rolePickButton.errors.botMemberUnavailable",
        undefined,
        preferredLocale
      )
    );
  }

  let member: GuildMember;
  try {
    member = await interaction.guild.members.fetch(interaction.user.id);
  } catch {
    return toError(
      t("rolePickButton.interaction.memberNotFound", undefined, preferredLocale)
    );
  }

  const roleResult = await resolveInteractionRole({
    interaction,
    parsed,
    preferredLocale,
  });
  if (roleResult.type === "error") {
    return roleResult;
  }

  return toSuccess({
    botMember,
    member,
    parsed,
    preferredLocale,
    role: roleResult.value,
  });
};

const ensureInteractionRoleIsAssignable = ({
  context,
}: {
  context: RolePickButtonInteractionContext;
}): CommandResult<RolePickButtonInteractionContext> => {
  if (!context.botMember.permissions.has(MANAGE_ROLES_PERMISSION)) {
    return toError(
      t(
        "rolePickButton.errors.botMissingManageRoles",
        undefined,
        context.preferredLocale
      )
    );
  }

  if (context.role.position >= context.botMember.roles.highest.position) {
    return toError(
      t(
        "rolePickButton.errors.roleAboveBot",
        undefined,
        context.preferredLocale
      )
    );
  }

  return toSuccess(context);
};

const toggleRoleFromRolePickButton = async ({
  context,
  interaction,
}: {
  context: RolePickButtonInteractionContext;
  interaction: ButtonInteraction;
}): Promise<CommandResult<RoleToggleAction>> => {
  const hasRole = context.member.roles.cache.has(context.role.id);
  const roleAction: RoleToggleAction = hasRole ? "removed" : "added";
  try {
    if (roleAction === "removed") {
      await context.member.roles.remove(
        context.role,
        `Role Pick Button (${context.parsed.messageId})`
      );
      return toSuccess("removed");
    }

    await context.member.roles.add(
      context.role,
      `Role Pick Button (${context.parsed.messageId})`
    );
    return toSuccess("added");
  } catch (error: unknown) {
    log.error({
      buttonCustomId: interaction.customId,
      channelId: interaction.channelId,
      err: error,
      guildId: interaction.guildId,
      interactionId: interaction.id,
      message: "Failed to toggle role from role pick button",
      roleAction,
      roleId: context.role.id,
      userId: interaction.user.id,
    });

    return toError(
      t(
        "rolePickButton.interaction.toggleFailed",
        undefined,
        context.preferredLocale
      )
    );
  }
};

export const handleRolePickButtonInteraction = async (
  interaction: ButtonInteraction
): Promise<void> => {
  const contextResult = await resolveButtonInteractionContext(interaction);
  if (contextResult.type === "error") {
    await replyToButtonInteraction({
      interaction,
      message: contextResult.message,
      tone: "error",
    });
    return;
  }

  const assignableResult = ensureInteractionRoleIsAssignable({
    context: contextResult.value,
  });
  if (assignableResult.type === "error") {
    await replyToButtonInteraction({
      interaction,
      message: assignableResult.message,
      tone: "error",
    });
    return;
  }

  const toggleResult = await toggleRoleFromRolePickButton({
    context: assignableResult.value,
    interaction,
  });
  if (toggleResult.type === "error") {
    await replyToButtonInteraction({
      interaction,
      message: toggleResult.message,
      tone: "error",
    });
    return;
  }

  const successKey =
    toggleResult.value === "added"
      ? "rolePickButton.interaction.assigned"
      : "rolePickButton.interaction.removed";

  await replyToButtonInteraction({
    interaction,
    message: t(
      successKey,
      {
        roleId: contextResult.value.role.id,
      },
      contextResult.value.preferredLocale
    ),
    tone: "success",
  });
};

const createAddSubcommand = (
  subcommand: SlashCommandSubcommandBuilder
): SlashCommandSubcommandBuilder =>
  subcommand
    .setName(ADD_SUBCOMMAND)
    .setDescription(t("commands.rolePickButton.sub.add.description"))
    .addChannelOption((option) =>
      option
        .setName(CHANNEL_OPTION)
        .setDescription(t("commands.rolePickButton.option.channel.description"))
        .addChannelTypes(
          ChannelType.GuildAnnouncement,
          ChannelType.GuildText,
          ChannelType.AnnouncementThread,
          ChannelType.PublicThread,
          ChannelType.PrivateThread
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName(MESSAGE_ID_OPTION)
        .setDescription(
          t("commands.rolePickButton.option.messageId.description")
        )
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName(ROLE_OPTION)
        .setDescription(t("commands.rolePickButton.option.role.description"))
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName(LABEL_OPTION)
        .setDescription(t("commands.rolePickButton.option.label.description"))
        .setRequired(true)
        .setMaxLength(80)
        .setMinLength(1)
    )
    .addStringOption((option) =>
      option
        .setName(STYLE_OPTION)
        .setDescription(t("commands.rolePickButton.option.style.description"))
        .setRequired(true)
        .addChoices(
          {
            name: t("commands.rolePickButton.choice.style.primary"),
            value: "primary",
          },
          {
            name: t("commands.rolePickButton.choice.style.secondary"),
            value: "secondary",
          },
          {
            name: t("commands.rolePickButton.choice.style.success"),
            value: "success",
          },
          {
            name: t("commands.rolePickButton.choice.style.danger"),
            value: "danger",
          }
        )
    )
    .addStringOption((option) =>
      option
        .setName(EMOJI_OPTION)
        .setDescription(t("commands.rolePickButton.option.emoji.description"))
        .setRequired(false)
    );

const createRemoveSubcommand = (
  subcommand: SlashCommandSubcommandBuilder
): SlashCommandSubcommandBuilder =>
  subcommand
    .setName(REMOVE_SUBCOMMAND)
    .setDescription(t("commands.rolePickButton.sub.remove.description"))
    .addChannelOption((option) =>
      option
        .setName(CHANNEL_OPTION)
        .setDescription(t("commands.rolePickButton.option.channel.description"))
        .addChannelTypes(
          ChannelType.GuildAnnouncement,
          ChannelType.GuildText,
          ChannelType.AnnouncementThread,
          ChannelType.PublicThread,
          ChannelType.PrivateThread
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName(MESSAGE_ID_OPTION)
        .setDescription(
          t("commands.rolePickButton.option.messageId.description")
        )
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName(ROLE_OPTION)
        .setDescription(t("commands.rolePickButton.option.role.description"))
        .setRequired(true)
    );

const createRestoreSubcommand = (
  subcommand: SlashCommandSubcommandBuilder
): SlashCommandSubcommandBuilder =>
  subcommand
    .setName(RESTORE_SUBCOMMAND)
    .setDescription(t("commands.rolePickButton.sub.restore.description"))
    .addChannelOption((option) =>
      option
        .setName(CHANNEL_OPTION)
        .setDescription(t("commands.rolePickButton.option.channel.description"))
        .addChannelTypes(
          ChannelType.GuildAnnouncement,
          ChannelType.GuildText,
          ChannelType.AnnouncementThread,
          ChannelType.PublicThread,
          ChannelType.PrivateThread
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName(MESSAGE_ID_OPTION)
        .setDescription(
          t("commands.rolePickButton.option.messageId.description")
        )
        .setRequired(true)
    );

export const rolePickButtonCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription(t("commands.rolePickButton.description"))
    .setDMPermission(false)
    .setDefaultMemberPermissions(ADMINISTRATOR_PERMISSION)
    .addSubcommand((subcommand) => createAddSubcommand(subcommand))
    .addSubcommand((subcommand) => createRemoveSubcommand(subcommand))
    .addSubcommand((subcommand) => createRestoreSubcommand(subcommand)),
  execute: async (interaction): Promise<void> => {
    const subcommand = resolveRolePickSubcommand(interaction);
    if (!subcommand) {
      await replyCommandError({
        interaction,
        message: t("rolePickButton.errors.unsupportedSubcommand"),
      });
      return;
    }

    await executeRolePickSubcommand({
      interaction,
      subcommand,
    });
  },
};
