# Timpi Drip Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Copy ClawPurse first (dependency)
COPY ../ClawPurse /clawpurse
WORKDIR /clawpurse
RUN npm ci && npm run build

# Build faucet
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production image
FROM node:22-alpine

# Security: Create non-root user
RUN addgroup -g 1001 faucet && adduser -u 1001 -G faucet -s /bin/false -D faucet

WORKDIR /app

# Copy built files
COPY --from=builder --chown=faucet:faucet /app/dist ./dist
COPY --from=builder --chown=faucet:faucet /app/node_modules ./node_modules
COPY --from=builder --chown=faucet:faucet /app/package.json ./
COPY --from=builder --chown=faucet:faucet /clawpurse /clawpurse

# Create data directory
RUN mkdir -p /app/data && chown faucet:faucet /app/data

# Switch to non-root user
USER faucet

# Expose ports
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start
CMD ["node", "dist/index.js"]
