# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
# Install ALL deps (including dev) for the build step regardless of NODE_ENV
RUN npm ci --include=dev

COPY . .
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Next.js build output
COPY --from=builder /app/.next          ./.next
COPY --from=builder /app/public         ./public
COPY --from=builder /app/node_modules   ./node_modules
COPY --from=builder /app/package.json   ./package.json

# Custom server + source needed at runtime (tsx compiles on-the-fly)
COPY --from=builder /app/server-docker.ts ./server-docker.ts
COPY --from=builder /app/tsconfig.json   ./tsconfig.json
COPY --from=builder /app/src             ./src

# tsx for TypeScript server execution
RUN npm install tsx --save-dev

EXPOSE 3000
CMD ["npx", "tsx", "server-docker.ts"]
