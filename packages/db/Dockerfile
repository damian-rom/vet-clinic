# syntax=docker/dockerfile:1
# One-shot job: applies the Prisma migrations to the shared SQLite volume, then exits.
# Build from the repository root: docker build -f packages/db/Dockerfile .
FROM node:24-bookworm-slim
# The Prisma schema engine needs OpenSSL to detect its platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/app/package.json apps/app/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/validation/package.json packages/validation/
COPY packages/db/package.json packages/db/
# Only the db workspace's dependencies, including the Prisma CLI. better-sqlite3 is not
# needed to migrate, so its native build is skipped.
RUN npm ci --workspace=@vet-clinic/db --include-workspace-root=false --ignore-scripts \
  && npm rebuild prisma @prisma/engines
COPY packages/db/prisma.config.ts packages/db/
COPY packages/db/prisma packages/db/prisma
RUN mkdir -p /data && chown node:node /data
USER node
ENV DATABASE_URL=file:/data/clinic.sqlite
WORKDIR /repo/packages/db
CMD ["node", "/repo/node_modules/prisma/build/index.js", "migrate", "deploy"]
