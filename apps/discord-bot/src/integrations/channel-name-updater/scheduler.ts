/* eslint-disable max-statements, no-void */

import { PermissionFlagsBits } from "discord.js";
import type { Client, GuildChannel } from "discord.js";
import { log } from "evlog";

import {
  listEnabledChannelNameUpdaters,
  updateChannelNameUpdater,
} from "./settings";
import type { ChannelNameUpdater } from "./settings";
import { getVariableFetcher } from "./variables";

const MANAGE_CHANNELS_PERMISSION = PermissionFlagsBits.ManageChannels;
const TICK_INTERVAL_SECONDS = 60;

const extractPlaceholders = (template: string): string[] => {
  const matches = template.matchAll(/\{([a-zA-Z0-9_]+)\}/g);
  return [
    ...new Set(
      [...matches]
        .map((match) => match[1])
        .filter((value): value is string => typeof value === "string")
    ),
  ];
};

const resolveTargetChannel = async (
  client: Client<true>,
  guildId: string,
  channelId: string
): Promise<GuildChannel | null> => {
  const guild =
    client.guilds.cache.get(guildId) ??
    (await client.guilds.fetch(guildId).catch(() => null));

  if (!guild) {
    return null;
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);

  if (!channel || !channel.isTextBased()) {
    return null;
  }

  return channel as GuildChannel;
};

const hasManageChannelPermission = (channel: GuildChannel): boolean => {
  const botMember = channel.guild.members.me;
  if (!botMember) {
    return false;
  }

  const permissions = channel.permissionsFor(botMember);
  if (!permissions) {
    return false;
  }

  return permissions.has(MANAGE_CHANNELS_PERMISSION);
};

const buildChannelName = (
  template: string,
  values: Record<string, string | number>
): string => {
  let result = template;

  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }

  return result;
};

const hasUnreplacedPlaceholders = (name: string): boolean =>
  /\{[a-zA-Z0-9_]+\}/.test(name);

const shouldRunUpdater = (updater: ChannelNameUpdater): boolean => {
  if (!updater.lastUpdatedAt) {
    return true;
  }

  const elapsedMs = Date.now() - updater.lastUpdatedAt.getTime();
  const intervalMs = updater.updateIntervalMinutes * 60_000;

  return elapsedMs >= intervalMs;
};

const fetchVariableValues = async ({
  client,
  guildId,
  placeholders,
}: {
  client: Client<true>;
  guildId: string;
  placeholders: string[];
}): Promise<Record<string, string | number> | null> => {
  const values: Record<string, string | number> = {};
  let hasValue = false;

  for (const key of placeholders) {
    const fetcher = getVariableFetcher(key);

    if (!fetcher) {
      continue;
    }

    const value = await fetcher.fetch(guildId, client);

    if (value !== null) {
      values[key] = value;
      hasValue = true;
    }
  }

  return hasValue ? values : null;
};

const processUpdater = async ({
  client,
  updater,
}: {
  client: Client<true>;
  updater: ChannelNameUpdater;
}): Promise<boolean> => {
  if (!shouldRunUpdater(updater)) {
    return true;
  }

  const placeholders = extractPlaceholders(updater.nameTemplate);

  if (placeholders.length === 0) {
    log.warn({
      message: "Channel name updater template contains no placeholders",
      updaterId: updater.channelId,
    });

    return false;
  }

  const values = await fetchVariableValues({
    client,
    guildId: updater.guildId,
    placeholders,
  });

  if (values === null) {
    log.debug({
      message: "No variable values resolved for channel name updater",
      updaterId: updater.channelId,
    });

    return false;
  }

  const channel = await resolveTargetChannel(
    client,
    updater.guildId,
    updater.channelId
  );

  if (!channel) {
    log.warn({
      channelId: updater.channelId,
      guildId: updater.guildId,
      message: "Channel name updater target channel not found",
      updaterId: updater.channelId,
    });

    return false;
  }

  if (!hasManageChannelPermission(channel)) {
    log.warn({
      channelId: channel.id,
      guildId: updater.guildId,
      message: "Bot lacks Manage Channels permission for channel name updater",
      updaterId: updater.channelId,
    });

    return false;
  }

  const newName = buildChannelName(updater.nameTemplate, values);

  if (hasUnreplacedPlaceholders(newName)) {
    log.warn({
      channelId: channel.id,
      message: "Channel name contains unreplaced placeholders",
      name: newName,
      updaterId: updater.channelId,
    });
  }

  if (channel.name === newName) {
    await updateChannelNameUpdater({
      channelId: updater.channelId,
      patch: { lastUpdatedAt: new Date() },
    });

    return true;
  }

  try {
    await channel.setName(newName, "Mise à jour automatique du nom de salon");

    await updateChannelNameUpdater({
      channelId: updater.channelId,
      patch: { lastUpdatedAt: new Date() },
    });

    log.info({
      channelId: channel.id,
      guildId: updater.guildId,
      message: "Updated channel name via updater",
      newName,
      updaterId: updater.channelId,
    });

    return true;
  } catch (error: unknown) {
    log.error({
      channelId: channel.id,
      err: error,
      message: "Failed to update channel name",
      updaterId: updater.channelId,
    });

    return false;
  }
};

const runTick = async (client: Client<true>): Promise<void> => {
  const updaters = await listEnabledChannelNameUpdaters();

  if (updaters.length === 0) {
    return;
  }

  let processedCount = 0;
  let skippedCount = 0;

  for (const updater of updaters) {
    if (!shouldRunUpdater(updater)) {
      skippedCount += 1;
      continue;
    }

    const success = await processUpdater({ client, updater });

    if (success) {
      processedCount += 1;
    }
  }

  log.info({
    message: "Completed channel name updater tick",
    processedCount,
    skippedCount,
    totalUpdaters: updaters.length,
  });
};

export const startChannelNameUpdaterScheduler = (
  client: Client<true>
): (() => void) => {
  const intervalMs = TICK_INTERVAL_SECONDS * 1000;

  let isStopped = false;
  let isTicking = false;

  const runSafely = async (): Promise<void> => {
    if (isStopped || isTicking) {
      return;
    }

    isTicking = true;

    try {
      await runTick(client);
    } catch (error: unknown) {
      log.error({
        err: error,
        message: "Channel name updater tick failed",
      });
    } finally {
      isTicking = false;
    }
  };

  const interval = setInterval(() => {
    void runSafely();
  }, intervalMs);

  interval.unref?.();
  void runSafely();

  log.info({
    intervalSeconds: TICK_INTERVAL_SECONDS,
    message: "Started channel name updater scheduler",
  });

  return (): void => {
    if (isStopped) {
      return;
    }

    isStopped = true;
    clearInterval(interval);

    log.info({
      message: "Stopped channel name updater scheduler",
    });
  };
};
