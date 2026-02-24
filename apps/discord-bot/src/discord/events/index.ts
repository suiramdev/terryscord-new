import { Events } from "discord.js";
import type { Client } from "discord.js";
import { log } from "evlog";

import { commandRegistry } from "@/commands";

import {
  cleanupOrphanedVerificationChannels,
  handleGuildMemberAdd,
  handleGuildMemberRemove,
  recoverPendingVerificationSessions,
} from "./guild-member-add";
import { handleInteractionCreate } from "./interaction-create";
import { handleReady } from "./ready";

interface RegisterEventHandlersOptions {
  client: Client;
  onReady?: () => Promise<void>;
}

export const registerEventHandlers = ({
  client,
  onReady,
}: RegisterEventHandlersOptions): void => {
  log.info({
    message: "Registering Discord event handlers",
    registeredCommandCount: commandRegistry.size,
  });

  client.once(Events.ClientReady, async (readyClient) => {
    const startedAt = Date.now();

    log.info({
      message: "Handling Discord ready event",
      userId: readyClient.user.id,
    });

    try {
      await handleReady(readyClient, onReady);
      await recoverPendingVerificationSessions(readyClient);
      await cleanupOrphanedVerificationChannels(readyClient);
      log.info({
        durationMs: Date.now() - startedAt,
        message: "Discord ready event completed",
      });
    } catch (error: unknown) {
      log.error({
        durationMs: Date.now() - startedAt,
        err: error,
        message: "Ready handler failed",
      });
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    await handleInteractionCreate(interaction, commandRegistry);
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    log.debug({
      guildId: member.guild.id,
      message: "Received guild member add event",
      userId: member.id,
    });

    try {
      await handleGuildMemberAdd(member);
    } catch (error: unknown) {
      log.error({
        err: error,
        guildId: member.guild.id,
        message: "Guild member add handler failed",
        userId: member.id,
      });
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    log.debug({
      guildId: member.guild.id,
      message: "Received guild member remove event",
      userId: member.id,
    });

    try {
      await handleGuildMemberRemove(member);
    } catch (error: unknown) {
      log.error({
        err: error,
        guildId: member.guild.id,
        message: "Guild member remove handler failed",
        userId: member.id,
      });
    }
  });

  client.on(Events.Warn, (warning) => {
    log.warn({
      message: "Discord client warning",
      warning,
    });
  });

  client.on(Events.Error, (error) => {
    log.error({
      err: error,
      message: "Discord client error",
    });
  });

  client.on(Events.ShardError, (error, shardId) => {
    log.error({
      err: error,
      message: "Discord shard error",
      shardId,
    });
  });
};
