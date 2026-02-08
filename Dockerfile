# Timpi Drip Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (ClawPurse comes from npm)
RUN npm ci

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Copy static files
RUN cp -r public dist/ || true

# Production image
FROM node:22-alpine

# Security: Create non-root user
RUN addgroup -g 1001 faucet && adduser -u 1001 -G faucet -s /bin/false -D faucet

WORKDIR /app

# Copy built files
COPY --from=builder --chown=faucet:faucet /app/dist ./dist
COPY --from=builder --chown=faucet:faucet /app/node_modules ./node_modules
COPY --from=builder --chown=faucet:faucet /app/package.json ./
COPY --from=builder --chown=faucet:faucet /app/public ./public

# Create data directory
RUN mkdir -p /app/data && chown faucet:faucet /app/data

# Switch to non-root user
USER faucet

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/faucet.db

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start
CMD ["node", "dist/index.js"]
