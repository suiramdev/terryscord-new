import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { env } from "@terryscord/env/bot";

import { logger } from "@/logger";

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
    return;
  }

  try {
    const client = createBackendClient(env.BOT_SERVER_RPC_URL);
    const response = await client.healthCheck();

    logger.info(
      {
        response,
        rpcUrl: env.BOT_SERVER_RPC_URL,
      },
      "oRPC backend health check succeeded"
    );
  } catch (error: unknown) {
    logger.error(
      {
        err: error,
        rpcUrl: env.BOT_SERVER_RPC_URL,
      },
      "oRPC backend health check failed"
    );
  }
};
