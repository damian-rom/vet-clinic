# syntax=docker/dockerfile:1
# NestJS API. Build from the repository root: docker build -f apps/app/Dockerfile .
FROM node:24-bookworm-slim AS base
# Toolchain for better-sqlite3 when no prebuilt binary matches the platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/app/package.json apps/app/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/validation/package.json packages/validation/
COPY packages/db/package.json packages/db/

FROM base AS build
RUN npm ci --workspace=@vet-clinic/app --include-workspace-root=false
COPY tsconfig.json ./
COPY packages packages
COPY apps/app apps/app
# Dependencies first: the API imports their compiled dist output.
RUN npm run build --workspace=@vet-clinic/config \
  && npm run build --workspace=@vet-clinic/types \
  && npm run build --workspace=@vet-clinic/validation \
  && npm run build --workspace=@vet-clinic/db \
  && npm run build --workspace=@vet-clinic/app

FROM base AS production-deps
RUN npm ci --workspace=@vet-clinic/app --include-workspace-root=false --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATABASE_PATH=/data/clinic.sqlite
WORKDIR /repo
# Root and per-workspace node_modules, plus every workspace manifest.
COPY --from=production-deps /repo ./
COPY --from=build /repo/packages/config/dist packages/config/dist
COPY --from=build /repo/packages/types/dist packages/types/dist
COPY --from=build /repo/packages/validation/dist packages/validation/dist
COPY --from=build /repo/packages/db/dist packages/db/dist
# The API refuses to start until every migration in this folder has been applied.
COPY --from=build /repo/packages/db/prisma/migrations packages/db/prisma/migrations
COPY --from=build /repo/apps/app/dist apps/app/dist
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /repo/apps/app
EXPOSE 3001
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=10 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
