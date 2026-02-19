import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const DEFAULT_WEB_PORT = 3001;

const parseWebPort = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_WEB_PORT;
  }

  const parsedPort = Number.parseInt(value, 10);
  if (Number.isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
    throw new Error("WEB_PORT must be an integer between 1 and 65535.");
  }

  return parsedPort;
};

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [tsconfigPaths(), tailwindcss(), tanstackStart(), viteReact()],
    server: {
      port: parseWebPort(environment.WEB_PORT),
    },
  };
});
