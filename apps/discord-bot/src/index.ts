import { env } from "@terryscord/env/bot";
import type { Client } from "discord.js";
import { initLogger, log } from "evlog";

import { commands } from "./commands";
import { createDiscordClient } from "./discord/client";
import { registerEventHandlers } from "./discord/events";
import { registerApplicationCommands } from "./discord/register-commands";
import { runStartupChecks } from "./integrations/startup";
import { evlogConfig } from "./logging";

interface BotRuntimeState {
  bootId: number;
  client: Client | null;
  unregisterShutdownHandlers: (() => void) | null;
}

declare global {
  var __terryscordDiscordBotRuntime: BotRuntimeState | undefined;
}

const SIGNALS = ["SIGINT", "SIGTERM"] as const;

const getRuntimeState = (): BotRuntimeState => {
  globalThis.__terryscordDiscordBotRuntime ??= {
    bootId: 0,
    client: null,
    unregisterShutdownHandlers: null,
  };

  return globalThis.__terryscordDiscordBotRuntime;
};

const logStartupConfiguration = (): void => {
  const runtime = getRuntimeState();

  log.info({
    bootId: runtime.bootId + 1,
    hasExistingRuntime: Boolean(runtime.client),
    message: "Initializing Discord bot runtime",
    nodeEnv: env.NODE_ENV,
    startupChecksEnabled:
      env.BOT_DATABASE_HEALTHCHECK_ON_READY || env.BOT_RPC_HEALTHCHECK_ON_READY,
    syncCommandsOnBoot: env.DISCORD_SYNC_COMMANDS_ON_BOOT,
  });
};

const registerShutdownHandlers = ({
  onShutdown,
}: {
  onShutdown: (signal: NodeJS.Signals) => void;
}): (() => void) => {
  const listeners = SIGNALS.map((signal) => {
    const listener = (): void => {
      onShutdown(signal);
    };
    process.once(signal, listener);
    return { listener, signal };
  });

  return (): void => {
    for (const { listener, signal } of listeners) {
      process.removeListener(signal, listener);
    }
  };
};

const runReadyTasks = async (): Promise<void> => {
  if (env.DISCORD_SYNC_COMMANDS_ON_BOOT) {
    await registerApplicationCommands(commands);
  }

  await runStartupChecks();
};

const createShutdownHandler = (
  client: ReturnType<typeof createDiscordClient>
): ((signal: NodeJS.Signals) => void) => {
  let isShuttingDown = false;

  return (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    log.info({
      message: "Shutting down Discord bot",
      signal,
    });

    const runtime = getRuntimeState();
    runtime.unregisterShutdownHandlers?.();
    runtime.unregisterShutdownHandlers = null;
    runtime.client = null;

    client.destroy();
    process.exit(0);
  };
};

const destroyPreviousRuntime = (): void => {
  const runtime = getRuntimeState();

  runtime.unregisterShutdownHandlers?.();
  runtime.unregisterShutdownHandlers = null;

  if (runtime.client) {
    log.info({
      message: "Destroying previous Discord client before hot restart",
    });
    runtime.client.destroy();
    runtime.client = null;
  }
};

const createConfiguredClient = (): {
  client: ReturnType<typeof createDiscordClient>;
  unregisterShutdownHandlers: () => void;
} => {
  const client = createDiscordClient();

  registerEventHandlers({
    client,
    onReady: runReadyTasks,
  });

  const shutdown = createShutdownHandler(client);
  const unregisterShutdownHandlers = registerShutdownHandlers({
    onShutdown: (signal) => {
      shutdown(signal);
    },
  });

  return {
    client,
    unregisterShutdownHandlers,
  };
};

const loginClient = async ({
  client,
  startedAt,
}: {
  client: ReturnType<typeof createDiscordClient>;
  startedAt: number;
}): Promise<void> => {
  log.info({
    guildScopeCommandSyncEnabled: Boolean(env.DISCORD_GUILD_ID),
    message: "Starting Discord bot",
  });

  log.debug({
    clientId: env.DISCORD_CLIENT_ID,
    message: "Logging into Discord gateway",
  });

  await client.login(env.DISCORD_BOT_TOKEN);

  log.info({
    durationMs: Date.now() - startedAt,
    message: "Discord bot login completed",
  });
};

const startBot = async (): Promise<void> => {
  initLogger(evlogConfig);
  const startedAt = Date.now();
  destroyPreviousRuntime();
  logStartupConfiguration();

  const runtime = getRuntimeState();
  runtime.bootId += 1;

  const { client, unregisterShutdownHandlers } = createConfiguredClient();
  runtime.client = client;
  runtime.unregisterShutdownHandlers = unregisterShutdownHandlers;

  await loginClient({ client, startedAt });
};

try {
  await startBot();
} catch (error: unknown) {
  log.error({
    err: error,
    message: "Failed to start Discord bot",
    severity: "fatal",
  });
  process.exit(1);
}
