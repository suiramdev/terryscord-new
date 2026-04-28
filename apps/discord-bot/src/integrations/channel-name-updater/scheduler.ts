/* eslint-disable max-statements, no-void */

import { PermissionFlagsBits } from "discord.js";
import type { Client, GuildChannel } from "discord.js";
import { log } from "evlog";

import { getValueProvider } from "./providers";
import {
  listEnabledChannelNameUpdaters,
  updateChannelNameUpdater,
} from "./settings";
import type { ChannelNameUpdater } from "./settings";

const MANAGE_CHANNELS_PERMISSION = PermissionFlagsBits.ManageChannels;
const TICK_INTERVAL_SECONDS = 60;

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

const shouldRunUpdater = (updater: ChannelNameUpdater): boolean => {
  if (!updater.lastUpdatedAt) {
    return true;
  }

  const elapsedMs = Date.now() - updater.lastUpdatedAt.getTime();
  const intervalMs = updater.updateIntervalMinutes * 60_000;

  return elapsedMs >= intervalMs;
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

  const provider = getValueProvider(updater.sourceType);
  if (!provider) {
    log.warn({
      message: "Unknown channel name updater source type",
      sourceType: updater.sourceType,
      updaterId: updater.id,
    });

    return false;
  }

  const values = await provider.fetchValues(
    updater.guildId,
    updater.sourceConfig ?? undefined
  );

  if (values === null) {
    log.debug({
      message: "Channel name updater source returned no values",
      sourceType: updater.sourceType,
      updaterId: updater.id,
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
      updaterId: updater.id,
    });

    return false;
  }

  if (!hasManageChannelPermission(channel)) {
    log.warn({
      channelId: channel.id,
      guildId: updater.guildId,
      message: "Bot lacks Manage Channels permission for channel name updater",
      updaterId: updater.id,
    });

    return false;
  }

  const newName = buildChannelName(updater.nameTemplate, values);

  if (channel.name === newName) {
    await updateChannelNameUpdater({
      id: updater.id,
      patch: { lastUpdatedAt: new Date() },
    });

    return true;
  }

  try {
    await channel.setName(newName, "Mise à jour automatique du nom de salon");

    await updateChannelNameUpdater({
      id: updater.id,
      patch: { lastUpdatedAt: new Date() },
    });

    log.info({
      channelId: channel.id,
      guildId: updater.guildId,
      message: "Updated channel name via updater",
      newName,
      updaterId: updater.id,
    });

    return true;
  } catch (error: unknown) {
    log.error({
      channelId: channel.id,
      err: error,
      message: "Failed to update channel name",
      updaterId: updater.id,
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
