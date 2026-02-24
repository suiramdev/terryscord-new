import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

type ImportMetaEnv = Record<string, string | undefined>;

export const env = createEnv({
  client: {
    VITE_SERVER_URL: z.url(),
  },
  clientPrefix: "VITE_",
  emptyStringAsUndefined: true,
  runtimeEnv: (import.meta as { env?: ImportMetaEnv }).env ?? {},
});
