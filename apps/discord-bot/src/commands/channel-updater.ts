/* eslint-disable max-statements, complexity */

import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { ChatInputCommandInteraction, GuildChannel } from "discord.js";

import { replyWithEmbed } from "@/discord/embeds";
import { t } from "@/i18n";
import {
  createChannelNameUpdater,
  deleteChannelNameUpdater,
  getChannelNameUpdater,
  listGuildChannelNameUpdaters,
  listValueProviders,
  updateChannelNameUpdater,
} from "@/integrations/channel-name-updater";

import type { SlashCommand } from "./types";

const ADMINISTRATOR_PERMISSION = PermissionFlagsBits.Administrator;
const CREATE_SUBCOMMAND = "create";
const DELETE_SUBCOMMAND = "delete";
const LIST_SUBCOMMAND = "list";
const SET_GROUP = "set";
const SET_CHANNEL = "channel";
const SET_ENABLED = "enabled";
const SET_INTERVAL = "interval";
const SET_TEMPLATE = "template";
const SHOW_SUBCOMMAND = "show";
const SOURCES_SUBCOMMAND = "sources";

const MIN_INTERVAL_MINUTES = 10;
const MAX_INTERVAL_MINUTES = 1440;

const requireAdminAndGuild = (
  interaction: ChatInputCommandInteraction
):
  | { errorMessage: string; guildId: null }
  | { errorMessage: null; guildId: string } => {
  if (!interaction.inGuild() || !interaction.guildId) {
    return {
      errorMessage: t("channelUpdater.errors.serverOnly"),
      guildId: null,
    };
  }

  if (!interaction.memberPermissions?.has(ADMINISTRATOR_PERMISSION)) {
    return {
      errorMessage: t("channelUpdater.errors.adminRequired"),
      guildId: null,
    };
  }

  return { errorMessage: null, guildId: interaction.guildId };
};

const resolveUpdaterOrReply = async ({
  interaction,
  updaterId,
}: {
  interaction: ChatInputCommandInteraction;
  updaterId: string;
}): Promise<
  | { errorMessage: string; updater: null }
  | {
      errorMessage: null;
      updater: Awaited<ReturnType<typeof getChannelNameUpdater>>;
    }
> => {
  const updater = await getChannelNameUpdater(updaterId);

  if (!updater) {
    return {
      errorMessage: t("channelUpdater.errors.updaterNotFound"),
      updater: null,
    };
  }

  const { guildId } = interaction;
  if (guildId && updater.guildId !== guildId) {
    return {
      errorMessage: t("channelUpdater.errors.updaterNotInGuild"),
      updater: null,
    };
  }

  return { errorMessage: null, updater };
};

const handleCreate = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const locale = interaction.locale ?? interaction.guildLocale ?? undefined;
  const { errorMessage, guildId } = requireAdminAndGuild(interaction);

  if (errorMessage || !guildId) {
    await replyWithEmbed({
      interaction,
      message: errorMessage ?? t("channelUpdater.errors.serverOnly"),
      tone: "error",
    });

    return;
  }

  const channel = interaction.options.getChannel("channel", true);
  const template = interaction.options.getString("template", true).trim();
  const sourceType = interaction.options.getString("source", true);
  const intervalMinutes =
    interaction.options.getInteger("interval") ?? MIN_INTERVAL_MINUTES;

  if (channel.type !== ChannelType.GuildText) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.invalidChannelType"),
      tone: "error",
    });

    return;
  }

  const providers = listValueProviders();
  if (!providers.some((p) => p.type === sourceType)) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.unknownSourceType"),
      tone: "error",
    });

    return;
  }

  if (
    intervalMinutes < MIN_INTERVAL_MINUTES ||
    intervalMinutes > MAX_INTERVAL_MINUTES
  ) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.intervalRange", {
        max: MAX_INTERVAL_MINUTES,
        min: MIN_INTERVAL_MINUTES,
      }),
      tone: "error",
    });

    return;
  }

  const guildChannel = channel as GuildChannel;
  const botMember = guildChannel.guild.members.me;

  if (!botMember) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.botMemberUnavailable"),
      tone: "error",
    });

    return;
  }

  const permissions = guildChannel.permissionsFor(botMember);
  if (!permissions?.has(PermissionFlagsBits.ManageChannels)) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.botManageChannelsRequired"),
      tone: "error",
    });

    return;
  }

  try {
    const updater = await createChannelNameUpdater({
      channelId: channel.id,
      enabled: true,
      guildId,
      nameTemplate: template,
      sourceType,
      updateIntervalMinutes: intervalMinutes,
    });

    await replyWithEmbed({
      interaction,
      message: t(
        "channelUpdater.success.created",
        { updaterId: updater.id },
        locale
      ),
      tone: "success",
    });
  } catch {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.saveFailed"),
      tone: "error",
    });
  }
};

const handleDelete = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const locale = interaction.locale ?? interaction.guildLocale ?? undefined;
  const { errorMessage, guildId } = requireAdminAndGuild(interaction);

  if (errorMessage || !guildId) {
    await replyWithEmbed({
      interaction,
      message: errorMessage ?? t("channelUpdater.errors.serverOnly"),
      tone: "error",
    });

    return;
  }

  const updaterId = interaction.options.getString("id", true).trim();
  const { errorMessage: resolveError, updater } = await resolveUpdaterOrReply({
    interaction,
    updaterId,
  });

  if (resolveError || !updater) {
    await replyWithEmbed({
      interaction,
      message: resolveError ?? t("channelUpdater.errors.updaterNotFound"),
      tone: "error",
    });

    return;
  }

  const deleted = await deleteChannelNameUpdater(updaterId);

  if (!deleted) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.deleteFailed"),
      tone: "error",
    });

    return;
  }

  await replyWithEmbed({
    interaction,
    message: t("channelUpdater.success.deleted", { updaterId }, locale),
    tone: "success",
  });
};

const handleList = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const { errorMessage, guildId } = requireAdminAndGuild(interaction);

  if (errorMessage || !guildId) {
    await replyWithEmbed({
      interaction,
      message: errorMessage ?? t("channelUpdater.errors.serverOnly"),
      tone: "error",
    });

    return;
  }

  const updaters = await listGuildChannelNameUpdaters(guildId);

  if (updaters.length === 0) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.info.noUpdaters"),
      tone: "info",
    });

    return;
  }

  const providers = listValueProviders();
  const providerMap = new Map(providers.map((p) => [p.type, p.description]));

  const lines = updaters.map((updater) => {
    const status = updater.enabled ? t("common.enabled") : t("common.disabled");
    const sourceLabel =
      providerMap.get(updater.sourceType) ?? updater.sourceType;

    return [
      `**\`${updater.id}\`** — ${status}`,
      `  ${t("channelUpdater.show.channel")}: <#${updater.channelId}>`,
      `  ${t("channelUpdater.show.template")}: \`${updater.nameTemplate}\``,
      `  ${t("channelUpdater.show.source")}: ${sourceLabel}`,
      `  ${t("channelUpdater.show.interval")}: ${updater.updateIntervalMinutes}min`,
    ].join("\n");
  });

  await replyWithEmbed({
    interaction,
    message: lines.join("\n\n"),
    tone: "info",
  });
};

const handleSetChannel = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const locale = interaction.locale ?? interaction.guildLocale ?? undefined;
  const { errorMessage, guildId } = requireAdminAndGuild(interaction);

  if (errorMessage || !guildId) {
    await replyWithEmbed({
      interaction,
      message: errorMessage ?? t("channelUpdater.errors.serverOnly"),
      tone: "error",
    });

    return;
  }

  const updaterId = interaction.options.getString("id", true).trim();
  const channel = interaction.options.getChannel("channel", true);

  const { errorMessage: resolveError, updater } = await resolveUpdaterOrReply({
    interaction,
    updaterId,
  });

  if (resolveError || !updater) {
    await replyWithEmbed({
      interaction,
      message: resolveError ?? t("channelUpdater.errors.updaterNotFound"),
      tone: "error",
    });

    return;
  }

  if (channel.type !== ChannelType.GuildText) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.invalidChannelType"),
      tone: "error",
    });

    return;
  }

  const updated = await updateChannelNameUpdater({
    id: updaterId,
    patch: { channelId: channel.id },
  });

  if (!updated) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.saveFailed"),
      tone: "error",
    });

    return;
  }

  await replyWithEmbed({
    interaction,
    message: t(
      "channelUpdater.success.channelSet",
      { channelId: channel.id },
      locale
    ),
    tone: "success",
  });
};

const handleSetEnabled = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const locale = interaction.locale ?? interaction.guildLocale ?? undefined;
  const { errorMessage, guildId } = requireAdminAndGuild(interaction);

  if (errorMessage || !guildId) {
    await replyWithEmbed({
      interaction,
      message: errorMessage ?? t("channelUpdater.errors.serverOnly"),
      tone: "error",
    });

    return;
  }

  const updaterId = interaction.options.getString("id", true).trim();
  const enabled = interaction.options.getBoolean("enabled", true);

  const { errorMessage: resolveError, updater } = await resolveUpdaterOrReply({
    interaction,
    updaterId,
  });

  if (resolveError || !updater) {
    await replyWithEmbed({
      interaction,
      message: resolveError ?? t("channelUpdater.errors.updaterNotFound"),
      tone: "error",
    });

    return;
  }

  const updated = await updateChannelNameUpdater({
    id: updaterId,
    patch: { enabled },
  });

  if (!updated) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.saveFailed"),
      tone: "error",
    });

    return;
  }

  await replyWithEmbed({
    interaction,
    message: t(
      enabled
        ? "channelUpdater.success.enabled"
        : "channelUpdater.success.disabled",
      { updaterId },
      locale
    ),
    tone: "success",
  });
};

const handleSetInterval = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const locale = interaction.locale ?? interaction.guildLocale ?? undefined;
  const { errorMessage, guildId } = requireAdminAndGuild(interaction);

  if (errorMessage || !guildId) {
    await replyWithEmbed({
      interaction,
      message: errorMessage ?? t("channelUpdater.errors.serverOnly"),
      tone: "error",
    });

    return;
  }

  const updaterId = interaction.options.getString("id", true).trim();
  const intervalMinutes = interaction.options.getInteger("interval", true);

  const { errorMessage: resolveError, updater } = await resolveUpdaterOrReply({
    interaction,
    updaterId,
  });

  if (resolveError || !updater) {
    await replyWithEmbed({
      interaction,
      message: resolveError ?? t("channelUpdater.errors.updaterNotFound"),
      tone: "error",
    });

    return;
  }

  if (
    intervalMinutes < MIN_INTERVAL_MINUTES ||
    intervalMinutes > MAX_INTERVAL_MINUTES
  ) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.intervalRange", {
        max: MAX_INTERVAL_MINUTES,
        min: MIN_INTERVAL_MINUTES,
      }),
      tone: "error",
    });

    return;
  }

  const updated = await updateChannelNameUpdater({
    id: updaterId,
    patch: { updateIntervalMinutes: intervalMinutes },
  });

  if (!updated) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.saveFailed"),
      tone: "error",
    });

    return;
  }

  await replyWithEmbed({
    interaction,
    message: t(
      "channelUpdater.success.intervalSet",
      { interval: intervalMinutes },
      locale
    ),
    tone: "success",
  });
};

const handleSetTemplate = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const locale = interaction.locale ?? interaction.guildLocale ?? undefined;
  const { errorMessage, guildId } = requireAdminAndGuild(interaction);

  if (errorMessage || !guildId) {
    await replyWithEmbed({
      interaction,
      message: errorMessage ?? t("channelUpdater.errors.serverOnly"),
      tone: "error",
    });

    return;
  }

  const updaterId = interaction.options.getString("id", true).trim();
  const template = interaction.options.getString("template", true).trim();

  const { errorMessage: resolveError, updater } = await resolveUpdaterOrReply({
    interaction,
    updaterId,
  });

  if (resolveError || !updater) {
    await replyWithEmbed({
      interaction,
      message: resolveError ?? t("channelUpdater.errors.updaterNotFound"),
      tone: "error",
    });

    return;
  }

  if (template.length === 0 || template.length > 100) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.templateLength"),
      tone: "error",
    });

    return;
  }

  const updated = await updateChannelNameUpdater({
    id: updaterId,
    patch: { nameTemplate: template },
  });

  if (!updated) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.saveFailed"),
      tone: "error",
    });

    return;
  }

  await replyWithEmbed({
    interaction,
    message: t("channelUpdater.success.templateSet", { template }, locale),
    tone: "success",
  });
};

const handleShow = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const { errorMessage, guildId } = requireAdminAndGuild(interaction);

  if (errorMessage || !guildId) {
    await replyWithEmbed({
      interaction,
      message: errorMessage ?? t("channelUpdater.errors.serverOnly"),
      tone: "error",
    });

    return;
  }

  const updaterId = interaction.options.getString("id", true).trim();
  const { errorMessage: resolveError, updater } = await resolveUpdaterOrReply({
    interaction,
    updaterId,
  });

  if (resolveError || !updater) {
    await replyWithEmbed({
      interaction,
      message: resolveError ?? t("channelUpdater.errors.updaterNotFound"),
      tone: "error",
    });

    return;
  }

  const providers = listValueProviders();
  const provider = providers.find((p) => p.type === updater.sourceType);

  const lines = [
    `**ID**: \`${updater.id}\``,
    `${t("channelUpdater.show.enabled")}: ${updater.enabled ? t("common.enabled") : t("common.disabled")}`,
    `${t("channelUpdater.show.channel")}: <#${updater.channelId}>`,
    `${t("channelUpdater.show.template")}: \`${updater.nameTemplate}\``,
    `${t("channelUpdater.show.source")}: ${provider?.description ?? updater.sourceType}`,
    `${t("channelUpdater.show.interval")}: ${updater.updateIntervalMinutes}min`,
    `${t("channelUpdater.show.lastUpdated")}: ${updater.lastUpdatedAt ? updater.lastUpdatedAt.toLocaleString("fr-FR") : t("common.notConfigured")}`,
  ];

  await replyWithEmbed({
    interaction,
    message: lines.join("\n"),
    tone: "info",
  });
};

const handleSources = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const providers = listValueProviders();

  const lines = providers.map((provider) => {
    const placeholders = t("channelUpdater.info.sourcePlaceholders", {
      placeholders: Object.keys(provider.fetchValues)
        .map(() => "{count}")
        .join(", "),
    });

    return `**${provider.type}** — ${provider.description}\n  ${placeholders}`;
  });

  await replyWithEmbed({
    interaction,
    message: lines.join("\n\n") || t("channelUpdater.info.noSources"),
    tone: "info",
  });
};

export const channelUpdaterCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("channel-updater")
    .setDescription(t("commands.channelUpdater.description"))
    .setDMPermission(false)
    .setDefaultMemberPermissions(ADMINISTRATOR_PERMISSION)
    .addSubcommand((sub) =>
      sub
        .setName(CREATE_SUBCOMMAND)
        .setDescription(t("commands.channelUpdater.sub.create.description"))
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription(
              t("commands.channelUpdater.option.channel.description")
            )
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
        .addStringOption((option) =>
          option
            .setName("template")
            .setDescription(
              t("commands.channelUpdater.option.template.description")
            )
            .setRequired(true)
            .setMaxLength(100)
        )
        .addStringOption((option) =>
          option
            .setName("source")
            .setDescription(
              t("commands.channelUpdater.option.source.description")
            )
            .setRequired(true)
            .addChoices(
              { name: "Steam Players (s&box)", value: "steam_players" },
              { name: "Active Giveaways", value: "active_giveaways" }
            )
        )
        .addIntegerOption((option) =>
          option
            .setName("interval")
            .setDescription(
              t("commands.channelUpdater.option.interval.description")
            )
            .setRequired(false)
            .setMinValue(MIN_INTERVAL_MINUTES)
            .setMaxValue(MAX_INTERVAL_MINUTES)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName(DELETE_SUBCOMMAND)
        .setDescription(t("commands.channelUpdater.sub.delete.description"))
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription(t("commands.channelUpdater.option.id.description"))
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName(LIST_SUBCOMMAND)
        .setDescription(t("commands.channelUpdater.sub.list.description"))
    )
    .addSubcommandGroup((group) =>
      group
        .setName(SET_GROUP)
        .setDescription(t("commands.channelUpdater.groupSet.description"))
        .addSubcommand((sub) =>
          sub
            .setName(SET_CHANNEL)
            .setDescription(
              t("commands.channelUpdater.sub.setChannel.description")
            )
            .addStringOption((option) =>
              option
                .setName("id")
                .setDescription(
                  t("commands.channelUpdater.option.id.description")
                )
                .setRequired(true)
            )
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription(
                  t("commands.channelUpdater.option.channel.description")
                )
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName(SET_ENABLED)
            .setDescription(
              t("commands.channelUpdater.sub.setEnabled.description")
            )
            .addStringOption((option) =>
              option
                .setName("id")
                .setDescription(
                  t("commands.channelUpdater.option.id.description")
                )
                .setRequired(true)
            )
            .addBooleanOption((option) =>
              option
                .setName("enabled")
                .setDescription(
                  t("commands.channelUpdater.option.enabled.description")
                )
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName(SET_INTERVAL)
            .setDescription(
              t("commands.channelUpdater.sub.setInterval.description")
            )
            .addStringOption((option) =>
              option
                .setName("id")
                .setDescription(
                  t("commands.channelUpdater.option.id.description")
                )
                .setRequired(true)
            )
            .addIntegerOption((option) =>
              option
                .setName("interval")
                .setDescription(
                  t("commands.channelUpdater.option.interval.description")
                )
                .setRequired(true)
                .setMinValue(MIN_INTERVAL_MINUTES)
                .setMaxValue(MAX_INTERVAL_MINUTES)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName(SET_TEMPLATE)
            .setDescription(
              t("commands.channelUpdater.sub.setTemplate.description")
            )
            .addStringOption((option) =>
              option
                .setName("id")
                .setDescription(
                  t("commands.channelUpdater.option.id.description")
                )
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName("template")
                .setDescription(
                  t("commands.channelUpdater.option.template.description")
                )
                .setRequired(true)
                .setMaxLength(100)
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName(SHOW_SUBCOMMAND)
        .setDescription(t("commands.channelUpdater.sub.show.description"))
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription(t("commands.channelUpdater.option.id.description"))
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName(SOURCES_SUBCOMMAND)
        .setDescription(t("commands.channelUpdater.sub.sources.description"))
    ),
  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === CREATE_SUBCOMMAND) {
      await handleCreate(interaction);
      return;
    }

    if (subcommand === DELETE_SUBCOMMAND) {
      await handleDelete(interaction);
      return;
    }

    if (subcommand === LIST_SUBCOMMAND) {
      await handleList(interaction);
      return;
    }

    if (group === SET_GROUP) {
      if (subcommand === SET_CHANNEL) {
        await handleSetChannel(interaction);
        return;
      }

      if (subcommand === SET_ENABLED) {
        await handleSetEnabled(interaction);
        return;
      }

      if (subcommand === SET_INTERVAL) {
        await handleSetInterval(interaction);
        return;
      }

      if (subcommand === SET_TEMPLATE) {
        await handleSetTemplate(interaction);
        return;
      }
    }

    if (subcommand === SHOW_SUBCOMMAND) {
      await handleShow(interaction);
      return;
    }

    if (subcommand === SOURCES_SUBCOMMAND) {
      await handleSources(interaction);
      return;
    }

    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.unsupportedSubcommand"),
      tone: "error",
    });
  },
};
