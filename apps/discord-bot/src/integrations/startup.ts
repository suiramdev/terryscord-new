import { env } from "@terryscord/env/bot";
import { log } from "evlog";

import { runBackendHealthCheck } from "./backend";
import { runDatabaseHealthCheck } from "./database";

export const runStartupChecks = async (): Promise<void> => {
  const startedAt = Date.now();

  log.info({
    databaseHealthCheckEnabled: env.BOT_DATABASE_HEALTHCHECK_ON_READY,
    message: "Starting startup health checks",
    rpcHealthCheckEnabled: env.BOT_RPC_HEALTHCHECK_ON_READY,
  });

  const checkTasks = [
    {
      name: "backend",
      run: runBackendHealthCheck,
    },
    {
      name: "database",
      run: runDatabaseHealthCheck,
    },
  ] as const;

  const results = await Promise.allSettled(
    checkTasks.map(async (checkTask) => {
      const checkStartedAt = Date.now();
      await checkTask.run();
      return {
        durationMs: Date.now() - checkStartedAt,
        name: checkTask.name,
      };
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      log.info({
        checkName: result.value.name,
        durationMs: result.value.durationMs,
        message: "Startup health check completed",
      });
      continue;
    }

    log.error({
      err: result.reason,
      message: "Startup health check failed with uncaught error",
    });
  }

  log.info({
    durationMs: Date.now() - startedAt,
    message: "Startup health checks completed",
  });
};
