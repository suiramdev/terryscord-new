import { runBackendHealthCheck } from "./backend";
import { runDatabaseHealthCheck } from "./database";

export const runStartupChecks = async (): Promise<void> => {
  await Promise.allSettled([runBackendHealthCheck(), runDatabaseHealthCheck()]);
};
