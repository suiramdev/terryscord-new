/* eslint-disable max-statements */

import { env } from "@terryscord/env/bot";
import Parser from "rss-parser";

export interface RssFeedItem {
  author?: string;
  content?: string;
  contentSnippet?: string;
  creator?: string;
  guid?: string;
  id?: string;
  isoDate?: string;
  link?: string;
  pubDate?: string;
  summary?: string;
  title?: string;
  [key: string]: unknown;
}

export interface ParsedRssFeed {
  description?: string;
  items: RssFeedItem[];
  link?: string;
  title?: string;
}

export interface RssItemCursor {
  itemId: string;
  publishedAt: Date | null;
}

export interface RssSubscriptionCursor {
  lastItemId: string | null;
  lastItemPublishedAt: Date | null;
}

const rssParser = new Parser<Record<string, never>, RssFeedItem>();

const resolveTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toDateOrNull = (value: string | null): Date | null => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const fetchFeedXml = async (feedUrl: string): Promise<string> => {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, env.DISCORD_RSS_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(feedUrl, {
      headers: {
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(
        `RSS feed fetch failed with status ${response.status} ${response.statusText}`
      );
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
};

const resolveFallbackItemId = (item: RssFeedItem): string => {
  const fallbackParts = [
    resolveTrimmedString(item.title),
    resolveTrimmedString(item.pubDate),
    resolveTrimmedString(item.link),
    resolveTrimmedString(item.contentSnippet),
    resolveTrimmedString(item.content),
  ];

  const value = fallbackParts.filter(Boolean).join("|");
  return value || JSON.stringify(item);
};

export const resolveRssItemPublishedAt = (item: RssFeedItem): Date | null =>
  toDateOrNull(resolveTrimmedString(item.isoDate)) ??
  toDateOrNull(resolveTrimmedString(item.pubDate));

export const resolveRssItemId = (item: RssFeedItem): string =>
  resolveTrimmedString(item.guid) ??
  resolveTrimmedString(item.id) ??
  resolveTrimmedString(item.link) ??
  resolveFallbackItemId(item);

const resolveItemsNewerThanTimestamp = ({
  items,
  timestamp,
}: {
  items: readonly RssFeedItem[];
  timestamp: Date;
}): RssFeedItem[] =>
  items.filter((item) => {
    const publishedAt = resolveRssItemPublishedAt(item);
    return Boolean(publishedAt && publishedAt.getTime() > timestamp.getTime());
  });

const resolveItemsBeforeKnownCursor = ({
  cursorId,
  items,
}: {
  cursorId: string;
  items: readonly RssFeedItem[];
}): {
  items: RssFeedItem[];
  matchedCursor: boolean;
} => {
  const candidates: RssFeedItem[] = [];

  for (const item of items) {
    const itemId = resolveRssItemId(item);
    if (itemId === cursorId) {
      return {
        items: candidates,
        matchedCursor: true,
      };
    }

    candidates.push(item);
  }

  return {
    items: candidates,
    matchedCursor: false,
  };
};

export const normalizeRssFeedUrl = (value: string): string | null => {
  const input = value.trim();
  if (!input) {
    return null;
  }

  try {
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

export const fetchAndParseRssFeed = async (
  feedUrl: string
): Promise<ParsedRssFeed> => {
  const xml = await fetchFeedXml(feedUrl);
  const parsedFeed = await rssParser.parseString(xml);

  return {
    description: resolveTrimmedString(parsedFeed.description) ?? undefined,
    items: parsedFeed.items,
    link: resolveTrimmedString(parsedFeed.link) ?? undefined,
    title: resolveTrimmedString(parsedFeed.title) ?? undefined,
  };
};

export const resolveRssItemCursor = (item: RssFeedItem): RssItemCursor => ({
  itemId: resolveRssItemId(item),
  publishedAt: resolveRssItemPublishedAt(item),
});

export const resolveInitialCursorForFeed = (
  items: readonly RssFeedItem[]
): RssItemCursor | null => {
  const [firstItem] = items;
  if (!firstItem) {
    return null;
  }

  let newestItem: RssFeedItem = firstItem;
  let newestTimestamp = resolveRssItemPublishedAt(firstItem)?.getTime() ?? null;

  for (const item of items) {
    const timestamp = resolveRssItemPublishedAt(item)?.getTime() ?? null;
    if (timestamp === null) {
      continue;
    }

    if (newestTimestamp === null || timestamp > newestTimestamp) {
      newestItem = item;
      newestTimestamp = timestamp;
    }
  }

  return resolveRssItemCursor(newestItem);
};

export const resolveNewFeedItems = ({
  cursor,
  items,
}: {
  cursor: RssSubscriptionCursor;
  items: readonly RssFeedItem[];
}): RssFeedItem[] => {
  if (items.length === 0) {
    return [];
  }

  if (!cursor.lastItemId && !cursor.lastItemPublishedAt) {
    return [];
  }

  if (cursor.lastItemId) {
    const resolved = resolveItemsBeforeKnownCursor({
      cursorId: cursor.lastItemId,
      items,
    });

    if (resolved.matchedCursor) {
      return resolved.items;
    }
  }

  if (!cursor.lastItemPublishedAt) {
    return [];
  }

  return resolveItemsNewerThanTimestamp({
    items,
    timestamp: cursor.lastItemPublishedAt,
  });
};
