# Stage 1: Build the Vite client
# pnpm 11 requires Node >= 22.13 (node:sqlite builtin)
FROM node:22-slim AS builder

RUN npm install -g pnpm@11.5.3

WORKDIR /app

# Workspace manifests first for layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY client/package.json ./client/
RUN pnpm install --filter client --frozen-lockfile

# Copy client source (+ cross-workspace shared modules it imports) and build
COPY client/ ./client/
COPY shared/ ./shared/
# Add this so it doesn't fail if we have memory limits during build
ENV NODE_OPTIONS=--max_old_space_size=4096
# Stamp build metadata for the UI badge. BUILD_TIME arrives as a build arg
# (see package.json "build") so it is evaluated per build, not per cache layer —
# a server-only rebuild previously reused this layer and shipped a stale "Built:"
# date. The ARG sits after the COPYs so only the stamp + vite compile re-run on a
# cache-warm build; deps stay cached. Single overwrite (>) keeps the file
# deterministic — no duplicate entries can accumulate.
ARG BUILD_TIME
RUN printf 'VITE_BUILD_TIME=%s\nVITE_APP_VERSION=%s\n' "$BUILD_TIME" "$(node -p "require('./package.json').version")" > /app/client/.env
RUN pnpm -C client build

# Stage 2: Setup the production Node server with Puppeteer
# Pin to the project's puppeteer version (server/package.json) so the Chrome the
# base image ships matches what the app launches. `:latest` floats and drifted a
# newer Chrome across devboxes, breaking `puppeteer browsers install chrome`.
FROM ghcr.io/puppeteer/puppeteer:25.1.0

# We need to run as root to bind to port 80
USER root

RUN npm install -g pnpm@11.5.3

# Set environment to production
ENV NODE_ENV=production
ENV PORT=80
ENV DATA_DIR=/app/data

# Use the Chrome the base image already ships. Because the base image tag is
# pinned to the project's puppeteer version, its bundled browser is exactly the
# build puppeteer looks for — so we point at that cache instead of re-downloading.
ENV PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer

# Create data directory for SQLite persistence
RUN mkdir -p /app/data

WORKDIR /app

# Workspace manifests + server production dependencies
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY server/package.json ./server/
RUN pnpm install --filter server --prod --frozen-lockfile

# Copy server source (+ cross-workspace shared modules it imports)
COPY server/ ./server/
COPY shared/ ./shared/

# Copy built client from the builder stage
COPY --from=builder /app/client/dist ./client/dist

# Expose port 80
EXPOSE 80

# Start the server
CMD ["node", "server/index.js"]
