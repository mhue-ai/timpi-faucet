# Timpi Drip Dockerfile
# Self-contained faucet with wallet initialization

FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies (git, python, make, g++ for native modules)
RUN apk add --no-cache git python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Production image
FROM node:22-alpine

# Install bc + openssl for balance checks and TLS generation
RUN apk add --no-cache bc openssl

# Security: Create non-root user
RUN addgroup -g 1001 faucet && adduser -u 1001 -G faucet -s /bin/sh -D faucet

WORKDIR /app

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public

# Copy entrypoint script
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create data directory with proper permissions
RUN mkdir -p /app/data && chown -R faucet:faucet /app

# Switch to non-root user
USER faucet

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/faucet.db
ENV KEYSTORE_PATH=/app/data/keystore.enc

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Entrypoint handles wallet init
ENTRYPOINT ["/entrypoint.sh"]
