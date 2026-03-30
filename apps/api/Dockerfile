FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate && npm install -g tsx
WORKDIR /app

# --- Install dependencies ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/application/package.json packages/application/
COPY packages/domain/package.json packages/domain/
COPY packages/infrastructure/package.json packages/infrastructure/
COPY packages/shared/config/package.json packages/shared/config/
COPY packages/shared/i18n/package.json packages/shared/i18n/
COPY packages/shared/ui/package.json packages/shared/ui/
COPY packages/shared/utils/package.json packages/shared/utils/
COPY packages/shared/validation/package.json packages/shared/validation/
# Stub out Next.js apps so pnpm doesn't fail on missing workspace refs
COPY apps/admin/package.json apps/admin/
COPY apps/hospital/package.json apps/hospital/
RUN pnpm install --frozen-lockfile

# --- Copy source & run ---
FROM base AS runner

# Copy entire node_modules tree from deps stage
COPY --from=deps /app/ ./

# Copy all source files (overwrites package.json stubs with full source)
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["tsx", "apps/api/src/server.ts"]
