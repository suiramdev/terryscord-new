import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

import { replyWithEmbed } from "@/discord/embeds";
import { t } from "@/i18n";
import {
  forceEndGiveaway,
  rerollGiveaway,
  startGiveaway,
} from "@/integrations/giveaway-service";

import type { SlashCommand } from "./types";

const ADMINISTRATOR_PERMISSION = PermissionFlagsBits.Administrator;
const START_SUBCOMMAND = "start";
const END_SUBCOMMAND = "end";
const REROLL_SUBCOMMAND = "reroll";

const handleStart = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const prize = interaction.options.getString("prize", true).trim();
  const durationSeconds = interaction.options.getInteger("duration", true);
  const winnerCount = interaction.options.getInteger("winners") ?? 1;
  const requiredRole = interaction.options.getRole("required-role");
  const description = interaction.options.getString("description");

  await startGiveaway({
    description,
    durationSeconds,
    interaction,
    prize,
    requiredRoleIds: requiredRole ? [requiredRole.id] : [],
    winnerCount,
  });
};

const handleEnd = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const giveawayId = interaction.options.getString("giveaway-id", true).trim();

  await forceEndGiveaway({ giveawayId, interaction });
};

const handleReroll = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const giveawayId = interaction.options.getString("giveaway-id", true).trim();
  const newWinnerCount = interaction.options.getInteger("winners") ?? undefined;

  await rerollGiveaway({ giveawayId, interaction, newWinnerCount });
};

export const giveawayCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription(t("commands.giveaway.description"))
    .setDMPermission(false)
    .setDefaultMemberPermissions(ADMINISTRATOR_PERMISSION)
    .addSubcommand((sub) =>
      sub
        .setName(START_SUBCOMMAND)
        .setDescription(t("commands.giveaway.sub.start.description"))
        .addStringOption((option) =>
          option
            .setName("prize")
            .setDescription(t("commands.giveaway.option.prize.description"))
            .setRequired(true)
            .setMaxLength(256)
        )
        .addIntegerOption((option) =>
          option
            .setName("duration")
            .setDescription(t("commands.giveaway.option.duration.description"))
            .setRequired(true)
            .setMinValue(10)
            .setMaxValue(2_592_000)
        )
        .addIntegerOption((option) =>
          option
            .setName("winners")
            .setDescription(t("commands.giveaway.option.winners.description"))
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
        )
        .addRoleOption((option) =>
          option
            .setName("required-role")
            .setDescription(
              t("commands.giveaway.option.requiredRole.description")
            )
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription(
              t("commands.giveaway.option.description.description")
            )
            .setRequired(false)
            .setMaxLength(1024)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName(END_SUBCOMMAND)
        .setDescription(t("commands.giveaway.sub.end.description"))
        .addStringOption((option) =>
          option
            .setName("giveaway-id")
            .setDescription(
              t("commands.giveaway.option.giveawayId.description")
            )
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName(REROLL_SUBCOMMAND)
        .setDescription(t("commands.giveaway.sub.reroll.description"))
        .addStringOption((option) =>
          option
            .setName("giveaway-id")
            .setDescription(
              t("commands.giveaway.option.giveawayId.description")
            )
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("winners")
            .setDescription(t("commands.giveaway.option.winners.description"))
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
        )
    ),
  execute: async (interaction): Promise<void> => {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case START_SUBCOMMAND: {
        await handleStart(interaction);
        return;
      }

      case END_SUBCOMMAND: {
        await handleEnd(interaction);
        return;
      }

      case REROLL_SUBCOMMAND: {
        await handleReroll(interaction);
        return;
      }

      default: {
        await replyWithEmbed({
          interaction,
          message: t("giveaway.errors.unsupportedSubcommand"),
          tone: "error",
        });
      }
    }
  },
};
