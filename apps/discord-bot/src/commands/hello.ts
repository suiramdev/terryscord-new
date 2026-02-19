import { SlashCommandBuilder } from "discord.js";

import { replyWithEmbed } from "@/discord/embeds";

import type { SlashCommand } from "./types";

export const helloCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("hello")
    .setDescription("Send a hello message from Terryscord"),
  async execute(interaction) {
    await replyWithEmbed({
      ephemeral: false,
      interaction,
      message: "Hello from Terryscord. The bot is online.",
      tone: "info",
    });
  },
};
