import { MessageFlags } from "discord.js";
import type { ChatInputCommandInteraction, Interaction } from "discord.js";

import type { SlashCommand } from "@/commands/types";
import { logger } from "@/logger";

const replyWithExecutionError = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const payload = {
    content: "An unexpected error occurred while handling that command.",
    flags: MessageFlags.Ephemeral as const,
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }

  await interaction.reply(payload);
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

  await interaction.reply({
    content: "That command is not available right now.",
    flags: MessageFlags.Ephemeral as const,
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
