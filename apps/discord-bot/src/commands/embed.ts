import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type {
  APIEmbedField,
  ChatInputCommandInteraction,
  SendableChannels,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import { log } from "evlog";

import { replyWithEmbed } from "@/discord/embeds";
import { t } from "@/i18n";

import type { SlashCommand } from "./types";

const ADMINISTRATOR_PERMISSION = PermissionFlagsBits.Administrator;
const SEND_SUBCOMMAND = "send";
const HEX_COLOR_PATTERN = /^#?([a-fA-F0-9]{6})$/;

const EMBED_FIELD_OPTION_GROUPS = [
  {
    inlineOption: "field-1-inline",
    nameOption: "field-1-name",
    valueOption: "field-1-value",
  },
  {
    inlineOption: "field-2-inline",
    nameOption: "field-2-name",
    valueOption: "field-2-value",
  },
  {
    inlineOption: "field-3-inline",
    nameOption: "field-3-name",
    valueOption: "field-3-value",
  },
] as const;

type EmbedBuildResult =
  | {
      content: string | null;
      embed: EmbedBuilder;
      type: "success";
    }
  | {
      message: string;
      type: "error";
    };

type ValidationResult<T> =
  | {
      type: "success";
      value: T;
    }
  | {
      message: string;
      type: "error";
    };

type UrlDraftKey =
  | "authorIconUrlInput"
  | "authorUrlInput"
  | "footerIconUrlInput"
  | "imageUrlInput"
  | "thumbnailUrlInput"
  | "urlInput";

type UrlResultKey =
  | "authorIconUrl"
  | "authorUrl"
  | "footerIconUrl"
  | "imageUrl"
  | "thumbnailUrl"
  | "url";

interface EmbedDraft {
  authorIconUrlInput: string | null;
  authorName: string | null;
  authorUrlInput: string | null;
  colorInput: string | null;
  content: string | null;
  description: string | null;
  footerIconUrlInput: string | null;
  footerText: string | null;
  imageUrlInput: string | null;
  includeTimestamp: boolean;
  thumbnailUrlInput: string | null;
  title: string | null;
  urlInput: string | null;
}

interface ResolvedUrls {
  authorIconUrl: string | null;
  authorUrl: string | null;
  footerIconUrl: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  url: string | null;
}

interface ResolvedEmbedParts {
  color: number | null;
  fields: APIEmbedField[];
  urls: ResolvedUrls;
}

interface SendContext {
  channel: SendableChannels;
  guildId: string;
}

interface SentMessageContext {
  channelId: string;
  messageUrl: string;
}

interface PreparedSendContext {
  context: SendContext;
  embedResult: Extract<EmbedBuildResult, { type: "success" }>;
}

interface UrlFieldDescriptor {
  draftKey: UrlDraftKey;
  path: string;
  resultKey: UrlResultKey;
}

const URL_FIELD_DESCRIPTORS: readonly UrlFieldDescriptor[] = [
  {
    draftKey: "urlInput",
    path: "embed.url",
    resultKey: "url",
  },
  {
    draftKey: "authorUrlInput",
    path: "embed.author.url",
    resultKey: "authorUrl",
  },
  {
    draftKey: "authorIconUrlInput",
    path: "embed.author.iconURL",
    resultKey: "authorIconUrl",
  },
  {
    draftKey: "footerIconUrlInput",
    path: "embed.footer.iconURL",
    resultKey: "footerIconUrl",
  },
  {
    draftKey: "thumbnailUrlInput",
    path: "embed.thumbnail.url",
    resultKey: "thumbnailUrl",
  },
  {
    draftKey: "imageUrlInput",
    path: "embed.image.url",
    resultKey: "imageUrl",
  },
] as const;

const getInteractionLocale = (
  interaction: ChatInputCommandInteraction
): string | null => interaction.locale ?? interaction.guildLocale ?? null;

const toTrimmedString = (value: string | null): string | null => {
  const trimmedValue = value?.trim();
  return trimmedValue || null;
};

const toError = (message: string): ValidationResult<never> => ({
  message,
  type: "error",
});

const toSuccess = <T>(value: T): ValidationResult<T> => ({
  type: "success",
  value,
});

const parseColorValue = (input: string): number | null => {
  const match = HEX_COLOR_PATTERN.exec(input);
  if (!match) {
    return null;
  }

  const [, hexValue] = match;
  if (!hexValue) {
    return null;
  }

  const colorValue = Number.parseInt(hexValue, 16);
  return Number.isNaN(colorValue) ? null : colorValue;
};

const toValidatedUrl = (input: string): string | null => {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

const isSendableChannel = (channel: unknown): channel is SendableChannels =>
  typeof channel === "object" &&
  channel !== null &&
  "send" in channel &&
  typeof channel.send === "function";

const resolveSendableChannel = ({
  interaction,
  preferredLocale,
}: {
  interaction: ChatInputCommandInteraction;
  preferredLocale: string | null;
}): ValidationResult<SendableChannels> => {
  const selectedChannel = interaction.options.getChannel("channel", true);
  if (!isSendableChannel(selectedChannel)) {
    return toError(
      t("embed.errors.channelNotSendable", undefined, preferredLocale)
    );
  }

  return toSuccess(selectedChannel);
};

const collectEmbedFields = ({
  interaction,
  preferredLocale,
}: {
  interaction: ChatInputCommandInteraction;
  preferredLocale: string | null;
}): ValidationResult<APIEmbedField[]> => {
  const fields: APIEmbedField[] = [];

  for (const [index, group] of EMBED_FIELD_OPTION_GROUPS.entries()) {
    const name = toTrimmedString(
      interaction.options.getString(group.nameOption)
    );
    const value = toTrimmedString(
      interaction.options.getString(group.valueOption)
    );
    const inline = interaction.options.getBoolean(group.inlineOption) ?? false;

    if (Boolean(name) !== Boolean(value)) {
      return toError(
        t("embed.errors.fieldIncomplete", { index: index + 1 }, preferredLocale)
      );
    }

    if (name && value) {
      fields.push({ inline, name, value });
    }
  }

  return toSuccess(fields);
};

const readEmbedDraft = (
  interaction: ChatInputCommandInteraction
): EmbedDraft => ({
  authorIconUrlInput: toTrimmedString(
    interaction.options.getString("author-icon-url")
  ),
  authorName: toTrimmedString(interaction.options.getString("author-name")),
  authorUrlInput: toTrimmedString(interaction.options.getString("author-url")),
  colorInput: toTrimmedString(interaction.options.getString("color")),
  content: toTrimmedString(interaction.options.getString("content")),
  description: toTrimmedString(interaction.options.getString("description")),
  footerIconUrlInput: toTrimmedString(
    interaction.options.getString("footer-icon-url")
  ),
  footerText: toTrimmedString(interaction.options.getString("footer-text")),
  imageUrlInput: toTrimmedString(interaction.options.getString("image-url")),
  includeTimestamp: interaction.options.getBoolean("timestamp") ?? false,
  thumbnailUrlInput: toTrimmedString(
    interaction.options.getString("thumbnail-url")
  ),
  title: toTrimmedString(interaction.options.getString("title")),
  urlInput: toTrimmedString(interaction.options.getString("url")),
});

const validateEmbedDraft = ({
  draft,
  preferredLocale,
}: {
  draft: EmbedDraft;
  preferredLocale: string | null;
}): ValidationResult<EmbedDraft> => {
  if (!draft.authorName && (draft.authorUrlInput || draft.authorIconUrlInput)) {
    return toError(
      t("embed.errors.authorNameRequired", undefined, preferredLocale)
    );
  }

  if (!draft.footerText && draft.footerIconUrlInput) {
    return toError(
      t("embed.errors.footerTextRequired", undefined, preferredLocale)
    );
  }

  return toSuccess(draft);
};

const resolveEmbedUrls = ({
  draft,
  preferredLocale,
}: {
  draft: EmbedDraft;
  preferredLocale: string | null;
}): ValidationResult<ResolvedUrls> => {
  const urls: ResolvedUrls = {
    authorIconUrl: null,
    authorUrl: null,
    footerIconUrl: null,
    imageUrl: null,
    thumbnailUrl: null,
    url: null,
  };

  for (const descriptor of URL_FIELD_DESCRIPTORS) {
    const rawValue = draft[descriptor.draftKey];
    if (!rawValue) {
      continue;
    }

    const validated = toValidatedUrl(rawValue);
    if (!validated) {
      return toError(
        t(
          "embed.errors.invalidUrl",
          { field: descriptor.path },
          preferredLocale
        )
      );
    }

    urls[descriptor.resultKey] = validated;
  }

  return toSuccess(urls);
};

const resolveEmbedColor = ({
  draft,
  preferredLocale,
}: {
  draft: EmbedDraft;
  preferredLocale: string | null;
}): ValidationResult<number | null> => {
  if (!draft.colorInput) {
    return toSuccess(null);
  }

  const colorValue = parseColorValue(draft.colorInput);
  if (colorValue === null) {
    return toError(t("embed.errors.invalidColor", undefined, preferredLocale));
  }

  return toSuccess(colorValue);
};

const resolveEmbedParts = ({
  draft,
  interaction,
  preferredLocale,
}: {
  draft: EmbedDraft;
  interaction: ChatInputCommandInteraction;
  preferredLocale: string | null;
}): ValidationResult<ResolvedEmbedParts> => {
  const urlsResult = resolveEmbedUrls({ draft, preferredLocale });
  if (urlsResult.type === "error") {
    return urlsResult;
  }

  const colorResult = resolveEmbedColor({ draft, preferredLocale });
  if (colorResult.type === "error") {
    return colorResult;
  }

  const fieldsResult = collectEmbedFields({ interaction, preferredLocale });
  if (fieldsResult.type === "error") {
    return fieldsResult;
  }

  return toSuccess({
    color: colorResult.value,
    fields: fieldsResult.value,
    urls: urlsResult.value,
  });
};

const applyBaseEmbedProperties = ({
  color,
  draft,
  embed,
  urls,
}: {
  color: number | null;
  draft: EmbedDraft;
  embed: EmbedBuilder;
  urls: ResolvedUrls;
}): void => {
  const textProperties = [
    { apply: (value: string) => embed.setTitle(value), value: draft.title },
    {
      apply: (value: string) => embed.setDescription(value),
      value: draft.description,
    },
    { apply: (value: string) => embed.setURL(value), value: urls.url },
  ] as const;

  for (const property of textProperties) {
    if (property.value) {
      property.apply(property.value);
    }
  }

  if (color !== null) {
    embed.setColor(color);
  }

  if (draft.includeTimestamp) {
    embed.setTimestamp(new Date());
  }
};

const applyAuthorProperties = ({
  draft,
  embed,
  urls,
}: {
  draft: EmbedDraft;
  embed: EmbedBuilder;
  urls: ResolvedUrls;
}): void => {
  if (!draft.authorName) {
    return;
  }

  embed.setAuthor({
    ...(urls.authorIconUrl ? { iconURL: urls.authorIconUrl } : {}),
    name: draft.authorName,
    ...(urls.authorUrl ? { url: urls.authorUrl } : {}),
  });
};

const applyFooterProperties = ({
  draft,
  embed,
  urls,
}: {
  draft: EmbedDraft;
  embed: EmbedBuilder;
  urls: ResolvedUrls;
}): void => {
  if (!draft.footerText) {
    return;
  }

  embed.setFooter({
    ...(urls.footerIconUrl ? { iconURL: urls.footerIconUrl } : {}),
    text: draft.footerText,
  });
};

const applyMediaProperties = ({
  embed,
  urls,
}: {
  embed: EmbedBuilder;
  urls: ResolvedUrls;
}): void => {
  const mediaProperties = [
    {
      apply: (value: string) => embed.setThumbnail(value),
      value: urls.thumbnailUrl,
    },
    { apply: (value: string) => embed.setImage(value), value: urls.imageUrl },
  ] as const;

  for (const property of mediaProperties) {
    if (property.value) {
      property.apply(property.value);
    }
  }
};

const buildEmbed = ({
  draft,
  parts,
}: {
  draft: EmbedDraft;
  parts: ResolvedEmbedParts;
}): EmbedBuilder => {
  const embed = new EmbedBuilder();

  applyBaseEmbedProperties({
    color: parts.color,
    draft,
    embed,
    urls: parts.urls,
  });
  applyAuthorProperties({ draft, embed, urls: parts.urls });
  applyFooterProperties({ draft, embed, urls: parts.urls });
  applyMediaProperties({ embed, urls: parts.urls });

  if (parts.fields.length > 0) {
    embed.addFields(parts.fields);
  }

  return embed;
};

const isEmbedEmpty = (embed: EmbedBuilder): boolean =>
  Object.keys(embed.toJSON()).length === 0;

const buildEmbedFromInteraction = ({
  interaction,
  preferredLocale,
}: {
  interaction: ChatInputCommandInteraction;
  preferredLocale: string | null;
}): EmbedBuildResult => {
  const draftResult = validateEmbedDraft({
    draft: readEmbedDraft(interaction),
    preferredLocale,
  });
  if (draftResult.type === "error") {
    return draftResult;
  }

  const partsResult = resolveEmbedParts({
    draft: draftResult.value,
    interaction,
    preferredLocale,
  });
  if (partsResult.type === "error") {
    return partsResult;
  }

  const embed = buildEmbed({
    draft: draftResult.value,
    parts: partsResult.value,
  });
  if (isEmbedEmpty(embed)) {
    return {
      message: t("embed.errors.emptyEmbed", undefined, preferredLocale),
      type: "error",
    };
  }

  return {
    content: draftResult.value.content,
    embed,
    type: "success",
  };
};

const resolveSendContext = ({
  interaction,
  preferredLocale,
}: {
  interaction: ChatInputCommandInteraction;
  preferredLocale: string | null;
}): ValidationResult<SendContext> => {
  if (!interaction.guildId) {
    return toError(t("embed.errors.serverOnly", undefined, preferredLocale));
  }

  if (!interaction.memberPermissions?.has(ADMINISTRATOR_PERMISSION)) {
    return toError(t("embed.errors.adminRequired", undefined, preferredLocale));
  }

  const channelResult = resolveSendableChannel({
    interaction,
    preferredLocale,
  });
  if (channelResult.type === "error") {
    return channelResult;
  }

  return toSuccess({
    channel: channelResult.value,
    guildId: interaction.guildId,
  });
};

const sendEmbedToChannel = async ({
  context,
  embedResult,
  interaction,
  preferredLocale,
}: {
  context: SendContext;
  embedResult: Extract<EmbedBuildResult, { type: "success" }>;
  interaction: ChatInputCommandInteraction;
  preferredLocale: string | null;
}): Promise<ValidationResult<SentMessageContext>> => {
  try {
    const sentMessage = await context.channel.send({
      ...(embedResult.content ? { content: embedResult.content } : {}),
      embeds: [embedResult.embed],
    });

    return toSuccess({
      channelId: sentMessage.channelId,
      messageUrl: `https://discord.com/channels/${context.guildId}/${sentMessage.channelId}/${sentMessage.id}`,
    });
  } catch (error: unknown) {
    log.error({
      channelId: context.channel.id,
      commandName: interaction.commandName,
      err: error,
      guildId: interaction.guildId,
      interactionId: interaction.id,
      message: "Failed to send admin embed",
      userId: interaction.user.id,
    });

    return toError(t("embed.errors.sendFailed", undefined, preferredLocale));
  }
};

const replyWithError = async ({
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

const replyWithSendSuccess = async ({
  interaction,
  preferredLocale,
  sentMessage,
}: {
  interaction: ChatInputCommandInteraction;
  preferredLocale: string | null;
  sentMessage: SentMessageContext;
}): Promise<void> => {
  await replyWithEmbed({
    interaction,
    message: t(
      "embed.success.sent",
      {
        channelId: sentMessage.channelId,
        messageUrl: sentMessage.messageUrl,
      },
      preferredLocale
    ),
    tone: "success",
  });
};

const prepareSendContext = ({
  interaction,
  preferredLocale,
}: {
  interaction: ChatInputCommandInteraction;
  preferredLocale: string | null;
}): ValidationResult<PreparedSendContext> => {
  const contextResult = resolveSendContext({ interaction, preferredLocale });
  if (contextResult.type === "error") {
    return contextResult;
  }

  const embedResult = buildEmbedFromInteraction({
    interaction,
    preferredLocale,
  });
  if (embedResult.type === "error") {
    return embedResult;
  }

  return toSuccess({
    context: contextResult.value,
    embedResult,
  });
};

const executeSendEmbed = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const preferredLocale = getInteractionLocale(interaction);

  const preparedResult = prepareSendContext({ interaction, preferredLocale });
  if (preparedResult.type === "error") {
    await replyWithError({ interaction, message: preparedResult.message });
    return;
  }

  const sentResult = await sendEmbedToChannel({
    context: preparedResult.value.context,
    embedResult: preparedResult.value.embedResult,
    interaction,
    preferredLocale,
  });
  if (sentResult.type === "error") {
    await replyWithError({ interaction, message: sentResult.message });
    return;
  }

  await replyWithSendSuccess({
    interaction,
    preferredLocale,
    sentMessage: sentResult.value,
  });
};

const addFieldOptions = (
  subcommand: SlashCommandSubcommandBuilder
): SlashCommandSubcommandBuilder => {
  let configuredSubcommand = subcommand;

  for (const [index, group] of EMBED_FIELD_OPTION_GROUPS.entries()) {
    const fieldIndex = index + 1;

    configuredSubcommand = configuredSubcommand
      .addStringOption((option) =>
        option
          .setName(group.nameOption)
          .setDescription(
            t("commands.embed.option.fieldName.description", {
              index: fieldIndex,
            })
          )
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName(group.valueOption)
          .setDescription(
            t("commands.embed.option.fieldValue.description", {
              index: fieldIndex,
            })
          )
          .setRequired(false)
      )
      .addBooleanOption((option) =>
        option
          .setName(group.inlineOption)
          .setDescription(
            t("commands.embed.option.fieldInline.description", {
              index: fieldIndex,
            })
          )
          .setRequired(false)
      );
  }

  return configuredSubcommand;
};

const createSendSubcommand = (
  subcommand: SlashCommandSubcommandBuilder
): SlashCommandSubcommandBuilder => {
  const withBaseOptions = subcommand
    .setName(SEND_SUBCOMMAND)
    .setDescription(t("commands.embed.sub.send.description"))
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription(t("commands.embed.option.channel.description"))
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
        .setName("content")
        .setDescription(t("commands.embed.option.content.description"))
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription(t("commands.embed.option.title.description"))
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription(t("commands.embed.option.description.description"))
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription(t("commands.embed.option.url.description"))
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("color")
        .setDescription(t("commands.embed.option.color.description"))
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName("timestamp")
        .setDescription(t("commands.embed.option.timestamp.description"))
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("author-name")
        .setDescription(t("commands.embed.option.authorName.description"))
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("author-url")
        .setDescription(t("commands.embed.option.authorUrl.description"))
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("author-icon-url")
        .setDescription(t("commands.embed.option.authorIconUrl.description"))
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("footer-text")
        .setDescription(t("commands.embed.option.footerText.description"))
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("footer-icon-url")
        .setDescription(t("commands.embed.option.footerIconUrl.description"))
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("thumbnail-url")
        .setDescription(t("commands.embed.option.thumbnailUrl.description"))
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("image-url")
        .setDescription(t("commands.embed.option.imageUrl.description"))
        .setRequired(false)
    );

  return addFieldOptions(withBaseOptions);
};

export const embedCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription(t("commands.embed.description"))
    .setDMPermission(false)
    .setDefaultMemberPermissions(ADMINISTRATOR_PERMISSION)
    .addSubcommand((subcommand) => createSendSubcommand(subcommand)),
  execute: async (interaction): Promise<void> => {
    if (interaction.options.getSubcommand() !== SEND_SUBCOMMAND) {
      await replyWithError({
        interaction,
        message: t("embed.errors.unsupportedSubcommand"),
      });
      return;
    }

    await executeSendEmbed(interaction);
  },
};
