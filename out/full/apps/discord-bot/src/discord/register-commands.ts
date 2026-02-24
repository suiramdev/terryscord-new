import { env } from "@terryscord/env/bot";
import { REST, Routes } from "discord.js";
import { log } from "evlog";

import type { SlashCommand } from "@/commands/types";

type CommandScope = "global" | "guild";

interface SyncScopeOptions {
  guildId?: string;
  payload: ReturnType<SlashCommand["data"]["toJSON"]>[];
  rest: REST;
  route: `/${string}`;
  scope: CommandScope;
}

const resyncCommandsForScope = async ({
  guildId,
  payload,
  rest,
  route,
  scope,
}: SyncScopeOptions): Promise<void> => {
  const startedAt = Date.now();

  log.info({
    commandCount: payload.length,
    guildId,
    message: "Starting Discord slash command re-sync",
    route,
    scope,
  });

  await rest.put(route, { body: [] });

  log.info({
    commandCount: 0,
    guildId,
    message: "Cleared Discord slash commands",
    scope,
  });

  await rest.put(route, { body: payload });

  log.info({
    commandCount: payload.length,
    durationMs: Date.now() - startedAt,
    guildId,
    message: "Re-synced Discord slash commands",
    route,
    scope,
  });
};

export const registerApplicationCommands = async (
  commands: readonly SlashCommand[]
): Promise<void> => {
  const startedAt = Date.now();
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);
  const payload = commands.map((command) => command.data.toJSON());

  log.info({
    commandCount: payload.length,
    message: "Registering Discord slash commands",
    targetGuildId: env.DISCORD_GUILD_ID ?? null,
  });

  if (env.DISCORD_GUILD_ID) {
    await resyncCommandsForScope({
      guildId: env.DISCORD_GUILD_ID,
      payload,
      rest,
      route: Routes.applicationGuildCommands(
        env.DISCORD_CLIENT_ID,
        env.DISCORD_GUILD_ID
      ),
      scope: "guild",
    });
  }

  await resyncCommandsForScope({
    payload,
    rest,
    route: Routes.applicationCommands(env.DISCORD_CLIENT_ID),
    scope: "global",
  });

  log.info({
    commandCount: payload.length,
    durationMs: Date.now() - startedAt,
    message: "Completed Discord slash command registration",
    targetGuildId: env.DISCORD_GUILD_ID ?? null,
  });
};
