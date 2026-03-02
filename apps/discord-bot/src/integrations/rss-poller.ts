/* eslint-disable complexity, max-statements, no-void */

import { env } from "@terryscord/env/bot";
import { PermissionFlagsBits } from "discord.js";
import type { Client, GuildTextBasedChannel } from "discord.js";
import { log } from "evlog";

import {
  fetchAndParseRssFeed,
  resolveNewFeedItems,
  resolveRssItemCursor,
} from "./rss-feed";
import type { ParsedRssFeed } from "./rss-feed";
import { buildRssMessagePayload } from "./rss-message-payload";
import { parseStoredRssMessageStyle, resolveDefaultStyle } from "./rss-style";
import type { RssMessageStyle } from "./rss-style";
import {
  listRssSubscriptions,
  safeUpdateRssSubscriptionCursor,
} from "./rss-subscriptions";
import type { RssSubscription } from "./rss-subscriptions";

const VIEW_CHANNEL_PERMISSION = PermissionFlagsBits.ViewChannel;
const SEND_MESSAGES_PERMISSION = PermissionFlagsBits.SendMessages;
const EMBED_LINKS_PERMISSION = PermissionFlagsBits.EmbedLinks;

interface FeedFetchResultSuccess {
  feed: ParsedRssFeed;
  type: "success";
}

interface FeedFetchResultError {
  error: unknown;
  type: "error";
}

type FeedFetchResult = FeedFetchResultSuccess | FeedFetchResultError;

const wait = async (durationMs: number): Promise<void> => {
  if (durationMs <= 0) {
    return;
  }

  await Bun.sleep(durationMs);
};

const resolveStyleForSubscription = (
  subscription: RssSubscription
): RssMessageStyle => {
  const parseResult = parseStoredRssMessageStyle(subscription.messageStyleJson);
  if (parseResult.type === "success") {
    return parseResult.value;
  }

  log.warn({
    message: "Stored RSS style is invalid, falling back to default style",
    reason: parseResult.message,
    subscriptionId: subscription.id,
  });

  return resolveDefaultStyle("embed");
};

const resolvePostChannel = async ({
  client,
  subscription,
}: {
  client: Client<true>;
  subscription: RssSubscription;
}): Promise<GuildTextBasedChannel | null> => {
  const guild =
    client.guilds.cache.get(subscription.guildId) ??
    (await client.guilds.fetch(subscription.guildId).catch(() => null));

  if (!guild) {
    return null;
  }

  const channel = await guild.channels
    .fetch(subscription.channelId)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    return null;
  }

  return channel;
};

const hasChannelSendPermissions = async ({
  channel,
  style,
}: {
  channel: GuildTextBasedChannel;
  style: RssMessageStyle;
}): Promise<boolean> => {
  const botMember =
    channel.guild.members.me ?? (await channel.guild.members.fetchMe());
  const requiredPermissions = [
    VIEW_CHANNEL_PERMISSION,
    SEND_MESSAGES_PERMISSION,
  ];

  if (style.format === "embed") {
    requiredPermissions.push(EMBED_LINKS_PERMISSION);
  }

  const permissions = channel.permissionsFor(botMember);
  if (!permissions) {
    return false;
  }

  return permissions.has(requiredPermissions);
};

const fetchFeedOnce = async ({
  cache,
  feedUrl,
}: {
  cache: Map<string, FeedFetchResult>;
  feedUrl: string;
}): Promise<FeedFetchResult> => {
  const cached = cache.get(feedUrl);
  if (cached) {
    return cached;
  }

  try {
    const feed = await fetchAndParseRssFeed(feedUrl);
    const result: FeedFetchResult = {
      feed,
      type: "success",
    };

    cache.set(feedUrl, result);
    return result;
  } catch (error: unknown) {
    const result: FeedFetchResult = {
      error,
      type: "error",
    };

    cache.set(feedUrl, result);
    return result;
  }
};

// Process one subscription in isolation so failures do not stop the full polling cycle.
const processSubscription = async ({
  client,
  feedCache,
  subscription,
}: {
  client: Client<true>;
  feedCache: Map<string, FeedFetchResult>;
  subscription: RssSubscription;
}): Promise<number> => {
  const style = resolveStyleForSubscription(subscription);
  const feedResult = await fetchFeedOnce({
    cache: feedCache,
    feedUrl: subscription.feedUrl,
  });

  if (feedResult.type === "error") {
    log.error({
      err: feedResult.error,
      feedUrl: subscription.feedUrl,
      message: "Failed to fetch RSS feed for subscription",
      subscriptionId: subscription.id,
    });
    return 0;
  }

  const newItemsNewestFirst = resolveNewFeedItems({
    cursor: {
      lastItemId: subscription.lastItemId,
      lastItemPublishedAt: subscription.lastItemPublishedAt,
    },
    items: feedResult.feed.items,
  });

  if (newItemsNewestFirst.length === 0) {
    return 0;
  }

  const channel = await resolvePostChannel({
    client,
    subscription,
  });

  if (!channel) {
    log.warn({
      channelId: subscription.channelId,
      message:
        "Skipping RSS subscription because target channel is unavailable",
      subscriptionId: subscription.id,
    });
    return 0;
  }

  const canSend = await hasChannelSendPermissions({ channel, style });
  if (!canSend) {
    log.warn({
      channelId: channel.id,
      message:
        "Skipping RSS subscription because the bot does not have required channel permissions",
      subscriptionId: subscription.id,
    });
    return 0;
  }

  const oldestFirstItems = [...newItemsNewestFirst]
    .toReversed()
    .slice(0, env.DISCORD_RSS_MAX_ITEMS_PER_POLL);

  let deliveredCount = 0;
  let lastDeliveredCursor: ReturnType<typeof resolveRssItemCursor> | null =
    null;

  for (const item of oldestFirstItems) {
    const payload = buildRssMessagePayload({ item, style });

    try {
      // Sequential sends + configurable delay reduce burst pressure on Discord rate limits.
      await channel.send(payload);
      deliveredCount += 1;
      lastDeliveredCursor = resolveRssItemCursor(item);
      await wait(env.DISCORD_RSS_POST_DELAY_MS);
    } catch (error: unknown) {
      log.error({
        channelId: channel.id,
        err: error,
        message: "Failed to send RSS item to Discord channel",
        subscriptionId: subscription.id,
      });

      break;
    }
  }

  if (lastDeliveredCursor) {
    await safeUpdateRssSubscriptionCursor({
      id: subscription.id,
      lastItemId: lastDeliveredCursor.itemId,
      lastItemPublishedAt: lastDeliveredCursor.publishedAt,
    });
  }

  return deliveredCount;
};

const runPollCycle = async (client: Client<true>): Promise<void> => {
  const cycleStartedAt = Date.now();
  const subscriptions = await listRssSubscriptions();

  if (subscriptions.length === 0) {
    return;
  }

  const feedCache = new Map<string, FeedFetchResult>();
  let deliveredItems = 0;

  for (const subscription of subscriptions) {
    deliveredItems += await processSubscription({
      client,
      feedCache,
      subscription,
    });
  }

  log.info({
    deliveredItems,
    durationMs: Date.now() - cycleStartedAt,
    message: "Completed RSS poll cycle",
    subscriptionCount: subscriptions.length,
    uniqueFeedCount: feedCache.size,
  });
};

export const startRssSubscriptionPolling = (
  client: Client<true>
): (() => void) => {
  const intervalMs = env.DISCORD_RSS_POLL_INTERVAL_SECONDS * 1000;

  let isStopped = false;
  let isPolling = false;

  const runSafely = async (): Promise<void> => {
    if (isStopped || isPolling) {
      return;
    }

    isPolling = true;

    try {
      await runPollCycle(client);
    } catch (error: unknown) {
      log.error({
        err: error,
        message: "RSS polling cycle failed",
      });
    } finally {
      isPolling = false;
    }
  };

  const interval = setInterval(() => {
    void runSafely();
  }, intervalMs);

  interval.unref?.();
  void runSafely();

  log.info({
    intervalSeconds: env.DISCORD_RSS_POLL_INTERVAL_SECONDS,
    message: "Started RSS subscription polling",
  });

  return (): void => {
    if (isStopped) {
      return;
    }

    isStopped = true;
    clearInterval(interval);

    log.info({
      message: "Stopped RSS subscription polling",
    });
  };
};
