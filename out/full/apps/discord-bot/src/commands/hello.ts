import { SlashCommandBuilder } from "discord.js";

import { replyWithEmbed } from "@/discord/embeds";
import { t } from "@/i18n";

import type { SlashCommand } from "./types";

export const helloCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("hello")
    .setDescription(t("commands.hello.description")),
  async execute(interaction) {
    await replyWithEmbed({
      ephemeral: false,
      interaction,
      message: t("commands.hello.onlineMessage", undefined, interaction.locale),
      tone: "info",
    });
  },
};
