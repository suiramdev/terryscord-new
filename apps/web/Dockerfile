# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.5-alpine AS base
WORKDIR /app

# Create a minimal monorepo snapshot for the web workspace.
FROM base AS pruner
COPY . .
RUN bun x turbo@^2 prune web --docker

# Install dependencies from the pruned package manifests only.
FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile

# Build the web app (and needed workspace dependencies) with Turbo.
FROM installer AS builder
COPY --from=pruner /app/out/full/ .

# Optional remote cache credentials.
ARG TURBO_TEAM
ENV TURBO_TEAM=$TURBO_TEAM
ARG TURBO_TOKEN
ENV TURBO_TOKEN=$TURBO_TOKEN

RUN bun x turbo run build --filter=web...

# Install production-only dependencies for a smaller runtime image.
FROM base AS production-deps
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/dist ./apps/web/dist

USER bun
EXPOSE 3001
WORKDIR /app/apps/web
CMD ["bun", "dist/server/server.js"]
