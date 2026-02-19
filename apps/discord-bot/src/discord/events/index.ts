import { Events } from "discord.js";
import type { Client } from "discord.js";

import { commandRegistry } from "@/commands";
import { logger } from "@/logger";

import {
  cleanupOrphanedVerificationChannels,
  handleGuildMemberAdd,
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
  client.once(Events.ClientReady, async (readyClient) => {
    try {
      await handleReady(readyClient, onReady);
      await cleanupOrphanedVerificationChannels(readyClient);
    } catch (error: unknown) {
      logger.error({ err: error }, "Ready handler failed");
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    await handleInteractionCreate(interaction, commandRegistry);
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      await handleGuildMemberAdd(member);
    } catch (error: unknown) {
      logger.error(
        {
          err: error,
          guildId: member.guild.id,
          userId: member.id,
        },
        "Guild member add handler failed"
      );
    }
  });

  client.on(Events.Warn, (warning) => {
    logger.warn({ warning }, "Discord client warning");
  });

  client.on(Events.Error, (error) => {
    logger.error({ err: error }, "Discord client error");
  });

  client.on(Events.ShardError, (error, shardId) => {
    logger.error(
      {
        err: error,
        shardId,
      },
      "Discord shard error"
    );
  });
};
