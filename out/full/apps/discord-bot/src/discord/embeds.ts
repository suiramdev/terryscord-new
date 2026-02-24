import { EmbedBuilder, MessageFlags } from "discord.js";
import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from "discord.js";

export type BotEmbedTone = "debug" | "error" | "important" | "info" | "success";

const BOT_EMBED_COLORS: Record<BotEmbedTone, number> = {
  debug: 5_787_351,
  error: 15_583_145,
  important: 16_709_120,
  info: 3_447_003,
  success: 5_765_713,
};

export const createMinimalEmbed = ({
  message,
  tone,
}: {
  message: string;
  tone: BotEmbedTone;
}): EmbedBuilder =>
  new EmbedBuilder().setColor(BOT_EMBED_COLORS[tone]).setDescription(message);

const createReplyPayload = ({
  ephemeral,
  message,
  tone,
}: {
  ephemeral: boolean;
  message: string;
  tone: BotEmbedTone;
}): InteractionReplyOptions => ({
  embeds: [createMinimalEmbed({ message, tone })],
  ...(ephemeral ? { flags: MessageFlags.Ephemeral as const } : {}),
});

export const replyWithEmbed = async ({
  ephemeral = true,
  interaction,
  message,
  tone,
}: {
  ephemeral?: boolean;
  interaction: ChatInputCommandInteraction;
  message: string;
  tone: BotEmbedTone;
}): Promise<void> => {
  const payload = createReplyPayload({
    ephemeral,
    message,
    tone,
  });

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }

  await interaction.reply(payload);
};
