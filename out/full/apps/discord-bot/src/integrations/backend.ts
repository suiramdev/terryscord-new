import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { env } from "@terryscord/env/bot";
import { log } from "evlog";

interface BackendClient {
  healthCheck: () => Promise<unknown>;
}

const createBackendClient = (baseUrl: string): BackendClient => {
  const link = new RPCLink({
    url: `${baseUrl}/rpc`,
  });

  return createORPCClient(link) as unknown as BackendClient;
};

export const runBackendHealthCheck = async (): Promise<void> => {
  if (!env.BOT_RPC_HEALTHCHECK_ON_READY || !env.BOT_SERVER_RPC_URL) {
    log.info({
      hasRpcUrl: Boolean(env.BOT_SERVER_RPC_URL),
      message: "Skipped oRPC backend health check",
      rpcHealthCheckEnabled: env.BOT_RPC_HEALTHCHECK_ON_READY,
    });
    return;
  }

  const startedAt = Date.now();

  try {
    const client = createBackendClient(env.BOT_SERVER_RPC_URL);
    const response = await client.healthCheck();

    log.info({
      durationMs: Date.now() - startedAt,
      message: "oRPC backend health check succeeded",
      response,
      rpcUrl: env.BOT_SERVER_RPC_URL,
    });
  } catch (error: unknown) {
    log.error({
      durationMs: Date.now() - startedAt,
      err: error,
      message: "oRPC backend health check failed",
      rpcUrl: env.BOT_SERVER_RPC_URL,
    });
  }
};
