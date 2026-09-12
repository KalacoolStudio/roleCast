ARG NODE_IMAGE=node:26.7.0-bookworm-slim@sha256:4db36457f406501e6f608802e5da617e5fbd0e80b75901b6a09de1ae5a667d32
FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Toolchain is only used if the pinned SQLite package needs a native rebuild.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund && npm rebuild better-sqlite3 && npm run build \
    && npm prune --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps ./apps
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/scripts ./scripts
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD ["node", "scripts/status.js"]
CMD ["node", "apps/server/src/main.js"]
