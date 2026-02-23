# syntax=docker/dockerfile:1.7

# Use Debian-based Bun image for better native module compatibility.
FROM oven/bun:1.3.5 AS base
WORKDIR /app

# Create a minimal monorepo snapshot for the discord-bot workspace.
FROM base AS pruner
COPY . .
RUN bun x turbo@^2 prune discord-bot --docker

# Install dependencies from the pruned package manifests only.
FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile

# Build the bot (and needed workspace dependencies) with Turbo.
FROM installer AS builder
COPY --from=pruner /app/out/full/ .

# Optional remote cache credentials.
ARG TURBO_TEAM
ENV TURBO_TEAM=$TURBO_TEAM
ARG TURBO_TOKEN
ENV TURBO_TOKEN=$TURBO_TOKEN

RUN bun x turbo run build --filter=discord-bot...

# Prune dev dependencies while keeping built production artifacts.
FROM installer AS production-deps
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/apps/discord-bot/node_modules ./apps/discord-bot/node_modules
COPY --from=builder /app/apps/discord-bot/package.json ./apps/discord-bot/package.json
COPY --from=builder /app/apps/discord-bot/dist ./apps/discord-bot/dist

USER bun
WORKDIR /app/apps/discord-bot
CMD ["bun", "dist/index.mjs"]
