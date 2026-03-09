# Stage 1: Build the Vite client
FROM node:20-slim AS builder

WORKDIR /app

# Copy client package.json and install dependencies
COPY client/package*.json ./client/
RUN cd client && npm install

# Copy client source and build
COPY client/ ./client/
# Add this so it doesn't fail if we have memory limits during build
ENV NODE_OPTIONS=--max_old_space_size=4096
RUN cd client && npm run build

# Stage 2: Setup the production Node server with Puppeteer
FROM ghcr.io/puppeteer/puppeteer:latest

# We need to run as root to bind to port 80
USER root

# Set environment to production
ENV NODE_ENV=production
ENV PORT=80
ENV DATA_DIR=/app/data

# Environment variables for Puppeteer in docker - let the base image handle these
# (Skip overrides that might conflict with the bundled browser)

# Create data directory for SQLite persistence
RUN mkdir -p /app/data

WORKDIR /app

# Copy server package.json and install production dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy server source
COPY server/ ./server/

# Copy built client from the builder stage
COPY --from=builder /app/client/dist ./client/dist

# Expose port 80
EXPOSE 80

# Start the server
CMD ["node", "server/index.js"]
