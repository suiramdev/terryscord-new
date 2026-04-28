/* eslint-disable complexity, max-statements, @typescript-eslint/no-use-before-define */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
} from "discord.js";
import { log } from "evlog";

import { replyWithEmbed } from "@/discord/embeds";
import { t } from "@/i18n";

import {
  createWinnerDmEmbed,
  formatGiveawayEmbed,
  formatGiveawayEndedEmbed,
  selectWinners,
  validateEligible,
} from "./giveaway-engine";
import {
  addParticipant,
  createGiveaway,
  endGiveaway,
  getGiveawayById,
  getGiveawayByMessageId,
  isParticipant,
  listParticipants,
} from "./giveaway-persistence";
import type { GiveawayRecord } from "./giveaway-persistence";
import { createGiveawayScheduler } from "./giveaway-scheduler";
import type { GiveawayScheduler } from "./giveaway-scheduler";

const ADMINISTRATOR_PERMISSION = PermissionFlagsBits.Administrator;

const GIVEAWAY_LIMITS = {
  descriptionMaxLength: 1024,
  durationMaxSeconds: 2_592_000,
  durationMinSeconds: 10,
  prizeMaxLength: 256,
  prizeMinLength: 1,
  winnerCountMax: 50,
  winnerCountMin: 1,
} as const;

let scheduler: GiveawayScheduler | null = null;

export const initializeGiveawayService = async (
  client: Client<true>
): Promise<() => void> => {
  scheduler = createGiveawayScheduler({
    onConclude: async ({ client: c, giveawayId }) => {
      await concludeGiveaway({ client: c, giveawayId });
    },
  });

  await scheduler.loadPendingGiveaways(client);

  return (): void => {
    scheduler?.stop();
    scheduler = null;
  };
};

const getScheduler = (): GiveawayScheduler => {
  if (!scheduler) {
    throw new Error("Giveaway scheduler not initialized");
  }

  return scheduler;
};

const replyWithGiveawayError = async ({
  interaction,
  message,
}: {
  interaction: ButtonInteraction | ChatInputCommandInteraction;
  message: string;
}): Promise<void> => {
  if (interaction.isChatInputCommand()) {
    await replyWithEmbed({
      interaction,
      message,
      tone: "error",
    });

    return;
  }

  await interaction.reply({
    embeds: [
      {
        color: 15_583_145,
        description: message,
      },
    ],
    flags: MessageFlags.Ephemeral,
  });
};

const replyWithGiveawaySuccess = async ({
  interaction,
  message,
}: {
  interaction: ButtonInteraction | ChatInputCommandInteraction;
  message: string;
}): Promise<void> => {
  if (interaction.isChatInputCommand()) {
    await replyWithEmbed({
      interaction,
      message,
      tone: "success",
    });

    return;
  }

  await interaction.reply({
    embeds: [
      {
        color: 5_765_713,
        description: message,
      },
    ],
    flags: MessageFlags.Ephemeral,
  });
};

const resolveGiveaway = async (
  idOrMessageId: string
): Promise<GiveawayRecord | null> => {
  const byId = await getGiveawayById(idOrMessageId);
  if (byId) {
    return byId;
  }

  return getGiveawayByMessageId(idOrMessageId);
};

export const startGiveaway = async ({
  description,
  durationSeconds,
  interaction,
  prize,
  requiredRoleIds,
  winnerCount,
}: {
  description: string | null;
  durationSeconds: number;
  interaction: ChatInputCommandInteraction;
  prize: string;
  requiredRoleIds: string[];
  winnerCount: number;
}): Promise<void> => {
  const locale = interaction.locale ?? interaction.guildLocale ?? undefined;

  if (!interaction.inGuild() || !interaction.guildId) {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.serverOnly", undefined, locale),
      tone: "error",
    });

    return;
  }

  if (!interaction.memberPermissions?.has(ADMINISTRATOR_PERMISSION)) {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.adminRequired", undefined, locale),
      tone: "error",
    });

    return;
  }

  const { channel } = interaction;
  if (!channel || !channel.isSendable()) {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.botSendMessagesRequired", undefined, locale),
      tone: "error",
    });

    return;
  }

  if (
    prize.length < GIVEAWAY_LIMITS.prizeMinLength ||
    prize.length > GIVEAWAY_LIMITS.prizeMaxLength
  ) {
    await replyWithEmbed({
      interaction,
      message: t(
        "giveaway.errors.prizeLength",
        {
          max: String(GIVEAWAY_LIMITS.prizeMaxLength),
          min: String(GIVEAWAY_LIMITS.prizeMinLength),
        },
        locale
      ),
      tone: "error",
    });

    return;
  }

  if (
    durationSeconds < GIVEAWAY_LIMITS.durationMinSeconds ||
    durationSeconds > GIVEAWAY_LIMITS.durationMaxSeconds
  ) {
    await replyWithEmbed({
      interaction,
      message: t(
        "giveaway.errors.durationRange",
        {
          max: String(GIVEAWAY_LIMITS.durationMaxSeconds),
          min: String(GIVEAWAY_LIMITS.durationMinSeconds),
        },
        locale
      ),
      tone: "error",
    });

    return;
  }

  if (
    winnerCount < GIVEAWAY_LIMITS.winnerCountMin ||
    winnerCount > GIVEAWAY_LIMITS.winnerCountMax
  ) {
    await replyWithEmbed({
      interaction,
      message: t(
        "giveaway.errors.winnerCountRange",
        {
          max: String(GIVEAWAY_LIMITS.winnerCountMax),
          min: String(GIVEAWAY_LIMITS.winnerCountMin),
        },
        locale
      ),
      tone: "error",
    });

    return;
  }

  if (
    description &&
    description.length > GIVEAWAY_LIMITS.descriptionMaxLength
  ) {
    await replyWithEmbed({
      interaction,
      message: t(
        "giveaway.errors.descriptionLength",
        { max: String(GIVEAWAY_LIMITS.descriptionMaxLength) },
        locale
      ),
      tone: "error",
    });

    return;
  }

  const endsAt = new Date(Date.now() + durationSeconds * 1000);

  const embed = formatGiveawayEmbed({
    description,
    endsAt,
    participantCount: 0,
    prize,
    requiredRoleIds,
    winnerCount,
  });

  const enterButton = new ButtonBuilder()
    .setCustomId(`giveaway:enter:placeholder`)
    .setLabel("🎉 Participer")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(enterButton);

  let announcementMessage;

  try {
    announcementMessage = await channel.send({
      components: [row],
      embeds: [embed],
    });
  } catch (error: unknown) {
    log.error({
      channelId: channel.id,
      err: error,
      guildId: interaction.guildId,
      message: "Failed to send giveaway announcement message",
      userId: interaction.user.id,
    });

    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.sendFailed", undefined, locale),
      tone: "error",
    });

    return;
  }

  const record = await createGiveaway({
    channelId: channel.id,
    createdByUserId: interaction.user.id,
    description,
    endsAt,
    guildId: interaction.guildId,
    messageId: announcementMessage.id,
    prize,
    requiredRoleIds,
    winnerCount,
  });

  if (!record) {
    try {
      await announcementMessage.delete();
    } catch {
      // ignore cleanup failure
    }

    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.saveFailed", undefined, locale),
      tone: "error",
    });

    return;
  }

  try {
    await announcementMessage.edit({
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`giveaway:enter:${record.id}`)
            .setLabel("🎉 Participer")
            .setStyle(ButtonStyle.Primary)
        ),
      ],
      embeds: [embed],
    });
  } catch (error: unknown) {
    log.warn({
      err: error,
      giveawayId: record.id,
      message: "Failed to update giveaway message with real custom id",
    });
  }

  getScheduler().scheduleGiveawayEnd({
    client: interaction.client,
    endsAt,
    giveawayId: record.id,
  });

  const messageUrl = `https://discord.com/channels/${interaction.guildId}/${channel.id}/${announcementMessage.id}`;

  await replyWithEmbed({
    interaction,
    message: t("giveaway.success.started", { messageUrl }, locale),
    tone: "success",
  });

  log.info({
    channelId: channel.id,
    giveawayId: record.id,
    guildId: interaction.guildId,
    message: "Giveaway started",
    userId: interaction.user.id,
  });
};

export const concludeGiveaway = async ({
  client,
  giveawayId,
}: {
  client: Client<true>;
  giveawayId: string;
}): Promise<void> => {
  const giveaway = await getGiveawayById(giveawayId);
  if (!giveaway || giveaway.ended) {
    return;
  }

  const participantUserIds = await listParticipants({ giveawayId });
  const { shortfall, winners } = selectWinners({
    participantUserIds,
    winnerCount: giveaway.winnerCount,
  });

  const endedAt = new Date();
  await endGiveaway({ endedAt, id: giveawayId });

  const guild =
    client.guilds.cache.get(giveaway.guildId) ??
    (await client.guilds.fetch(giveaway.guildId).catch(() => null));

  const channel = guild
    ? await guild.channels.fetch(giveaway.channelId).catch(() => null)
    : null;

  if (channel && channel.isSendable()) {
    const endedEmbed = formatGiveawayEndedEmbed({
      description: giveaway.description,
      endedAt,
      participantCount: participantUserIds.length,
      prize: giveaway.prize,
      requiredRoleIds: giveaway.requiredRoleIds,
      winnerCount: giveaway.winnerCount,
      winners,
    });

    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway:enter:${giveaway.id}`)
        .setLabel("🎉 Terminé")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    try {
      await channel.messages.edit(giveaway.messageId, {
        components: [disabledRow],
        embeds: [endedEmbed],
      });
    } catch (error: unknown) {
      log.warn({
        channelId: channel.id,
        err: error,
        giveawayId,
        message: "Failed to edit giveaway message on conclusion",
      });
    }

    if (winners.length > 0) {
      const winnersMentions = winners.map((id) => `<@${id}>`).join(", ");

      try {
        await channel.send({
          content: t("giveaway.message.winnersAnnounced", {
            prize: giveaway.prize,
            winnersMentions,
          }),
        });
      } catch (error: unknown) {
        log.warn({
          channelId: channel.id,
          err: error,
          giveawayId,
          message: "Failed to send winners announcement message",
        });
      }

      for (const winnerId of winners) {
        try {
          const user = await client.users.fetch(winnerId);
          await user.send({
            embeds: [
              createWinnerDmEmbed({
                guildName: guild?.name ?? "Inconnu",
                prize: giveaway.prize,
              }),
            ],
          });
        } catch (error: unknown) {
          log.warn({
            err: error,
            giveawayId,
            message: "Failed to DM giveaway winner",
            userId: winnerId,
          });
        }
      }
    } else {
      try {
        await channel.send({
          content: t("giveaway.message.noWinners", { prize: giveaway.prize }),
        });
      } catch (error: unknown) {
        log.warn({
          channelId: channel.id,
          err: error,
          giveawayId,
          message: "Failed to send no-winners message",
        });
      }
    }
  }

  if (shortfall) {
    log.info({
      giveawayId,
      message: "Giveaway concluded with fewer participants than winner count",
      participantCount: participantUserIds.length,
      winnerCount: giveaway.winnerCount,
      winners: winners.length,
    });
  }

  log.info({
    giveawayId,
    message: "Giveaway concluded",
    participantCount: participantUserIds.length,
    winnerCount: winners.length,
    winners,
  });
};

export const forceEndGiveaway = async ({
  giveawayId,
  interaction,
}: {
  giveawayId: string;
  interaction: ChatInputCommandInteraction;
}): Promise<void> => {
  const locale = interaction.locale ?? interaction.guildLocale ?? undefined;

  if (!interaction.inGuild()) {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.serverOnly", undefined, locale),
      tone: "error",
    });

    return;
  }

  if (!interaction.memberPermissions?.has(ADMINISTRATOR_PERMISSION)) {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.adminRequired", undefined, locale),
      tone: "error",
    });

    return;
  }

  const giveaway = await resolveGiveaway(giveawayId);
  if (!giveaway) {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.giveawayNotFound", undefined, locale),
      tone: "error",
    });

    return;
  }

  if (giveaway.ended) {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.giveawayAlreadyEnded", undefined, locale),
      tone: "error",
    });

    return;
  }

  getScheduler().cancelGiveawayEnd(giveaway.id);
  await concludeGiveaway({
    client: interaction.client,
    giveawayId: giveaway.id,
  });

  await replyWithEmbed({
    interaction,
    message: t(
      "giveaway.success.ended",
      { winnerCount: String(giveaway.winnerCount) },
      locale
    ),
    tone: "success",
  });
};

export const rerollGiveaway = async ({
  giveawayId,
  interaction,
  newWinnerCount,
}: {
  giveawayId: string;
  interaction: ChatInputCommandInteraction;
  newWinnerCount?: number;
}): Promise<void> => {
  const locale = interaction.locale ?? interaction.guildLocale ?? undefined;

  if (!interaction.inGuild()) {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.serverOnly", undefined, locale),
      tone: "error",
    });

    return;
  }

  if (!interaction.memberPermissions?.has(ADMINISTRATOR_PERMISSION)) {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.adminRequired", undefined, locale),
      tone: "error",
    });

    return;
  }

  const giveaway = await resolveGiveaway(giveawayId);
  if (!giveaway) {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.giveawayNotFound", undefined, locale),
      tone: "error",
    });

    return;
  }

  if (!giveaway.ended) {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.giveawayNotEnded", undefined, locale),
      tone: "error",
    });

    return;
  }

  const participantUserIds = await listParticipants({
    giveawayId: giveaway.id,
  });
  if (participantUserIds.length === 0) {
    await replyWithEmbed({
      interaction,
      message: t("giveaway.errors.noParticipants", undefined, locale),
      tone: "error",
    });

    return;
  }

  const winnerCount = newWinnerCount ?? giveaway.winnerCount;

  const boundedWinnerCount = Math.max(
    1,
    Math.min(winnerCount, GIVEAWAY_LIMITS.winnerCountMax)
  );

  const { shortfall, winners } = selectWinners({
    participantUserIds,
    winnerCount: boundedWinnerCount,
  });

  const guild =
    interaction.client.guilds.cache.get(giveaway.guildId) ??
    (await interaction.client.guilds.fetch(giveaway.guildId).catch(() => null));

  const channel = guild
    ? await guild.channels.fetch(giveaway.channelId).catch(() => null)
    : null;

  if (channel && channel.isSendable()) {
    const endedEmbed = formatGiveawayEndedEmbed({
      description: giveaway.description,
      endedAt: giveaway.endedAt ?? new Date(),
      participantCount: participantUserIds.length,
      prize: giveaway.prize,
      requiredRoleIds: giveaway.requiredRoleIds,
      winnerCount: boundedWinnerCount,
      winners,
    });

    try {
      await channel.messages.edit(giveaway.messageId, {
        embeds: [endedEmbed],
      });
    } catch (error: unknown) {
      log.warn({
        channelId: channel.id,
        err: error,
        giveawayId: giveaway.id,
        message: "Failed to edit giveaway message on reroll",
      });
    }

    if (winners.length > 0) {
      const winnersMentions = winners.map((id) => `<@${id}>`).join(", ");

      try {
        await channel.send({
          content: t("giveaway.message.rerollWinnersAnnounced", {
            prize: giveaway.prize,
            winnersMentions,
          }),
        });
      } catch (error: unknown) {
        log.warn({
          channelId: channel.id,
          err: error,
          giveawayId: giveaway.id,
          message: "Failed to send reroll announcement message",
        });
      }

      for (const winnerId of winners) {
        try {
          const user = await interaction.client.users.fetch(winnerId);
          await user.send({
            embeds: [
              createWinnerDmEmbed({
                guildName: guild?.name ?? "Inconnu",
                prize: giveaway.prize,
              }),
            ],
          });
        } catch (error: unknown) {
          log.warn({
            err: error,
            giveawayId: giveaway.id,
            message: "Failed to DM reroll winner",
            userId: winnerId,
          });
        }
      }
    }
  }

  if (shortfall) {
    log.info({
      giveawayId: giveaway.id,
      message: "Giveaway rerolled with fewer participants than winner count",
      participantCount: participantUserIds.length,
      winnerCount: boundedWinnerCount,
      winners: winners.length,
    });
  }

  await replyWithEmbed({
    interaction,
    message: t(
      "giveaway.success.rerolled",
      { winnerCount: String(winners.length) },
      locale
    ),
    tone: "success",
  });

  log.info({
    giveawayId: giveaway.id,
    message: "Giveaway rerolled",
    participantCount: participantUserIds.length,
    winnerCount: winners.length,
    winners,
  });
};

export const handleGiveawayEnterInteraction = async ({
  interaction,
}: {
  interaction: ButtonInteraction;
}): Promise<void> => {
  const locale = interaction.locale ?? interaction.guildLocale ?? undefined;

  const { customId } = interaction;
  const parts = customId.split(":");
  if (parts.length !== 3 || parts[0] !== "giveaway" || parts[1] !== "enter") {
    await replyWithGiveawayError({
      interaction,
      message: t("giveaway.errors.invalidButton", undefined, locale),
    });

    return;
  }

  const giveawayId = parts.at(2);

  if (!giveawayId) {
    await replyWithGiveawayError({
      interaction,
      message: t("giveaway.errors.invalidButton", undefined, locale),
    });

    return;
  }

  const giveaway = await getGiveawayById(giveawayId);

  if (!giveaway) {
    await replyWithGiveawayError({
      interaction,
      message: t("giveaway.errors.giveawayNotFound", undefined, locale),
    });

    return;
  }

  if (giveaway.ended) {
    await replyWithGiveawayError({
      interaction,
      message: t("giveaway.errors.giveawayAlreadyEnded", undefined, locale),
    });

    return;
  }

  const alreadyEntered = await isParticipant({
    giveawayId: giveaway.id,
    userId: interaction.user.id,
  });

  if (alreadyEntered) {
    await replyWithGiveawayError({
      interaction,
      message: t("giveaway.errors.alreadyEntered", undefined, locale),
    });

    return;
  }

  if (!interaction.guild) {
    await replyWithGiveawayError({
      interaction,
      message: t("giveaway.errors.serverOnly", undefined, locale),
    });

    return;
  }

  let member;

  try {
    member = await interaction.guild.members.fetch(interaction.user.id);
  } catch {
    await replyWithGiveawayError({
      interaction,
      message: t("giveaway.errors.memberNotResolved", undefined, locale),
    });

    return;
  }

  const isEligible = validateEligible({
    member,
    requiredRoleIds: giveaway.requiredRoleIds,
  });

  if (!isEligible) {
    await replyWithGiveawayError({
      interaction,
      message: t("giveaway.errors.missingRequiredRoles", undefined, locale),
    });

    return;
  }

  const result = await addParticipant({
    giveawayId: giveaway.id,
    userId: interaction.user.id,
  });

  if (result.alreadyEntered) {
    await replyWithGiveawayError({
      interaction,
      message: t("giveaway.errors.alreadyEntered", undefined, locale),
    });

    return;
  }

  if (!result.success) {
    await replyWithGiveawayError({
      interaction,
      message: t("giveaway.errors.enterFailed", undefined, locale),
    });

    return;
  }

  const participants = await listParticipants({ giveawayId: giveaway.id });
  const participantCount = participants.length;

  const { channel } = interaction;
  if (channel && channel.isSendable()) {
    const updatedEmbed = formatGiveawayEmbed({
      description: giveaway.description,
      endsAt: giveaway.endsAt,
      participantCount,
      prize: giveaway.prize,
      requiredRoleIds: giveaway.requiredRoleIds,
      winnerCount: giveaway.winnerCount,
    });

    try {
      await channel.messages.edit(giveaway.messageId, {
        embeds: [updatedEmbed],
      });
    } catch (error: unknown) {
      log.warn({
        channelId: channel.id,
        err: error,
        giveawayId: giveaway.id,
        message: "Failed to update giveaway participant count on entry",
      });
    }
  }

  await replyWithGiveawaySuccess({
    interaction,
    message: t("giveaway.success.entered", undefined, locale),
  });

  log.debug({
    giveawayId: giveaway.id,
    message: "User entered giveaway",
    userId: interaction.user.id,
  });
};
