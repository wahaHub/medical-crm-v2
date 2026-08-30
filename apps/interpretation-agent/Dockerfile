# syntax=docker/dockerfile:1

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV HOME=/app

RUN apt-get update -qq \
  && apt-get install --no-install-recommends -y ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@10

FROM base AS build
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
RUN pnpm exec livekit-agents download-files

COPY src ./src
COPY tsconfig.json ./
RUN pnpm probe:vad
RUN pnpm prune --prod

FROM base AS runtime
ARG UID=10001
RUN adduser \
  --disabled-password \
  --gecos "" \
  --home /app \
  --shell /sbin/nologin \
  --uid "${UID}" \
  appuser

WORKDIR /app
COPY --from=build --chown=appuser:appuser /app /app

USER appuser
ENV NODE_ENV=production
CMD ["pnpm", "start"]
