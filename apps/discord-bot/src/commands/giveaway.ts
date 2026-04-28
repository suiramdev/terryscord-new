/* eslint-disable max-statements */

import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

import { replyWithEmbed } from "@/discord/embeds";
import { t } from "@/i18n";
import {
  forceEndGiveaway,
  rerollGiveaway,
  startGiveaway,
} from "@/integrations/giveaway-service";
import {
  addGuildGiveawayPingRole,
  getGuildGiveawaySettings,
  removeGuildGiveawayPingRole,
} from "@/integrations/giveaway-settings";

import type { SlashCommand } from "./types";

const ADMINISTRATOR_PERMISSION = PermissionFlagsBits.Administrator;
const START_SUBCOMMAND = "start";
const END_SUBCOMMAND = "end";
const REROLL_SUBCOMMAND = "reroll";
const PING_ROLE_GROUP = "ping-role";
const PING_ROLE_ADD_SUBCOMMAND = "add";
const PING_ROLE_REMOVE_SUBCOMMAND = "remove";
const PING_ROLE_SHOW_SUBCOMMAND = "show";

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

const requireAdminAndGuild = (
  interaction: ChatInputCommandInteraction
):
  | { errorMessage: string; guildId: null }
  | { errorMessage: null; guildId: string } => {
  if (!interaction.inGuild() || !interaction.guildId) {
    return { errorMessage: t("giveaway.errors.serverOnly"), guildId: null };
  }

  if (!interaction.memberPermissions?.has(ADMINISTRATOR_PERMISSION)) {
    return { errorMessage: t("giveaway.errors.adminRequired"), guildId: null };
  }

  return { errorMessage: null, guildId: interaction.guildId };
};

const handlePingRoleAdd = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const locale = interaction.locale ?? interaction.guildLocale ?? undefined;
  const { errorMessage, guildId } = requireAdminAndGuild(interaction);

  if (errorMessage || !guildId) {
    await replyWithEmbed({
      interaction,
      message: errorMessage ?? t("giveaway.errors.serverOnly"),
      tone: "error",
    });

    return;
  }

  const role = interaction.options.getRole("role", true);

  try {
    const added = await addGuildGiveawayPingRole({ guildId, roleId: role.id });

    if (!added) {
      await replyWithEmbed({
        interaction,
        message: t("giveaway.errors.pingRoleAlreadyAdded", undefined, locale),
        tone: "error",
      });

      return;
    }
  } catch {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.saveFailed", undefined, locale),
      tone: "error",
    });

    return;
  }

  await replyWithEmbed({
    interaction,
    message: t("giveaway.success.pingRoleAdded", { roleId: role.id }, locale),
    tone: "success",
  });
};

const handlePingRoleRemove = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const locale = interaction.locale ?? interaction.guildLocale ?? undefined;
  const { errorMessage, guildId } = requireAdminAndGuild(interaction);

  if (errorMessage || !guildId) {
    await replyWithEmbed({
      interaction,
      message: errorMessage ?? t("giveaway.errors.serverOnly"),
      tone: "error",
    });

    return;
  }

  const role = interaction.options.getRole("role", true);

  try {
    const removed = await removeGuildGiveawayPingRole({
      guildId,
      roleId: role.id,
    });

    if (!removed) {
      await replyWithEmbed({
        interaction,
        message: t("giveaway.errors.pingRoleNotFound", undefined, locale),
        tone: "error",
      });

      return;
    }
  } catch {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.saveFailed", undefined, locale),
      tone: "error",
    });

    return;
  }

  await replyWithEmbed({
    interaction,
    message: t("giveaway.success.pingRoleRemoved", { roleId: role.id }, locale),
    tone: "success",
  });
};

const handlePingRoleShow = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const locale = interaction.locale ?? interaction.guildLocale ?? undefined;
  const { errorMessage, guildId } = requireAdminAndGuild(interaction);

  if (errorMessage || !guildId) {
    await replyWithEmbed({
      interaction,
      message: errorMessage ?? t("giveaway.errors.serverOnly"),
      tone: "error",
    });

    return;
  }

  const settings = await getGuildGiveawaySettings(guildId);

  if (settings.pingRoleIds.length === 0) {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.info.noPingRoles", undefined, locale),
      tone: "info",
    });

    return;
  }

  const roleMentions = settings.pingRoleIds.map((id) => `<@&${id}>`).join(", ");

  await replyWithEmbed({
    interaction,
    message: t("giveaway.info.pingRolesList", { roleMentions }, locale),
    tone: "info",
  });
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
    )
    .addSubcommandGroup((group) =>
      group
        .setName(PING_ROLE_GROUP)
        .setDescription(t("commands.giveaway.group.pingRole.description"))
        .addSubcommand((sub) =>
          sub
            .setName(PING_ROLE_ADD_SUBCOMMAND)
            .setDescription(t("commands.giveaway.sub.pingRoleAdd.description"))
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription(
                  t("commands.giveaway.option.pingRole.description")
                )
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName(PING_ROLE_REMOVE_SUBCOMMAND)
            .setDescription(
              t("commands.giveaway.sub.pingRoleRemove.description")
            )
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription(
                  t("commands.giveaway.option.pingRole.description")
                )
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName(PING_ROLE_SHOW_SUBCOMMAND)
            .setDescription(t("commands.giveaway.sub.pingRoleShow.description"))
        )
    ),
  execute: async (interaction): Promise<void> => {
    const subcommandGroup = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();

    if (subcommandGroup === PING_ROLE_GROUP) {
      switch (subcommand) {
        case PING_ROLE_ADD_SUBCOMMAND: {
          await handlePingRoleAdd(interaction);
          return;
        }

        case PING_ROLE_REMOVE_SUBCOMMAND: {
          await handlePingRoleRemove(interaction);
          return;
        }

        case PING_ROLE_SHOW_SUBCOMMAND: {
          await handlePingRoleShow(interaction);
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

      return;
    }

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
