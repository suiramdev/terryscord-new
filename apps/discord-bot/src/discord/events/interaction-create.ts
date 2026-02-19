import type { ChatInputCommandInteraction, Interaction } from "discord.js";
import { log } from "evlog";

import type { SlashCommand } from "@/commands/types";
import { replyWithEmbed } from "@/discord/embeds";
import { t } from "@/i18n";

const replyWithExecutionError = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  await replyWithEmbed({
    interaction,
    message: t("interaction.executionError", undefined, interaction.locale),
    tone: "error",
  });
};

const replyWithUnknownCommand = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  log.warn({
    channelId: interaction.channelId,
    commandName: interaction.commandName,
    guildId: interaction.guildId,
    interactionId: interaction.id,
    message: "Unknown slash command received",
    userId: interaction.user.id,
  });

  if (interaction.deferred || interaction.replied) {
    return;
  }

  await replyWithEmbed({
    interaction,
    message: t("interaction.commandUnavailable", undefined, interaction.locale),
    tone: "info",
  });
};

const executeCommandSafely = async ({
  command,
  interaction,
}: {
  command: SlashCommand;
  interaction: ChatInputCommandInteraction;
}): Promise<void> => {
  const startedAt = Date.now();

  log.debug({
    channelId: interaction.channelId,
    commandName: interaction.commandName,
    guildId: interaction.guildId,
    interactionId: interaction.id,
    message: "Executing slash command",
    userId: interaction.user.id,
  });

  try {
    await command.execute(interaction);

    log.info({
      channelId: interaction.channelId,
      commandName: interaction.commandName,
      durationMs: Date.now() - startedAt,
      guildId: interaction.guildId,
      interactionId: interaction.id,
      message: "Slash command executed successfully",
      userId: interaction.user.id,
    });
  } catch (error: unknown) {
    log.error({
      commandName: interaction.commandName,
      durationMs: Date.now() - startedAt,
      err: error,
      interactionId: interaction.id,
      message: "Slash command execution failed",
      userId: interaction.user.id,
    });

    try {
      await replyWithExecutionError(interaction);
    } catch (replyError: unknown) {
      log.error({
        commandName: interaction.commandName,
        err: replyError,
        message: "Failed to send command error response",
      });
    }
  }
};

export const handleInteractionCreate = async (
  interaction: Interaction,
  commandRegistry: ReadonlyMap<string, SlashCommand>
): Promise<void> => {
  if (!interaction.isChatInputCommand()) {
    log.debug({
      interactionId: interaction.id,
      interactionType: interaction.type,
      message: "Ignoring non chat-input interaction",
    });
    return;
  }

  log.debug({
    commandName: interaction.commandName,
    guildId: interaction.guildId,
    interactionId: interaction.id,
    message: "Received slash command interaction",
    userId: interaction.user.id,
  });

  const command = commandRegistry.get(interaction.commandName);

  if (!command) {
    await replyWithUnknownCommand(interaction);
    return;
  }

  await executeCommandSafely({ command, interaction });
};
