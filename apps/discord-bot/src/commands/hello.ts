import { EmbedBuilder, SlashCommandBuilder } from "discord.js";

import type { SlashCommand } from "./types";

export const helloCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("hello")
    .setDescription("Send a hello message from Terryscord"),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(5_793_266)
      .setTitle("Hello from Terryscord")
      .setDescription(
        "The bot is online with a scalable command architecture ready for expansion."
      )
      .addFields(
        {
          inline: true,
          name: "Requested by",
          value: `<@${interaction.user.id}>`,
        },
        {
          inline: true,
          name: "Server",
          value: interaction.guild?.name ?? "Direct Message",
        }
      )
      .setFooter({
        text: "Bun + discord.js + Turborepo",
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
