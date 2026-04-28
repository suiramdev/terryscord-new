import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Interaction,
} from "discord.js";
import { log } from "evlog";

import {
  handleRolePickButtonInteraction,
  isRolePickButtonCustomId,
} from "@/commands/role-pick-button";
import type { SlashCommand } from "@/commands/types";
import { replyWithEmbed } from "@/discord/embeds";
import { t } from "@/i18n";
import { handleGiveawayEnterInteraction } from "@/integrations/giveaway-service";

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

const executeRolePickButtonSafely = async (
  interaction: ButtonInteraction
): Promise<void> => {
  const startedAt = Date.now();

  log.debug({
    channelId: interaction.channelId,
    customId: interaction.customId,
    guildId: interaction.guildId,
    interactionId: interaction.id,
    message: "Handling role-pick button interaction",
    userId: interaction.user.id,
  });

  try {
    await handleRolePickButtonInteraction(interaction);

    log.info({
      channelId: interaction.channelId,
      customId: interaction.customId,
      durationMs: Date.now() - startedAt,
      guildId: interaction.guildId,
      interactionId: interaction.id,
      message: "Handled role-pick button interaction",
      userId: interaction.user.id,
    });
  } catch (error: unknown) {
    log.error({
      customId: interaction.customId,
      durationMs: Date.now() - startedAt,
      err: error,
      interactionId: interaction.id,
      message: "Role-pick button interaction failed",
      userId: interaction.user.id,
    });
  }
};

const executeGiveawayButtonSafely = async (
  interaction: ButtonInteraction
): Promise<void> => {
  const startedAt = Date.now();

  log.debug({
    channelId: interaction.channelId,
    customId: interaction.customId,
    guildId: interaction.guildId,
    interactionId: interaction.id,
    message: "Handling giveaway button interaction",
    userId: interaction.user.id,
  });

  try {
    await handleGiveawayEnterInteraction({ interaction });

    log.info({
      channelId: interaction.channelId,
      customId: interaction.customId,
      durationMs: Date.now() - startedAt,
      guildId: interaction.guildId,
      interactionId: interaction.id,
      message: "Handled giveaway button interaction",
      userId: interaction.user.id,
    });
  } catch (error: unknown) {
    log.error({
      customId: interaction.customId,
      durationMs: Date.now() - startedAt,
      err: error,
      interactionId: interaction.id,
      message: "Giveaway button interaction failed",
      userId: interaction.user.id,
    });
  }
};

const isGiveawayEnterButton = (customId: string): boolean =>
  customId.startsWith("giveaway:enter:");

const handleRolePickButtonIfPresent = async (
  interaction: Interaction
): Promise<boolean> => {
  if (!interaction.isButton()) {
    return false;
  }

  if (!isRolePickButtonCustomId(interaction.customId)) {
    return false;
  }

  await executeRolePickButtonSafely(interaction);
  return true;
};

const handleGiveawayButtonIfPresent = async (
  interaction: Interaction
): Promise<boolean> => {
  if (!interaction.isButton()) {
    return false;
  }

  if (!isGiveawayEnterButton(interaction.customId)) {
    return false;
  }

  await executeGiveawayButtonSafely(interaction);
  return true;
};

const logIgnoredInteraction = (interaction: Interaction): void => {
  log.debug({
    interactionId: interaction.id,
    interactionType: interaction.type,
    message: "Ignoring non chat-input interaction",
  });
};

const handleChatInputInteraction = async ({
  commandRegistry,
  interaction,
}: {
  commandRegistry: ReadonlyMap<string, SlashCommand>;
  interaction: ChatInputCommandInteraction;
}): Promise<void> => {
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

export const handleInteractionCreate = async (
  interaction: Interaction,
  commandRegistry: ReadonlyMap<string, SlashCommand>
): Promise<void> => {
  if (await handleRolePickButtonIfPresent(interaction)) {
    return;
  }

  if (await handleGiveawayButtonIfPresent(interaction)) {
    return;
  }

  if (!interaction.isChatInputCommand()) {
    logIgnoredInteraction(interaction);
    return;
  }

  await handleChatInputInteraction({ commandRegistry, interaction });
};
