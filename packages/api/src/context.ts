import { auth } from "@terryscord/auth";
import type { Context as ElysiaContext } from "elysia";

export interface CreateContextOptions {
  context: ElysiaContext;
}

export const createContext = async ({
  context,
}: CreateContextOptions): Promise<{
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
}> => {
  const session = await auth.api.getSession({
    headers: context.request.headers,
  });

  return {
    session,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;
