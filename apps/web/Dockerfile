# syntax=docker/dockerfile:1
# Next.js frontend. Build from the repository root: docker build -f apps/web/Dockerfile .
FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/app/package.json apps/app/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/validation/package.json packages/validation/
COPY packages/db/package.json packages/db/

FROM base AS build
# Next.js bakes the /api rewrite destination into the build.
ARG API_URL=http://api:3001
ENV API_URL=$API_URL
RUN npm ci --workspace=@vet-clinic/web --include-workspace-root=false
COPY tsconfig.json ./
COPY packages/config packages/config
COPY packages/types packages/types
COPY packages/validation packages/validation
COPY apps/web apps/web
RUN npm run build --workspace=@vet-clinic/config \
  && npm run build --workspace=@vet-clinic/types \
  && npm run build --workspace=@vet-clinic/validation \
  && npm run build --workspace=@vet-clinic/web

FROM base AS production-deps
RUN npm ci --workspace=@vet-clinic/web --include-workspace-root=false --omit=dev

FROM node:24-bookworm-slim
ARG API_URL=http://api:3001
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 API_URL=$API_URL PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /repo
# Root and per-workspace node_modules, plus every workspace manifest.
COPY --from=production-deps /repo ./
COPY --from=build /repo/packages/config/dist packages/config/dist
COPY --from=build /repo/packages/types/dist packages/types/dist
COPY --from=build /repo/packages/validation/dist packages/validation/dist
COPY --from=build /repo/apps/web/next.config.mjs apps/web/
COPY --from=build --chown=node:node /repo/apps/web/.next apps/web/.next
USER node
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["node", "/repo/node_modules/next/dist/bin/next", "start"]
