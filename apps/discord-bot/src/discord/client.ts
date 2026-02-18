import { Client, GatewayIntentBits } from "discord.js";

export const createDiscordClient = () =>
  new Client({
    allowedMentions: {
      repliedUser: false,
    },
    intents: [GatewayIntentBits.Guilds],
  });
