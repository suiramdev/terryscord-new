/* eslint-disable max-statements, complexity */

import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  Client,
  GuildChannel,
} from "discord.js";

import { replyWithEmbed } from "@/discord/embeds";
import { t } from "@/i18n";
import {
  applyChannelNameUpdate,
  createChannelNameUpdater,
  deleteChannelNameUpdater,
  getAllVariableKeys,
  getChannelNameUpdater,
  listGuildChannelNameUpdaters,
  listVariableFetchers,
  updateChannelNameUpdater,
} from "@/integrations/channel-name-updater";

import type { SlashCommand } from "./types";

const ADMINISTRATOR_PERMISSION = PermissionFlagsBits.Administrator;
const CREATE_SUBCOMMAND = "create";
const DELETE_SUBCOMMAND = "delete";
const LIST_SUBCOMMAND = "list";
const SET_GROUP = "set";
const SET_ENABLED = "enabled";
const SET_INTERVAL = "interval";
const SET_TEMPLATE = "template";
const SHOW_SUBCOMMAND = "show";
const VARIABLES_SUBCOMMAND = "variables";

const MIN_INTERVAL_MINUTES = 10;
const MAX_INTERVAL_MINUTES = 1440;

const runUpdaterInBackground = async (
  client: Client<true>,
  updater: Awaited<ReturnType<typeof updateChannelNameUpdater>>
): Promise<void> => {
  if (!updater) {
    return;
  }

  try {
    await applyChannelNameUpdate({ client, updater });
  } catch {
    // errors are already logged by applyChannelNameUpdate
  }
};

const extractPlaceholders = (template: string): string[] => {
  const matches = template.matchAll(/\{([a-zA-Z0-9_]+)\}/g);
  return [
    ...new Set(
      [...matches]
        .map((match) => match[1])
        .filter((value): value is string => typeof value === "string")
    ),
  ];
};

const validateTemplatePlaceholders = (template: string): string | null => {
  const placeholders = extractPlaceholders(template);
  const validKeys = getAllVariableKeys();

  if (placeholders.length === 0) {
    return t("channelUpdater.errors.missingPlaceholder");
  }

  const unknown = placeholders.filter((key) => !validKeys.includes(key));

  if (unknown.length > 0) {
    return t("channelUpdater.errors.unknownPlaceholders", {
      keys: unknown.map((k) => `{${k}}`).join(", "),
    });
  }

  return null;
};

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

const resolveChannelUpdaterOrReply = async ({
  channelId,
  interaction,
}: {
  channelId: string;
  interaction: ChatInputCommandInteraction;
}): Promise<
  | { errorMessage: string; updater: null }
  | {
      errorMessage: null;
      updater: Awaited<ReturnType<typeof getChannelNameUpdater>>;
    }
> => {
  const updater = await getChannelNameUpdater(channelId);

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
  const intervalMinutes =
    interaction.options.getInteger("interval") ?? MIN_INTERVAL_MINUTES;

  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildVoice
  ) {
    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.invalidChannelType"),
      tone: "error",
    });

    return;
  }

  const placeholderError = validateTemplatePlaceholders(template);

  if (placeholderError) {
    await replyWithEmbed({
      interaction,
      message: placeholderError,
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

  const existing = await getChannelNameUpdater(channel.id);

  try {
    let updater: Awaited<ReturnType<typeof updateChannelNameUpdater>> = null;

    if (existing) {
      updater = await updateChannelNameUpdater({
        channelId: channel.id,
        patch: {
          enabled: true,
          nameTemplate: template,
          updateIntervalMinutes: intervalMinutes,
        },
      });

      await replyWithEmbed({
        interaction,
        message: t(
          "channelUpdater.success.updated",
          { channelId: channel.id },
          locale
        ),
        tone: "success",
      });
    } else {
      updater = await createChannelNameUpdater({
        channelId: channel.id,
        enabled: true,
        guildId,
        nameTemplate: template,
        updateIntervalMinutes: intervalMinutes,
      });

      await replyWithEmbed({
        interaction,
        message: t(
          "channelUpdater.success.created",
          { channelId: channel.id },
          locale
        ),
        tone: "success",
      });
    }

    if (updater) {
      runUpdaterInBackground(interaction.client, updater);
    }
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

  const channel = interaction.options.getChannel("channel", true);

  const { errorMessage: resolveError } = await resolveChannelUpdaterOrReply({
    channelId: channel.id,
    interaction,
  });

  if (resolveError) {
    await replyWithEmbed({
      interaction,
      message: resolveError,
      tone: "error",
    });

    return;
  }

  const deleted = await deleteChannelNameUpdater(channel.id);

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
    message: t(
      "channelUpdater.success.deleted",
      { channelId: channel.id },
      locale
    ),
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

  const lines = updaters.map((updater) => {
    const status = updater.enabled ? t("common.enabled") : t("common.disabled");

    return [
      `**<#${updater.channelId}>** — ${status}`,
      `  ${t("channelUpdater.show.template")}: \`${updater.nameTemplate}\``,
      `  ${t("channelUpdater.show.interval")}: ${updater.updateIntervalMinutes}min`,
    ].join("\n");
  });

  await replyWithEmbed({
    interaction,
    message: lines.join("\n\n"),
    tone: "info",
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

  const channel = interaction.options.getChannel("channel", true);
  const enabled = interaction.options.getBoolean("enabled", true);

  const { errorMessage: resolveError } = await resolveChannelUpdaterOrReply({
    channelId: channel.id,
    interaction,
  });

  if (resolveError) {
    await replyWithEmbed({
      interaction,
      message: resolveError,
      tone: "error",
    });

    return;
  }

  const updated = await updateChannelNameUpdater({
    channelId: channel.id,
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

  if (enabled) {
    runUpdaterInBackground(interaction.client, updated);
  }

  await replyWithEmbed({
    interaction,
    message: t(
      enabled
        ? "channelUpdater.success.enabled"
        : "channelUpdater.success.disabled",
      { channelId: channel.id },
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

  const channel = interaction.options.getChannel("channel", true);
  const intervalMinutes = interaction.options.getInteger("interval", true);

  const { errorMessage: resolveError } = await resolveChannelUpdaterOrReply({
    channelId: channel.id,
    interaction,
  });

  if (resolveError) {
    await replyWithEmbed({
      interaction,
      message: resolveError,
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
    channelId: channel.id,
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

  const channel = interaction.options.getChannel("channel", true);
  const template = interaction.options.getString("template", true).trim();

  const { errorMessage: resolveError } = await resolveChannelUpdaterOrReply({
    channelId: channel.id,
    interaction,
  });

  if (resolveError) {
    await replyWithEmbed({
      interaction,
      message: resolveError,
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

  const placeholderError = validateTemplatePlaceholders(template);

  if (placeholderError) {
    await replyWithEmbed({
      interaction,
      message: placeholderError,
      tone: "error",
    });

    return;
  }

  const updated = await updateChannelNameUpdater({
    channelId: channel.id,
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

  runUpdaterInBackground(interaction.client, updated);

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

  const channel = interaction.options.getChannel("channel", true);
  const { errorMessage: resolveError, updater } =
    await resolveChannelUpdaterOrReply({
      channelId: channel.id,
      interaction,
    });

  if (resolveError || !updater) {
    await replyWithEmbed({
      interaction,
      message: resolveError ?? t("channelUpdater.errors.updaterNotFound"),
      tone: "error",
    });

    return;
  }

  const lines = [
    `**${t("channelUpdater.show.channel")}**: <#${updater.channelId}>`,
    `${t("channelUpdater.show.enabled")}: ${updater.enabled ? t("common.enabled") : t("common.disabled")}`,
    `${t("channelUpdater.show.template")}: \`${updater.nameTemplate}\``,
    `${t("channelUpdater.show.interval")}: ${updater.updateIntervalMinutes}min`,
    `${t("channelUpdater.show.lastUpdated")}: ${updater.lastUpdatedAt ? updater.lastUpdatedAt.toLocaleString("fr-FR") : t("common.notConfigured")}`,
  ];

  await replyWithEmbed({
    interaction,
    message: lines.join("\n"),
    tone: "info",
  });
};

const handleVariables = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const fetchers = listVariableFetchers();

  const lines = fetchers.map(
    (fetcher) => `**{${fetcher.key}}** — ${fetcher.description}`
  );

  await replyWithEmbed({
    interaction,
    message: lines.join("\n") || t("channelUpdater.info.noVariables"),
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
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
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
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription(
              t("commands.channelUpdater.option.channel.description")
            )
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
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
            .setName(SET_ENABLED)
            .setDescription(
              t("commands.channelUpdater.sub.setEnabled.description")
            )
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription(
                  t("commands.channelUpdater.option.channel.description")
                )
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
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
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription(
                  t("commands.channelUpdater.option.channel.description")
                )
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
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
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription(
                  t("commands.channelUpdater.option.channel.description")
                )
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
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
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription(
              t("commands.channelUpdater.option.channel.description")
            )
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName(VARIABLES_SUBCOMMAND)
        .setDescription(t("commands.channelUpdater.sub.variables.description"))
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

    if (subcommand === VARIABLES_SUBCOMMAND) {
      await handleVariables(interaction);
      return;
    }

    await replyWithEmbed({
      interaction,
      message: t("channelUpdater.errors.unsupportedSubcommand"),
      tone: "error",
    });
  },
};
