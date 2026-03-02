/* eslint-disable complexity, max-statements */

import { EmbedBuilder } from "discord.js";
import type { MessageCreateOptions } from "discord.js";

import { resolveRssItemPublishedAt } from "./rss-feed";
import type { RssFeedItem } from "./rss-feed";
import {
  renderRssTemplate,
  resolveDefaultStyle,
  resolveDefaultTemplateForFormat,
} from "./rss-style";
import type { RssMessageStyle, RssTemplateValues } from "./rss-style";

const EMBED_COLOR_PATTERN = /^#?([a-fA-F0-9]{6})$/;

const resolveItemValue = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const toTemplateValues = (item: RssFeedItem): RssTemplateValues => {
  const publishedAt = resolveRssItemPublishedAt(item);
  const rawDescription =
    resolveItemValue(item.contentSnippet) ||
    resolveItemValue(item.summary) ||
    resolveItemValue(item.description);
  const rawContent =
    resolveItemValue(item.content) ||
    resolveItemValue(item["content:encoded"]) ||
    rawDescription;

  return {
    author:
      resolveItemValue(item.creator) ||
      resolveItemValue(item.author) ||
      "Unknown author",
    content: rawContent,
    description: rawDescription,
    link: resolveItemValue(item.link),
    pubDate:
      publishedAt?.toISOString() ||
      resolveItemValue(item.pubDate) ||
      "Unknown publication date",
    title: resolveItemValue(item.title) || "Untitled",
  };
};

const resolveHttpUrl = (value: string): string | null => {
  const input = value.trim();
  if (!input) {
    return null;
  }

  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
};

const resolveEmbedColor = (value: string | null): number | null => {
  if (!value) {
    return null;
  }

  const match = EMBED_COLOR_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const [, hexValue] = match;
  if (!hexValue) {
    return null;
  }

  const color = Number.parseInt(hexValue, 16);
  return Number.isNaN(color) ? null : color;
};

const hasEmbedContent = (embed: EmbedBuilder): boolean => {
  const { data } = embed;

  return Boolean(
    data.title ||
    data.description ||
    data.fields?.length ||
    data.footer ||
    data.author ||
    data.image ||
    data.thumbnail ||
    data.url ||
    data.timestamp
  );
};

const buildEmbedPayload = ({
  item,
  style,
}: {
  item: RssFeedItem;
  style: RssMessageStyle;
}): MessageCreateOptions => {
  const values = toTemplateValues(item);
  const embedStyle = style.embed ?? resolveDefaultStyle("embed").embed;
  const embed = new EmbedBuilder();

  if (!embedStyle) {
    return {
      allowedMentions: {
        parse: [],
      },
      content: `${values.title}\n${values.link}`.trim(),
    };
  }

  const title = embedStyle.title
    ? renderRssTemplate(embedStyle.title, values).trim()
    : "";
  if (title) {
    embed.setTitle(title.slice(0, 256));
  }

  const description = embedStyle.description
    ? renderRssTemplate(embedStyle.description, values).trim()
    : "";
  if (description) {
    embed.setDescription(description.slice(0, 4096));
  }

  const url = embedStyle.url
    ? resolveHttpUrl(renderRssTemplate(embedStyle.url, values))
    : null;
  if (url) {
    embed.setURL(url);
  }

  const authorName = embedStyle.author
    ? renderRssTemplate(embedStyle.author, values).trim()
    : "";
  const authorIconUrl = embedStyle.authorIconUrl
    ? resolveHttpUrl(renderRssTemplate(embedStyle.authorIconUrl, values))
    : null;
  const authorUrl = embedStyle.authorUrl
    ? resolveHttpUrl(renderRssTemplate(embedStyle.authorUrl, values))
    : null;
  if (authorName) {
    embed.setAuthor({
      iconURL: authorIconUrl ?? undefined,
      name: authorName.slice(0, 256),
      url: authorUrl ?? undefined,
    });
  }

  const footerText = embedStyle.footer
    ? renderRssTemplate(embedStyle.footer, values).trim()
    : "";
  const footerIconUrl = embedStyle.footerIconUrl
    ? resolveHttpUrl(renderRssTemplate(embedStyle.footerIconUrl, values))
    : null;
  if (footerText) {
    embed.setFooter({
      iconURL: footerIconUrl ?? undefined,
      text: footerText.slice(0, 2048),
    });
  }

  const thumbnailUrl = embedStyle.thumbnailUrl
    ? resolveHttpUrl(renderRssTemplate(embedStyle.thumbnailUrl, values))
    : null;
  if (thumbnailUrl) {
    embed.setThumbnail(thumbnailUrl);
  }

  const imageUrl = embedStyle.imageUrl
    ? resolveHttpUrl(renderRssTemplate(embedStyle.imageUrl, values))
    : null;
  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  const color = resolveEmbedColor(embedStyle.color);
  if (color !== null) {
    embed.setColor(color);
  }

  if (embedStyle.timestamp) {
    const timestamp = resolveRssItemPublishedAt(item) ?? new Date();
    embed.setTimestamp(timestamp);
  }

  for (const field of embedStyle.fields) {
    const name = renderRssTemplate(field.name, values).trim();
    const fieldValue = renderRssTemplate(field.value, values).trim();
    if (!name || !fieldValue) {
      continue;
    }

    embed.addFields({
      inline: field.inline,
      name: name.slice(0, 256),
      value: fieldValue.slice(0, 1024),
    });
  }

  const content = style.template
    ? renderRssTemplate(style.template, values).trim()
    : null;

  if (!hasEmbedContent(embed) && !content) {
    return {
      allowedMentions: {
        parse: [],
      },
      content: `${values.title}\n${values.link}`.trim(),
    };
  }

  return {
    allowedMentions: {
      parse: [],
    },
    ...(content ? { content } : {}),
    embeds: [embed],
  };
};

const buildPlainPayload = ({
  item,
  style,
}: {
  item: RssFeedItem;
  style: RssMessageStyle;
}): MessageCreateOptions => {
  if (style.format === "embed") {
    return buildEmbedPayload({ item, style });
  }

  const template =
    style.template ?? resolveDefaultTemplateForFormat(style.format);
  const content = renderRssTemplate(template, toTemplateValues(item)).trim();

  return {
    allowedMentions: {
      parse: [],
    },
    content: content || `${item.title ?? "Untitled"}`,
  };
};

export const buildRssMessagePayload = ({
  item,
  style,
}: {
  item: RssFeedItem;
  style: RssMessageStyle;
}): MessageCreateOptions => {
  if (style.format === "embed") {
    return buildEmbedPayload({ item, style });
  }

  return buildPlainPayload({ item, style });
};
