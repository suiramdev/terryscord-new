import type { ChatInputCommandInteraction, Interaction } from "discord.js";

import type { SlashCommand } from "@/commands/types";
import { replyWithEmbed } from "@/discord/embeds";
import { logger } from "@/logger";

const replyWithExecutionError = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  await replyWithEmbed({
    interaction,
    message: "An unexpected error occurred while handling that command.",
    tone: "error",
  });
};

const replyWithUnknownCommand = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  logger.warn(
    {
      commandName: interaction.commandName,
    },
    "Unknown slash command received"
  );

  if (interaction.deferred || interaction.replied) {
    return;
  }

  await replyWithEmbed({
    interaction,
    message: "That command is not available right now.",
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
  try {
    await command.execute(interaction);
  } catch (error: unknown) {
    logger.error(
      {
        commandName: interaction.commandName,
        err: error,
        userId: interaction.user.id,
      },
      "Slash command execution failed"
    );

    try {
      await replyWithExecutionError(interaction);
    } catch (replyError: unknown) {
      logger.error(
        {
          commandName: interaction.commandName,
          err: replyError,
        },
        "Failed to send command error response"
      );
    }
  }
};

export const handleInteractionCreate = async (
  interaction: Interaction,
  commandRegistry: ReadonlyMap<string, SlashCommand>
): Promise<void> => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commandRegistry.get(interaction.commandName);

  if (!command) {
    await replyWithUnknownCommand(interaction);
    return;
  }

  await executeCommandSafely({ command, interaction });
};
