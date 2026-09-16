# syntax=docker/dockerfile:1
#
# Production image (PROJECT_PLAN 13.3).
#
# Three stages so the thing that ships carries neither the toolchain nor the source:
# `deps` resolves node_modules, `builder` produces the standalone bundle, and
# `runner` copies only that bundle and runs it as a non-root user.
#
# `output: "standalone"` in next.config.ts is what makes this possible — it traces the
# imports actually reached and emits a server with them inlined, so the final image
# has no node_modules directory at all.

# --- deps --------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

RUN corepack enable

# Only the manifests, so this layer is cached until a dependency actually changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# --- builder -----------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The build needs the env schema to parse, but never the real secrets: nothing here
# reaches the database, and a value baked into an image is a value that leaks with it.
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1

RUN pnpm build

# --- runner ------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Every calendar decision in this product is Cairo's (CLAUDE.md).
ENV TZ=Africa/Cairo
ENV PORT=3000

# tzdata so TZ above means something; wget for the healthcheck.
RUN apk add --no-cache tzdata wget && \
    addgroup -g 1001 -S nodejs && \
    adduser -u 1001 -S nextjs -G nodejs

# The standalone server, plus the two directories it does not trace: the static
# assets and anything in public/ (the centre's uploaded logo lives there).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migrations are applied by a separate one-shot container before the app starts, and
# they need the drizzle files and the owner credentials the app itself never has.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

USER nextjs
EXPOSE 3000

# The route pings the database, so an unhealthy answer means "do not route here"
# rather than merely "the process is alive".
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
