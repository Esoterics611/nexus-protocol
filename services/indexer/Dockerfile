# ── Stage 1: build ──────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install deps (including devDependencies for the NestJS CLI + tsc)
COPY package*.json ./
RUN npm ci

# Copy source and compile
COPY nest-cli.json tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: production image ───────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Production deps only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output
COPY --from=builder /app/dist ./dist

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/main"]
