# Stage 1: Build the Vite client
FROM node:20-slim AS builder

RUN npm install -g pnpm

WORKDIR /app

# Workspace manifests first for layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY client/package.json ./client/
RUN pnpm install --filter client --frozen-lockfile

# Copy client source and build
COPY client/ ./client/
# Add this so it doesn't fail if we have memory limits during build
ENV NODE_OPTIONS=--max_old_space_size=4096
# Stamp the build time so the UI can display it. date runs at build time,
# giving the exact minute docker compose build was initiated.
RUN echo "VITE_BUILD_TIME=$(date +'%Y-%m-%d %H:%M')" >> /app/client/.env
RUN node -p "'VITE_APP_VERSION=' + require('./package.json').version" >> /app/client/.env
RUN pnpm -C client build

# Stage 2: Setup the production Node server with Puppeteer
FROM ghcr.io/puppeteer/puppeteer:latest

# We need to run as root to bind to port 80
USER root

RUN npm install -g pnpm

# Set environment to production
ENV NODE_ENV=production
ENV PORT=80
ENV DATA_DIR=/app/data

# Configure Puppeteer cache directory to be local to the app
ENV PUPPETEER_CACHE_DIR=/app/.puppeteer_cache

# Create data directory for SQLite persistence
RUN mkdir -p /app/data && mkdir -p /app/.puppeteer_cache

WORKDIR /app

# Workspace manifests + server production dependencies
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY server/package.json ./server/
RUN pnpm install --filter server --prod --frozen-lockfile

# Explicitly install the browser for the version of Puppeteer we are using
RUN pnpm -C server exec puppeteer browsers install chrome

# Copy server source
COPY server/ ./server/

# Copy built client from the builder stage
COPY --from=builder /app/client/dist ./client/dist

# Expose port 80
EXPOSE 80

# Start the server
CMD ["node", "server/index.js"]
