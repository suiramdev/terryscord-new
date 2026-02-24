import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type {
  ButtonInteraction,
  CategoryChannel,
  ChatInputCommandInteraction,
  Guild,
  GuildBasedChannel,
  Message,
  PermissionsBitField,
} from "discord.js";
import { log } from "evlog";

import { createMinimalEmbed, replyWithEmbed } from "@/discord/embeds";
import { t } from "@/i18n";

import type { SlashCommand } from "./types";

const MANAGE_CHANNELS_PERMISSION = PermissionFlagsBits.ManageChannels;
const MANAGE_MESSAGES_PERMISSION = PermissionFlagsBits.ManageMessages;
const CONFIRM_DELETE_BUTTON_ID = "delete-category-channels:confirm";
const CANCEL_DELETE_BUTTON_ID = "delete-category-channels:cancel";
const CONFIRMATION_TIMEOUT_MS = 30_000;
const MAX_LIMIT = 1000;
const ADVANCED_SUBCOMMAND = "advanced";

type DeletionScope = "all" | "categories" | "channels" | "messages";
type DeletionMode = "all" | "limit";
type SubjectType =
  | "all"
  | "category-id"
  | "channel-id"
  | "channel-name"
  | "parent-category";

interface DeletionQuery {
  mode: DeletionMode;
  scope: DeletionScope;
  subject: string | null;
  subjectType: SubjectType;
}

interface TargetSelection {
  categories: CategoryChannel[];
  channels: GuildBasedChannel[];
}

interface DeletionPlan {
  categories: CategoryChannel[];
  channels: GuildBasedChannel[];
  messageChannels: GuildBasedChannel[];
}

interface DeletionResult {
  deletedCategories: number;
  deletedChannels: number;
  deletedMessages: number;
  failedCategories: number;
  failedChannels: number;
  failedMessageBatches: number;
}

interface CommandContext {
  guild: Guild;
  preferredLocale: string | null;
  query: DeletionQuery;
}

interface ExecutionContext extends CommandContext {
  plan: DeletionPlan;
}

const getInteractionLocale = (
  interaction: ChatInputCommandInteraction
): string | null => interaction.locale ?? interaction.guildLocale ?? null;

const toUniqueChannels = (
  channels: GuildBasedChannel[]
): GuildBasedChannel[] => {
  const uniqueById = new Map(channels.map((channel) => [channel.id, channel]));
  return [...uniqueById.values()];
};

const toUniqueCategories = (
  categories: CategoryChannel[]
): CategoryChannel[] => {
  const uniqueById = new Map(
    categories.map((category) => [category.id, category])
  );
  return [...uniqueById.values()];
};

const extractSnowflake = (value: string): string | null => {
  const match = value.match(/\d{17,20}/);
  return match ? match[0] : null;
};

const parseDeletionQuery = (
  interaction: ChatInputCommandInteraction
): DeletionQuery => ({
  mode: interaction.options.getString("mode", true) as DeletionMode,
  scope: interaction.options.getString("scope", true) as DeletionScope,
  subject: interaction.options.getString("subject"),
  subjectType: interaction.options.getString(
    "subject-type",
    true
  ) as SubjectType,
});

const shouldRequireSubject = (subjectType: SubjectType): boolean =>
  subjectType !== "all";

const combinePermissions = (...permissions: bigint[]): bigint =>
  permissions.reduce((accumulator, permission) => accumulator + permission, 0n);

const resolveRequiredPermissions = (scope: DeletionScope): bigint => {
  if (scope === "messages") {
    return MANAGE_MESSAGES_PERMISSION;
  }

  if (scope === "all") {
    return combinePermissions(
      MANAGE_CHANNELS_PERMISSION,
      MANAGE_MESSAGES_PERMISSION
    );
  }

  return MANAGE_CHANNELS_PERMISSION;
};

const hasRequiredPermissions = ({
  permissions,
  required,
}: {
  permissions: Readonly<PermissionsBitField> | null | undefined;
  required: bigint;
}): boolean => Boolean(permissions?.has(required));

const isBulkDeletableChannel = (channel: GuildBasedChannel): boolean =>
  channel.isTextBased() &&
  "bulkDelete" in channel &&
  typeof Reflect.get(channel, "bulkDelete") === "function";

const applyLimitToCollection = <T>({
  collection,
  limit,
  mode,
}: {
  collection: T[];
  limit: number | null;
  mode: DeletionMode;
}): T[] => {
  if (mode !== "limit" || !limit) {
    return collection;
  }

  return collection.slice(0, limit);
};

const replyError = async ({
  interaction,
  key,
  preferredLocale,
}: {
  interaction: ChatInputCommandInteraction;
  key:
    | "bulkDeleteCategoryChannels.errors.botMissingRequiredPermissions"
    | "bulkDeleteCategoryChannels.errors.memberMissingRequiredPermissions"
    | "bulkDeleteCategoryChannels.errors.noTargets"
    | "bulkDeleteCategoryChannels.errors.serverOnly"
    | "bulkDeleteCategoryChannels.errors.subjectNotFound"
    | "bulkDeleteCategoryChannels.errors.subjectRequired";
  preferredLocale: string | null;
}): Promise<void> => {
  await replyWithEmbed({
    interaction,
    message: t(key, undefined, preferredLocale),
    tone: "error",
  });
};

const resolveCommandContext = async (
  interaction: ChatInputCommandInteraction
): Promise<CommandContext | null> => {
  const preferredLocale = getInteractionLocale(interaction);
  const { guild } = interaction;
  if (!guild) {
    await replyError({
      interaction,
      key: "bulkDeleteCategoryChannels.errors.serverOnly",
      preferredLocale,
    });
    return null;
  }

  return {
    guild,
    preferredLocale,
    query: parseDeletionQuery(interaction),
  };
};

const ensureSubjectValidity = async ({
  interaction,
  preferredLocale,
  query,
}: {
  interaction: ChatInputCommandInteraction;
  preferredLocale: string | null;
  query: DeletionQuery;
}): Promise<boolean> => {
  if (!shouldRequireSubject(query.subjectType)) {
    return true;
  }

  if (query.subject?.trim()) {
    return true;
  }

  await replyError({
    interaction,
    key: "bulkDeleteCategoryChannels.errors.subjectRequired",
    preferredLocale,
  });
  return false;
};

const ensurePermissionContext = async ({
  context,
  interaction,
}: {
  context: CommandContext;
  interaction: ChatInputCommandInteraction;
}): Promise<boolean> => {
  const required = resolveRequiredPermissions(context.query.scope);
  if (
    !hasRequiredPermissions({
      permissions: interaction.memberPermissions,
      required,
    })
  ) {
    await replyError({
      interaction,
      key: "bulkDeleteCategoryChannels.errors.memberMissingRequiredPermissions",
      preferredLocale: context.preferredLocale,
    });
    return false;
  }

  const botMember =
    context.guild.members.me ?? (await context.guild.members.fetchMe());
  if (
    hasRequiredPermissions({ permissions: botMember.permissions, required })
  ) {
    return true;
  }

  await replyError({
    interaction,
    key: "bulkDeleteCategoryChannels.errors.botMissingRequiredPermissions",
    preferredLocale: context.preferredLocale,
  });
  return false;
};

const resolveSelectionByCategoryId = ({
  guild,
  subject,
}: {
  guild: Guild;
  subject: string;
}): TargetSelection => {
  const categoryId = extractSnowflake(subject);
  if (!categoryId) {
    return { categories: [], channels: [] };
  }

  const category = guild.channels.cache.get(categoryId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    return { categories: [], channels: [] };
  }

  const channels = [...guild.channels.cache.values()].filter(
    (channel) => channel.parentId === category.id
  );

  return {
    categories: [category],
    channels,
  };
};

const resolveSelectionByChannelId = ({
  guild,
  subject,
}: {
  guild: Guild;
  subject: string;
}): TargetSelection => {
  const channelId = extractSnowflake(subject);
  if (!channelId) {
    return { categories: [], channels: [] };
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    return { categories: [], channels: [] };
  }

  if (channel.type === ChannelType.GuildCategory) {
    return resolveSelectionByCategoryId({ guild, subject: channel.id });
  }

  return {
    categories: [],
    channels: [channel],
  };
};

const resolveSelectionByChannelName = ({
  guild,
  subject,
}: {
  guild: Guild;
  subject: string;
}): TargetSelection => {
  const normalized = subject.trim().toLowerCase();
  const matched = [...guild.channels.cache.values()].filter(
    (channel) => channel.name.toLowerCase() === normalized
  );

  const categories = matched.filter(
    (channel): channel is CategoryChannel =>
      channel.type === ChannelType.GuildCategory
  );
  const nonCategoryChannels = matched.filter(
    (channel) => channel.type !== ChannelType.GuildCategory
  );
  const categoryChildren = categories.flatMap((category) =>
    [...guild.channels.cache.values()].filter(
      (channel) => channel.parentId === category.id
    )
  );

  return {
    categories,
    channels: [...nonCategoryChannels, ...categoryChildren],
  };
};

const resolveSelectionByAll = (guild: Guild): TargetSelection => {
  const allChannels = [...guild.channels.cache.values()];
  const categories = allChannels.filter(
    (channel): channel is CategoryChannel =>
      channel.type === ChannelType.GuildCategory
  );

  return {
    categories,
    channels: allChannels.filter(
      (channel) => channel.type !== ChannelType.GuildCategory
    ),
  };
};

const resolveTargets = ({
  guild,
  query,
}: {
  guild: Guild;
  query: DeletionQuery;
}): TargetSelection => {
  if (query.subjectType === "all") {
    return resolveSelectionByAll(guild);
  }

  if (
    query.subjectType === "category-id" ||
    query.subjectType === "parent-category"
  ) {
    return resolveSelectionByCategoryId({
      guild,
      subject: query.subject ?? "",
    });
  }

  if (query.subjectType === "channel-id") {
    return resolveSelectionByChannelId({ guild, subject: query.subject ?? "" });
  }

  return resolveSelectionByChannelName({ guild, subject: query.subject ?? "" });
};

const buildDeletionPlan = ({
  query,
  selection,
}: {
  query: DeletionQuery;
  selection: TargetSelection;
}): DeletionPlan => {
  const channels = toUniqueChannels(selection.channels);
  const categories = toUniqueCategories(selection.categories);

  if (query.scope === "channels") {
    return {
      categories: [],
      channels,
      messageChannels: [],
    };
  }

  if (query.scope === "categories") {
    return {
      categories,
      channels: [],
      messageChannels: [],
    };
  }

  if (query.scope === "messages") {
    return {
      categories: [],
      channels: [],
      messageChannels: channels.filter((channel) =>
        isBulkDeletableChannel(channel)
      ),
    };
  }

  return {
    categories,
    channels,
    messageChannels: channels.filter((channel) =>
      isBulkDeletableChannel(channel)
    ),
  };
};

const applyLimitToPlan = ({
  interaction,
  plan,
  query,
}: {
  interaction: ChatInputCommandInteraction;
  plan: DeletionPlan;
  query: DeletionQuery;
}): DeletionPlan => {
  const rawLimit = interaction.options.getInteger("limit");
  const limit = query.mode === "limit" ? (rawLimit ?? 1) : null;

  return {
    categories: applyLimitToCollection({
      collection: plan.categories,
      limit,
      mode: query.mode,
    }),
    channels: applyLimitToCollection({
      collection: plan.channels,
      limit,
      mode: query.mode,
    }),
    messageChannels: applyLimitToCollection({
      collection: plan.messageChannels,
      limit,
      mode: query.mode,
    }),
  };
};

const hasDeletionTargets = (plan: DeletionPlan): boolean =>
  plan.categories.length > 0 ||
  plan.channels.length > 0 ||
  plan.messageChannels.length > 0;

const createConfirmationComponents = (): ActionRowBuilder<ButtonBuilder>[] => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CONFIRM_DELETE_BUTTON_ID)
      .setLabel("Confirmer")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(CANCEL_DELETE_BUTTON_ID)
      .setLabel("Annuler")
      .setStyle(ButtonStyle.Secondary)
  ),
];

const formatPlanSummary = ({
  mode,
  plan,
  preferredLocale,
  scope,
  subjectType,
}: {
  mode: DeletionMode;
  plan: DeletionPlan;
  preferredLocale: string | null;
  scope: DeletionScope;
  subjectType: SubjectType;
}): string =>
  t(
    "bulkDeleteCategoryChannels.messages.advancedPlanSummary",
    {
      categories: plan.categories.length,
      channels: plan.channels.length,
      messageChannels: plan.messageChannels.length,
      mode: t(
        `bulkDeleteCategoryChannels.labels.mode.${mode}` as never,
        undefined,
        preferredLocale
      ),
      scope: t(
        `bulkDeleteCategoryChannels.labels.scope.${scope}` as never,
        undefined,
        preferredLocale
      ),
      subjectType: t(
        `bulkDeleteCategoryChannels.labels.subjectType.${subjectType}` as never,
        undefined,
        preferredLocale
      ),
    },
    preferredLocale
  );

const sendConfirmationPrompt = async ({
  context,
  interaction,
}: {
  context: ExecutionContext;
  interaction: ChatInputCommandInteraction;
}): Promise<Message> => {
  await interaction.reply({
    components: createConfirmationComponents(),
    embeds: [
      createMinimalEmbed({
        message: t(
          "bulkDeleteCategoryChannels.messages.advancedConfirmationPrompt",
          {
            summary: formatPlanSummary({
              mode: context.query.mode,
              plan: context.plan,
              preferredLocale: context.preferredLocale,
              scope: context.query.scope,
              subjectType: context.query.subjectType,
            }),
          },
          context.preferredLocale
        ),
        tone: "important",
      }),
    ],
    flags: MessageFlags.Ephemeral,
    withResponse: false,
  });

  return interaction.fetchReply();
};

const awaitUserConfirmation = async ({
  interaction,
  message,
}: {
  interaction: ChatInputCommandInteraction;
  message: Message;
}): Promise<ButtonInteraction | null> => {
  try {
    return await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (componentInteraction) =>
        componentInteraction.user.id === interaction.user.id &&
        (componentInteraction.customId === CONFIRM_DELETE_BUTTON_ID ||
          componentInteraction.customId === CANCEL_DELETE_BUTTON_ID),
      time: CONFIRMATION_TIMEOUT_MS,
    });
  } catch {
    return null;
  }
};

const handleConfirmationTimeout = async ({
  interaction,
  preferredLocale,
}: {
  interaction: ChatInputCommandInteraction;
  preferredLocale: string | null;
}): Promise<void> => {
  await interaction.editReply({
    components: [],
    embeds: [
      createMinimalEmbed({
        message: t(
          "bulkDeleteCategoryChannels.messages.confirmationTimedOut",
          undefined,
          preferredLocale
        ),
        tone: "info",
      }),
    ],
  });
};

const handleConfirmationCancel = async ({
  confirmation,
  preferredLocale,
}: {
  confirmation: ButtonInteraction;
  preferredLocale: string | null;
}): Promise<void> => {
  await confirmation.update({
    components: [],
    embeds: [
      createMinimalEmbed({
        message: t(
          "bulkDeleteCategoryChannels.messages.deletionCancelled",
          undefined,
          preferredLocale
        ),
        tone: "info",
      }),
    ],
  });
};

const getBulkDeleteMethod = (
  channel: GuildBasedChannel
): ((amount: number, filterOld?: boolean) => Promise<{ size: number }>) =>
  (
    channel as unknown as {
      bulkDelete: (
        amount: number,
        filterOld?: boolean
      ) => Promise<{ size: number }>;
    }
  ).bulkDelete;

const performBatchMessageDeletion = async ({
  bulkDelete,
  limit,
}: {
  bulkDelete: (
    amount: number,
    filterOld?: boolean
  ) => Promise<{ size: number }>;
  limit: number;
}): Promise<number> => {
  let deleted = 0;
  let remaining = limit;
  let continueDeleting = true;

  while (remaining > 0 && continueDeleting) {
    const batchSize = Math.min(100, remaining);
    const batch = await bulkDelete(batchSize, true);
    deleted += batch.size;
    remaining -= batch.size;
    continueDeleting = batch.size > 0 && batch.size >= batchSize;
  }

  return deleted;
};

const deleteMessagesInChannel = async ({
  channel,
  limit,
}: {
  channel: GuildBasedChannel;
  limit: number;
}): Promise<number> => {
  if (!isBulkDeletableChannel(channel)) {
    return 0;
  }

  return await performBatchMessageDeletion({
    bulkDelete: getBulkDeleteMethod(channel),
    limit,
  });
};

const resolveMessageDeletionLimit = ({
  interaction,
  query,
}: {
  interaction: ChatInputCommandInteraction;
  query: DeletionQuery;
}): number =>
  query.mode === "limit"
    ? (interaction.options.getInteger("limit") ?? 1)
    : Number.POSITIVE_INFINITY;

const applyMessageDeletionForChannel = async ({
  channel,
  interaction,
  remaining,
  result,
}: {
  channel: GuildBasedChannel;
  interaction: ChatInputCommandInteraction;
  remaining: number;
  result: DeletionResult;
}): Promise<number> => {
  try {
    const deleted = await deleteMessagesInChannel({
      channel,
      limit: remaining,
    });
    result.deletedMessages += deleted;
    return remaining - deleted;
  } catch (error: unknown) {
    result.failedMessageBatches += 1;
    log.error({
      channelId: channel.id,
      err: error,
      message: "Failed to delete messages in advanced deletion command",
      requestedByUserId: interaction.user.id,
    });
    return remaining;
  }
};

const deleteMessagesFromPlan = async ({
  interaction,
  plan,
  query,
  result,
}: {
  interaction: ChatInputCommandInteraction;
  plan: DeletionPlan;
  query: DeletionQuery;
  result: DeletionResult;
}): Promise<void> => {
  let remaining = resolveMessageDeletionLimit({ interaction, query });

  for (const channel of plan.messageChannels) {
    if (remaining <= 0) {
      break;
    }

    remaining = await applyMessageDeletionForChannel({
      channel,
      interaction,
      remaining,
      result,
    });
  }
};

const deleteChannelsFromPlan = async ({
  interaction,
  plan,
  result,
}: {
  interaction: ChatInputCommandInteraction;
  plan: DeletionPlan;
  result: DeletionResult;
}): Promise<void> => {
  for (const channel of plan.channels) {
    try {
      await channel.delete(
        `Advanced bulk deletion requested by ${interaction.user.tag} (${interaction.user.id})`
      );
      result.deletedChannels += 1;
    } catch (error: unknown) {
      result.failedChannels += 1;
      log.error({
        channelId: channel.id,
        channelName: channel.name,
        err: error,
        message: "Failed to delete channel in advanced deletion command",
        requestedByUserId: interaction.user.id,
      });
    }
  }
};

const deleteCategoriesFromPlan = async ({
  interaction,
  plan,
  result,
}: {
  interaction: ChatInputCommandInteraction;
  plan: DeletionPlan;
  result: DeletionResult;
}): Promise<void> => {
  for (const category of plan.categories) {
    try {
      await category.delete(
        `Advanced bulk deletion requested by ${interaction.user.tag} (${interaction.user.id})`
      );
      result.deletedCategories += 1;
    } catch (error: unknown) {
      result.failedCategories += 1;
      log.error({
        categoryId: category.id,
        categoryName: category.name,
        err: error,
        message: "Failed to delete category in advanced deletion command",
        requestedByUserId: interaction.user.id,
      });
    }
  }
};

const executeDeletionPlan = async ({
  context,
  interaction,
}: {
  context: ExecutionContext;
  interaction: ChatInputCommandInteraction;
}): Promise<DeletionResult> => {
  const result: DeletionResult = {
    deletedCategories: 0,
    deletedChannels: 0,
    deletedMessages: 0,
    failedCategories: 0,
    failedChannels: 0,
    failedMessageBatches: 0,
  };

  await deleteMessagesFromPlan({
    interaction,
    plan: context.plan,
    query: context.query,
    result,
  });
  await deleteChannelsFromPlan({ interaction, plan: context.plan, result });
  await deleteCategoriesFromPlan({ interaction, plan: context.plan, result });
  return result;
};

const handleConfirmedExecution = async ({
  confirmation,
  context,
  interaction,
}: {
  confirmation: ButtonInteraction;
  context: ExecutionContext;
  interaction: ChatInputCommandInteraction;
}): Promise<void> => {
  await confirmation.update({
    components: [],
    embeds: [
      createMinimalEmbed({
        message: t(
          "bulkDeleteCategoryChannels.messages.advancedDeletionInProgress",
          undefined,
          context.preferredLocale
        ),
        tone: "important",
      }),
    ],
  });

  const result = await executeDeletionPlan({ context, interaction });
  log.warn({
    deletedCategories: result.deletedCategories,
    deletedChannels: result.deletedChannels,
    deletedMessages: result.deletedMessages,
    failedCategories: result.failedCategories,
    failedChannels: result.failedChannels,
    failedMessageBatches: result.failedMessageBatches,
    message: "Completed advanced deletion command",
    requestedByUserId: interaction.user.id,
  });

  await interaction.editReply({
    components: [],
    embeds: [
      createMinimalEmbed({
        message: t(
          "bulkDeleteCategoryChannels.messages.advancedDeletionCompleted",
          {
            deletedCategories: result.deletedCategories,
            deletedChannels: result.deletedChannels,
            deletedMessages: result.deletedMessages,
            failedCategories: result.failedCategories,
            failedChannels: result.failedChannels,
            failedMessageBatches: result.failedMessageBatches,
          },
          context.preferredLocale
        ),
        tone:
          result.failedCategories +
            result.failedChannels +
            result.failedMessageBatches >
          0
            ? "important"
            : "success",
      }),
    ],
  });
};

const processConfirmationResult = async ({
  confirmation,
  context,
  interaction,
}: {
  confirmation: ButtonInteraction | null;
  context: ExecutionContext;
  interaction: ChatInputCommandInteraction;
}): Promise<void> => {
  if (!confirmation) {
    await handleConfirmationTimeout({
      interaction,
      preferredLocale: context.preferredLocale,
    });
    return;
  }

  if (confirmation.customId === CANCEL_DELETE_BUTTON_ID) {
    await handleConfirmationCancel({
      confirmation,
      preferredLocale: context.preferredLocale,
    });
    return;
  }

  await handleConfirmedExecution({
    confirmation,
    context,
    interaction,
  });
};

const ensureExecutionPreconditions = async ({
  context,
  interaction,
}: {
  context: CommandContext;
  interaction: ChatInputCommandInteraction;
}): Promise<boolean> => {
  const hasValidSubject = await ensureSubjectValidity({
    interaction,
    preferredLocale: context.preferredLocale,
    query: context.query,
  });
  if (!hasValidSubject) {
    return false;
  }

  return await ensurePermissionContext({
    context,
    interaction,
  });
};

const resolvePlanFromContext = ({
  context,
  interaction,
}: {
  context: CommandContext;
  interaction: ChatInputCommandInteraction;
}): DeletionPlan => {
  const selection = resolveTargets({
    guild: context.guild,
    query: context.query,
  });
  const plan = buildDeletionPlan({
    query: context.query,
    selection,
  });

  return applyLimitToPlan({
    interaction,
    plan,
    query: context.query,
  });
};

const resolveNoTargetContext = async ({
  context,
  interaction,
}: {
  context: CommandContext;
  interaction: ChatInputCommandInteraction;
}): Promise<ExecutionContext | null> => {
  await replyError({
    interaction,
    key: "bulkDeleteCategoryChannels.errors.noTargets",
    preferredLocale: context.preferredLocale,
  });
  return null;
};

const resolveExecutionContextFromBase = async ({
  context,
  interaction,
}: {
  context: CommandContext;
  interaction: ChatInputCommandInteraction;
}): Promise<ExecutionContext | null> => {
  const canProceed = await ensureExecutionPreconditions({
    context,
    interaction,
  });
  if (!canProceed) {
    return null;
  }

  const plan = resolvePlanFromContext({
    context,
    interaction,
  });
  if (hasDeletionTargets(plan)) {
    return { ...context, plan };
  }

  return await resolveNoTargetContext({
    context,
    interaction,
  });
};

const resolveExecutionContext = async (
  interaction: ChatInputCommandInteraction
): Promise<ExecutionContext | null> => {
  const context = await resolveCommandContext(interaction);
  if (!context) {
    return null;
  }
  return await resolveExecutionContextFromBase({
    context,
    interaction,
  });
};

const executeAdvancedDeletion = async (
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const context = await resolveExecutionContext(interaction);
  if (!context) {
    return;
  }

  const promptMessage = await sendConfirmationPrompt({ context, interaction });
  const confirmation = await awaitUserConfirmation({
    interaction,
    message: promptMessage,
  });

  await processConfirmationResult({
    confirmation,
    context,
    interaction,
  });
};

export const deleteCategoryChannelsCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("delete")
    .setDescription(t("commands.deleteCategoryChannels.description"))
    .setDefaultMemberPermissions(
      combinePermissions(MANAGE_CHANNELS_PERMISSION, MANAGE_MESSAGES_PERMISSION)
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName(ADVANCED_SUBCOMMAND)
        .setDescription(
          t("commands.deleteCategoryChannels.sub.advanced.description")
        )
        .addStringOption((option) =>
          option
            .setName("scope")
            .setDescription(
              t("commands.deleteCategoryChannels.option.scope.description")
            )
            .addChoices(
              {
                name: t("bulkDeleteCategoryChannels.labels.scope.messages"),
                value: "messages",
              },
              {
                name: t("bulkDeleteCategoryChannels.labels.scope.channels"),
                value: "channels",
              },
              {
                name: t("bulkDeleteCategoryChannels.labels.scope.categories"),
                value: "categories",
              },
              {
                name: t("bulkDeleteCategoryChannels.labels.scope.all"),
                value: "all",
              }
            )
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("subject-type")
            .setDescription(
              t(
                "commands.deleteCategoryChannels.option.subjectType.description"
              )
            )
            .addChoices(
              {
                name: t(
                  "bulkDeleteCategoryChannels.labels.subjectType.parent-category"
                ),
                value: "parent-category",
              },
              {
                name: t(
                  "bulkDeleteCategoryChannels.labels.subjectType.category-id"
                ),
                value: "category-id",
              },
              {
                name: t(
                  "bulkDeleteCategoryChannels.labels.subjectType.channel-id"
                ),
                value: "channel-id",
              },
              {
                name: t(
                  "bulkDeleteCategoryChannels.labels.subjectType.channel-name"
                ),
                value: "channel-name",
              },
              {
                name: t("bulkDeleteCategoryChannels.labels.subjectType.all"),
                value: "all",
              }
            )
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription(
              t("commands.deleteCategoryChannels.option.mode.description")
            )
            .addChoices(
              {
                name: t("bulkDeleteCategoryChannels.labels.mode.all"),
                value: "all",
              },
              {
                name: t("bulkDeleteCategoryChannels.labels.mode.limit"),
                value: "limit",
              }
            )
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("subject")
            .setDescription(
              t("commands.deleteCategoryChannels.option.subject.description")
            )
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription(
              t("commands.deleteCategoryChannels.option.limit.description")
            )
            .setMinValue(1)
            .setMaxValue(MAX_LIMIT)
            .setRequired(false)
        )
    ),
  execute: async (interaction): Promise<void> => {
    if (interaction.options.getSubcommand() !== ADVANCED_SUBCOMMAND) {
      await replyWithEmbed({
        interaction,
        message: t("bulkDeleteCategoryChannels.errors.subjectNotFound"),
        tone: "error",
      });
      return;
    }

    await executeAdvancedDeletion(interaction);
  },
};
