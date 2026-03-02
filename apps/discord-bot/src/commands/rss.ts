/* eslint-disable complexity, max-statements */

import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import { log } from "evlog";

import { replyWithEmbed } from "@/discord/embeds";
import {
  fetchAndParseRssFeed,
  normalizeRssFeedUrl,
  resolveInitialCursorForFeed,
} from "@/integrations/rss-feed";
import { buildRssMessagePayload } from "@/integrations/rss-message-payload";
import {
  parseRssMessageStyle,
  serializeRssMessageStyle,
} from "@/integrations/rss-style";
import type { RssMessageStyle } from "@/integrations/rss-style";
import {
  createRssSubscription,
  deleteRssSubscription,
  listRssSubscriptions,
} from "@/integrations/rss-subscriptions";

import type { SlashCommand } from "./types";

const COMMAND_NAME = "rss";
const SUBCOMMAND_SUBSCRIBE = "subscribe";
const SUBCOMMAND_TEST = "test";
const SUBCOMMAND_UNSUBSCRIBE = "unsubscribe";
const SUBCOMMAND_LIST = "list";
const ADMINISTRATOR_PERMISSION = PermissionFlagsBits.Administrator;
const VIEW_CHANNEL_PERMISSION = PermissionFlagsBits.ViewChannel;
const SEND_MESSAGES_PERMISSION = PermissionFlagsBits.SendMessages;
const EMBED_LINKS_PERMISSION = PermissionFlagsBits.EmbedLinks;

const STYLE_OPTION_EXAMPLE =
  '{"format":"embed","embed":{"title":"{{title}}","description":"{{description}}","fields":[{"name":"Link","value":"{{link}}"}]}}';

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

interface CommandContext {
  botMember: GuildMember;
  guild: Guild;
}

interface RssStyleFieldDraft {
  inline: boolean;
  name: string | null;
  value: string | null;
}

interface RssStyleOptionsDraft {
  authorName: string | null;
  authorUrl: string | null;
  authorIconUrl: string | null;
  color: string | null;
  content: string | null;
  description: string | null;
  fields: RssStyleFieldDraft[];
  footerIconUrl: string | null;
  footerText: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  timestamp: boolean | null;
  title: string | null;
  url: string | null;
}

interface StylePayloadEmbedField {
  inline: boolean;
  name: string;
  value: string;
}

interface StylePayloadEmbed {
  author?: string;
  authorIconUrl?: string;
  authorUrl?: string;
  color?: string;
  description?: string;
  fields?: StylePayloadEmbedField[];
  footer?: string;
  footerIconUrl?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  timestamp?: boolean;
  title?: string;
  url?: string;
}

interface StylePayload {
  embed?: StylePayloadEmbed;
  template?: string;
}

const toTrimmedString = (value: string | null): string | null => {
  const trimmedValue = value?.trim();
  return trimmedValue || null;
};

const readStyleDraft = (
  interaction: ChatInputCommandInteraction
): RssStyleOptionsDraft => ({
  authorIconUrl: toTrimmedString(
    interaction.options.getString("author-icon-url")
  ),
  authorName: toTrimmedString(interaction.options.getString("author-name")),
  authorUrl: toTrimmedString(interaction.options.getString("author-url")),
  color: toTrimmedString(interaction.options.getString("color")),
  content: toTrimmedString(interaction.options.getString("content")),
  description: toTrimmedString(interaction.options.getString("description")),
  fields: EMBED_FIELD_OPTION_GROUPS.map((group) => ({
    inline: interaction.options.getBoolean(group.inlineOption) ?? false,
    name: toTrimmedString(interaction.options.getString(group.nameOption)),
    value: toTrimmedString(interaction.options.getString(group.valueOption)),
  })),
  footerIconUrl: toTrimmedString(
    interaction.options.getString("footer-icon-url")
  ),
  footerText: toTrimmedString(interaction.options.getString("footer-text")),
  imageUrl: toTrimmedString(interaction.options.getString("image-url")),
  thumbnailUrl: toTrimmedString(interaction.options.getString("thumbnail-url")),
  timestamp: interaction.options.getBoolean("timestamp"),
  title: toTrimmedString(interaction.options.getString("title")),
  url: toTrimmedString(interaction.options.getString("url")),
});

const hasEmbedOptionValues = (draft: RssStyleOptionsDraft): boolean =>
  Boolean(
    draft.authorName ||
    draft.authorUrl ||
    draft.authorIconUrl ||
    draft.color ||
    draft.description ||
    draft.footerText ||
    draft.footerIconUrl ||
    draft.imageUrl ||
    draft.thumbnailUrl ||
    draft.timestamp !== null ||
    draft.title ||
    draft.url ||
    draft.fields.some((field) => field.name || field.value)
  );

const hasStyleOptionValues = (draft: RssStyleOptionsDraft): boolean =>
  hasEmbedOptionValues(draft) || Boolean(draft.content);

const toStylePayload = ({
  draft,
}: {
  draft: RssStyleOptionsDraft;
}):
  | {
      type: "error";
      message: string;
    }
  | {
      type: "success";
      value: StylePayload | null;
    } => {
  if (!hasStyleOptionValues(draft)) {
    return {
      type: "success",
      value: null,
    };
  }

  if (!draft.authorName && (draft.authorIconUrl || draft.authorUrl)) {
    return {
      message:
        "author-name must be provided when author-url or author-icon-url is set.",
      type: "error",
    };
  }

  if (!draft.footerText && draft.footerIconUrl) {
    return {
      message: "footer-text must be provided when footer-icon-url is set.",
      type: "error",
    };
  }

  const fields: StylePayloadEmbedField[] = [];
  for (const [index, field] of draft.fields.entries()) {
    if (Boolean(field.name) !== Boolean(field.value)) {
      return {
        message: `field-${index + 1}-name and field-${index + 1}-value must be provided together.`,
        type: "error",
      };
    }

    if (!field.name || !field.value) {
      continue;
    }

    fields.push({
      inline: field.inline,
      name: field.name,
      value: field.value,
    });
  }

  const payload: StylePayload = {};
  if (draft.content) {
    payload.template = draft.content;
  }

  payload.embed = {
    ...(draft.authorName ? { author: draft.authorName } : {}),
    ...(draft.authorIconUrl ? { authorIconUrl: draft.authorIconUrl } : {}),
    ...(draft.authorUrl ? { authorUrl: draft.authorUrl } : {}),
    ...(draft.color ? { color: draft.color } : {}),
    ...(draft.description ? { description: draft.description } : {}),
    ...(draft.footerText ? { footer: draft.footerText } : {}),
    ...(draft.footerIconUrl ? { footerIconUrl: draft.footerIconUrl } : {}),
    ...(draft.imageUrl ? { imageUrl: draft.imageUrl } : {}),
    ...(draft.thumbnailUrl ? { thumbnailUrl: draft.thumbnailUrl } : {}),
    ...(draft.timestamp === null ? {} : { timestamp: draft.timestamp }),
    ...(draft.title ? { title: draft.title } : {}),
    ...(draft.url ? { url: draft.url } : {}),
    ...(fields.length > 0 ? { fields } : {}),
  };

  return {
    type: "success",
    value: payload,
  };
};

const resolveStyleFromInteraction = ({
  interaction,
}: {
  interaction: ChatInputCommandInteraction;
}):
  | {
      type: "error";
      message: string;
    }
  | {
      type: "success";
      value: RssMessageStyle;
    } => {
  const styleInput = interaction.options.getString("style");
  const styleDraft = readStyleDraft(interaction);
  const stylePayloadResult = toStylePayload({
    draft: styleDraft,
  });
  if (stylePayloadResult.type === "error") {
    return stylePayloadResult;
  }

  if (styleInput && stylePayloadResult.value) {
    return {
      message:
        "Use either the style JSON option or individual formatting options, not both.",
      type: "error",
    };
  }

  const resolvedStyleJson = stylePayloadResult.value
    ? JSON.stringify(stylePayloadResult.value)
    : styleInput;
  const styleResult = parseRssMessageStyle({
    formatOverride: "embed",
    styleJson: resolvedStyleJson,
  });
  if (styleResult.type === "error") {
    return {
      message: `${styleResult.message}\n\nExample style JSON:\n\`${STYLE_OPTION_EXAMPLE}\``,
      type: "error",
    };
  }

  return {
    type: "success",
    value: styleResult.value,
  };
};

const resolveContext = async (
  interaction: ChatInputCommandInteraction
): Promise<CommandContext | null> => {
  const { guild } = interaction;
  if (!guild) {
    await replyWithEmbed({
      interaction,
      message: "This command can only be used in a server.",
      tone: "error",
    });
    return null;
  }

  if (!interaction.memberPermissions?.has(ADMINISTRATOR_PERMISSION)) {
    await replyWithEmbed({
      interaction,
      message: "You need Administrator permission to manage RSS subscriptions.",
      tone: "error",
    });
    return null;
  }

  const botMember =
    guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!botMember) {
    await replyWithEmbed({
      interaction,
      message: "Unable to resolve bot permissions for this server.",
      tone: "error",
    });
    return null;
  }

  return {
    botMember,
    guild,
  };
};

const isGuildTextBasedChannel = (
  value: unknown
): value is GuildTextBasedChannel =>
  typeof value === "object" &&
  value !== null &&
  "isTextBased" in value &&
  typeof Reflect.get(value, "isTextBased") === "function" &&
  Boolean(
    Reflect.apply(Reflect.get(value, "isTextBased") as () => boolean, value, [])
  ) &&
  "guild" in value &&
  "send" in value &&
  typeof Reflect.get(value, "send") === "function";

const ensureBotChannelPermissions = async ({
  botMember,
  channel,
  interaction,
  requiresEmbedPermission,
}: {
  botMember: GuildMember;
  channel: GuildTextBasedChannel;
  interaction: ChatInputCommandInteraction;
  requiresEmbedPermission: boolean;
}): Promise<boolean> => {
  const requiredPermissions = [
    VIEW_CHANNEL_PERMISSION,
    SEND_MESSAGES_PERMISSION,
  ];
  if (requiresEmbedPermission) {
    requiredPermissions.push(EMBED_LINKS_PERMISSION);
  }

  const permissions = channel.permissionsFor(botMember);
  if (permissions?.has(requiredPermissions)) {
    return true;
  }

  await replyWithEmbed({
    interaction,
    message:
      "I do not have the required permissions in that channel (View Channel, Send Messages, and possibly Embed Links).",
    tone: "error",
  });
  return false;
};

const executeSubscribe = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  // Resolve guild + permission prerequisites before processing options.
  const context = await resolveContext(interaction);
  if (!context) {
    return;
  }

  const rawFeedUrl = interaction.options.getString("feed-url", true);
  const normalizedFeedUrl = normalizeRssFeedUrl(rawFeedUrl);
  if (!normalizedFeedUrl) {
    await replyWithEmbed({
      interaction,
      message: "feed-url must be a valid HTTP or HTTPS URL.",
      tone: "error",
    });
    return;
  }

  const selectedChannel = interaction.options.getChannel("channel", true);
  if (!isGuildTextBasedChannel(selectedChannel)) {
    await replyWithEmbed({
      interaction,
      message: "The selected channel cannot receive bot messages.",
      tone: "error",
    });
    return;
  }

  const styleResult = resolveStyleFromInteraction({ interaction });
  if (styleResult.type === "error") {
    await replyWithEmbed({
      interaction,
      message: styleResult.message,
      tone: "error",
    });
    return;
  }

  const botHasChannelPermissions = await ensureBotChannelPermissions({
    botMember: context.botMember,
    channel: selectedChannel,
    interaction,
    requiresEmbedPermission: true,
  });

  if (!botHasChannelPermissions) {
    return;
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  let parsedFeed;
  try {
    // Validate reachability and parseability before persisting the subscription.
    parsedFeed = await fetchAndParseRssFeed(normalizedFeedUrl);
  } catch (error: unknown) {
    log.warn({
      err: error,
      feedUrl: normalizedFeedUrl,
      message: "RSS subscription rejected because feed validation failed",
    });

    await replyWithEmbed({
      interaction,
      message:
        "Unable to fetch or parse this RSS feed URL. Please verify the URL and try again.",
      tone: "error",
    });
    return;
  }

  const initialCursor = resolveInitialCursorForFeed(parsedFeed.items);

  try {
    const createResult = await createRssSubscription({
      channelId: selectedChannel.id,
      createdByUserId: interaction.user.id,
      feedUrl: normalizedFeedUrl,
      guildId: context.guild.id,
      lastItemId: initialCursor?.itemId ?? null,
      lastItemPublishedAt: initialCursor?.publishedAt ?? null,
      messageStyleJson: serializeRssMessageStyle(styleResult.value),
    });

    if (createResult.type === "duplicate") {
      await replyWithEmbed({
        interaction,
        message:
          "This feed is already subscribed for the selected channel. Duplicate subscriptions are not allowed.",
        tone: "error",
      });
      return;
    }

    await replyWithEmbed({
      interaction,
      message:
        `RSS subscription created for <#${selectedChannel.id}>.\n` +
        `Feed: ${normalizedFeedUrl}`,
      tone: "success",
    });
  } catch (error: unknown) {
    log.error({
      channelId: selectedChannel.id,
      err: error,
      feedUrl: normalizedFeedUrl,
      guildId: context.guild.id,
      message: "Failed to create RSS subscription",
      userId: interaction.user.id,
    });

    await replyWithEmbed({
      interaction,
      message: "Failed to save RSS subscription. Please try again.",
      tone: "error",
    });
  }
};

const toDebugSummary = ({
  feedUrl,
  itemCount,
  parsedFeedDescription,
  parsedFeedTitle,
}: {
  feedUrl: string;
  itemCount: number;
  parsedFeedDescription: string | undefined;
  parsedFeedTitle: string | undefined;
}): string => {
  const lines = [
    "RSS debug test succeeded.",
    `Feed URL: ${feedUrl}`,
    `Feed title: ${parsedFeedTitle ?? "Unknown"}`,
    `Feed description: ${parsedFeedDescription ?? "None"}`,
    `Items parsed: ${itemCount}`,
    "Preview uses the first available item.",
  ];

  return lines.join("\n");
};

const executeTest = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const context = await resolveContext(interaction);
  if (!context) {
    return;
  }

  const rawFeedUrl = interaction.options.getString("feed-url", true);
  const normalizedFeedUrl = normalizeRssFeedUrl(rawFeedUrl);
  if (!normalizedFeedUrl) {
    await replyWithEmbed({
      interaction,
      message: "feed-url must be a valid HTTP or HTTPS URL.",
      tone: "error",
    });
    return;
  }

  const styleResult = resolveStyleFromInteraction({ interaction });
  if (styleResult.type === "error") {
    await replyWithEmbed({
      interaction,
      message: styleResult.message,
      tone: "error",
    });
    return;
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  let parsedFeed;
  try {
    parsedFeed = await fetchAndParseRssFeed(normalizedFeedUrl);
  } catch (error: unknown) {
    log.warn({
      err: error,
      feedUrl: normalizedFeedUrl,
      guildId: context.guild.id,
      message: "RSS debug test failed because feed validation failed",
      userId: interaction.user.id,
    });

    await replyWithEmbed({
      interaction,
      message:
        "Unable to fetch or parse this RSS feed URL. Please verify the URL and try again.",
      tone: "error",
    });
    return;
  }

  const [previewItem] = parsedFeed.items;
  if (!previewItem) {
    await replyWithEmbed({
      interaction,
      message:
        "RSS feed is reachable but contains no items. Nothing to preview yet.",
      tone: "info",
    });
    return;
  }

  const previewPayload = buildRssMessagePayload({
    item: previewItem,
    style: styleResult.value,
  });
  const summary = toDebugSummary({
    feedUrl: normalizedFeedUrl,
    itemCount: parsedFeed.items.length,
    parsedFeedDescription: parsedFeed.description,
    parsedFeedTitle: parsedFeed.title,
  });

  const previewContentSuffix = previewPayload.content
    ? `\n\nPreview content:\n${previewPayload.content}`
    : "";
  const content = `${summary}${previewContentSuffix}`.slice(0, 1900);

  await interaction.editReply({
    allowedMentions: {
      parse: [],
    },
    content,
    embeds: previewPayload.embeds ?? [],
  });
};

const executeUnsubscribe = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const context = await resolveContext(interaction);
  if (!context) {
    return;
  }

  const rawFeedUrl = interaction.options.getString("feed-url", true);
  const normalizedFeedUrl = normalizeRssFeedUrl(rawFeedUrl);
  if (!normalizedFeedUrl) {
    await replyWithEmbed({
      interaction,
      message: "feed-url must be a valid HTTP or HTTPS URL.",
      tone: "error",
    });
    return;
  }

  const selectedChannel = interaction.options.getChannel("channel", true);
  if (!isGuildTextBasedChannel(selectedChannel)) {
    await replyWithEmbed({
      interaction,
      message: "The selected channel cannot receive bot messages.",
      tone: "error",
    });
    return;
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  try {
    const deleted = await deleteRssSubscription({
      channelId: selectedChannel.id,
      feedUrl: normalizedFeedUrl,
      guildId: context.guild.id,
    });

    if (!deleted) {
      await replyWithEmbed({
        interaction,
        message:
          "No matching RSS subscription was found for that feed URL and channel.",
        tone: "info",
      });
      return;
    }

    await replyWithEmbed({
      interaction,
      message:
        `RSS subscription removed from <#${selectedChannel.id}>.\n` +
        `Feed: ${normalizedFeedUrl}`,
      tone: "success",
    });
  } catch (error: unknown) {
    log.error({
      channelId: selectedChannel.id,
      err: error,
      feedUrl: normalizedFeedUrl,
      guildId: context.guild.id,
      message: "Failed to remove RSS subscription",
      userId: interaction.user.id,
    });

    await replyWithEmbed({
      interaction,
      message: "Failed to remove RSS subscription. Please try again.",
      tone: "error",
    });
  }
};

const toRssSubscriptionListMessage = ({
  channelId,
  guildId,
  subscriptions,
}: {
  channelId: string | null;
  guildId: string;
  subscriptions: Awaited<ReturnType<typeof listRssSubscriptions>>;
}): string => {
  const scopedSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.guildId === guildId &&
      (channelId ? subscription.channelId === channelId : true)
  );

  if (scopedSubscriptions.length === 0) {
    return channelId
      ? `No RSS subscriptions found for <#${channelId}>.`
      : "No RSS subscriptions found for this server.";
  }

  const header = channelId
    ? `RSS subscriptions for <#${channelId}> (${scopedSubscriptions.length}):`
    : `RSS subscriptions for this server (${scopedSubscriptions.length}):`;

  const lines = scopedSubscriptions.map(
    (subscription, index) =>
      `${index + 1}. <#${subscription.channelId}> — ${subscription.feedUrl}`
  );

  const maxContentLength = 1900;
  let content = `${header}\n${lines.join("\n")}`;
  if (content.length <= maxContentLength) {
    return content;
  }

  const truncatedLines: string[] = [];
  for (const line of lines) {
    const candidate = `${header}\n${[...truncatedLines, line].join("\n")}`;
    if (candidate.length > maxContentLength - 40) {
      break;
    }

    truncatedLines.push(line);
  }

  const omittedCount = lines.length - truncatedLines.length;
  content =
    `${header}\n${truncatedLines.join("\n")}\n` +
    `...and ${omittedCount} more subscription(s).`;
  return content;
};

const executeList = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const context = await resolveContext(interaction);
  if (!context) {
    return;
  }

  const selectedChannel = interaction.options.getChannel("channel");
  if (selectedChannel && !isGuildTextBasedChannel(selectedChannel)) {
    await replyWithEmbed({
      interaction,
      message: "The selected channel cannot receive bot messages.",
      tone: "error",
    });
    return;
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  try {
    const subscriptions = await listRssSubscriptions();
    const content = toRssSubscriptionListMessage({
      channelId: selectedChannel?.id ?? null,
      guildId: context.guild.id,
      subscriptions,
    });

    await interaction.editReply({
      allowedMentions: {
        parse: [],
      },
      content,
    });
  } catch (error: unknown) {
    log.error({
      err: error,
      guildId: context.guild.id,
      message: "Failed to list RSS subscriptions",
      userId: interaction.user.id,
    });

    await replyWithEmbed({
      interaction,
      message: "Failed to list RSS subscriptions. Please try again.",
      tone: "error",
    });
  }
};

const addStyleOptions = (
  subcommand: SlashCommandSubcommandBuilder
): SlashCommandSubcommandBuilder =>
  subcommand
    .addStringOption((option) =>
      option
        .setName("content")
        .setDescription("Message content template")
        .setMaxLength(1800)
    )
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("Embed title template")
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("Embed description template")
        .setMaxLength(1800)
    )
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("Embed URL template")
        .setMaxLength(1000)
    )
    .addStringOption((option) =>
      option
        .setName("color")
        .setDescription("Embed color (hex, e.g. #3f8cff)")
        .setMaxLength(7)
    )
    .addStringOption((option) =>
      option
        .setName("author-name")
        .setDescription("Embed author template")
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option
        .setName("author-url")
        .setDescription("Embed author URL template")
        .setMaxLength(1000)
    )
    .addStringOption((option) =>
      option
        .setName("author-icon-url")
        .setDescription("Embed author icon URL template")
        .setMaxLength(1000)
    )
    .addStringOption((option) =>
      option
        .setName("footer-text")
        .setDescription("Embed footer template")
        .setMaxLength(512)
    )
    .addStringOption((option) =>
      option
        .setName("footer-icon-url")
        .setDescription("Embed footer icon URL template")
        .setMaxLength(1000)
    )
    .addStringOption((option) =>
      option
        .setName("thumbnail-url")
        .setDescription("Embed thumbnail URL template")
        .setMaxLength(1000)
    )
    .addStringOption((option) =>
      option
        .setName("image-url")
        .setDescription("Embed image URL template")
        .setMaxLength(1000)
    )
    .addBooleanOption((option) =>
      option.setName("timestamp").setDescription("Enable embed timestamp")
    )
    .addStringOption((option) =>
      option
        .setName("field-1-name")
        .setDescription("Embed field 1 name template")
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option
        .setName("field-1-value")
        .setDescription("Embed field 1 value template")
        .setMaxLength(1024)
    )
    .addBooleanOption((option) =>
      option.setName("field-1-inline").setDescription("Display field 1 inline")
    )
    .addStringOption((option) =>
      option
        .setName("field-2-name")
        .setDescription("Embed field 2 name template")
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option
        .setName("field-2-value")
        .setDescription("Embed field 2 value template")
        .setMaxLength(1024)
    )
    .addBooleanOption((option) =>
      option.setName("field-2-inline").setDescription("Display field 2 inline")
    )
    .addStringOption((option) =>
      option
        .setName("field-3-name")
        .setDescription("Embed field 3 name template")
        .setMaxLength(256)
    )
    .addStringOption((option) =>
      option
        .setName("field-3-value")
        .setDescription("Embed field 3 value template")
        .setMaxLength(1024)
    )
    .addBooleanOption((option) =>
      option.setName("field-3-inline").setDescription("Display field 3 inline")
    )
    .addStringOption((option) =>
      option
        .setName("style")
        .setDescription("Optional JSON style config (legacy)")
        .setMaxLength(4000)
    );

export const rssCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription("Manage RSS feed subscriptions")
    .setDMPermission(false)
    .setDefaultMemberPermissions(ADMINISTRATOR_PERMISSION)
    .addSubcommand((subcommand) =>
      addStyleOptions(
        subcommand
          .setName(SUBCOMMAND_SUBSCRIBE)
          .setDescription("Subscribe an RSS feed to a channel")
          .addStringOption((option) =>
            option
              .setName("feed-url")
              .setDescription("RSS feed URL")
              .setRequired(true)
              .setMaxLength(1000)
          )
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("Target channel for feed updates")
              .setRequired(true)
              .addChannelTypes(
                ChannelType.GuildAnnouncement,
                ChannelType.GuildText,
                ChannelType.AnnouncementThread,
                ChannelType.PublicThread,
                ChannelType.PrivateThread
              )
          )
      )
    )
    .addSubcommand((subcommand) =>
      addStyleOptions(
        subcommand
          .setName(SUBCOMMAND_TEST)
          .setDescription("Debug and preview an RSS feed")
          .addStringOption((option) =>
            option
              .setName("feed-url")
              .setDescription("RSS feed URL")
              .setRequired(true)
              .setMaxLength(1000)
          )
      )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName(SUBCOMMAND_UNSUBSCRIBE)
        .setDescription("Unsubscribe an RSS feed from a channel")
        .addStringOption((option) =>
          option
            .setName("feed-url")
            .setDescription("RSS feed URL")
            .setRequired(true)
            .setMaxLength(1000)
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Target channel for feed updates")
            .setRequired(true)
            .addChannelTypes(
              ChannelType.GuildAnnouncement,
              ChannelType.GuildText,
              ChannelType.AnnouncementThread,
              ChannelType.PublicThread,
              ChannelType.PrivateThread
            )
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName(SUBCOMMAND_LIST)
        .setDescription("List RSS feed subscriptions")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Optional channel filter")
            .setRequired(false)
            .addChannelTypes(
              ChannelType.GuildAnnouncement,
              ChannelType.GuildText,
              ChannelType.AnnouncementThread,
              ChannelType.PublicThread,
              ChannelType.PrivateThread
            )
        )
    ),
  execute: async (interaction) => {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === SUBCOMMAND_SUBSCRIBE) {
      await executeSubscribe(interaction);
      return;
    }

    if (subcommand === SUBCOMMAND_TEST) {
      await executeTest(interaction);
      return;
    }

    if (subcommand === SUBCOMMAND_UNSUBSCRIBE) {
      await executeUnsubscribe(interaction);
      return;
    }

    if (subcommand === SUBCOMMAND_LIST) {
      await executeList(interaction);
      return;
    }

    await replyWithEmbed({
      interaction,
      message: "Unsupported rss subcommand.",
      tone: "error",
    });
  },
};
