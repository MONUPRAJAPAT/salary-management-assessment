# Single deployable artifact: one process serving the API and the built UI.
#
# Stage 1 installs every dependency and builds both packages. Stage 2 keeps only the
# runtime dependencies and the build output, so the native toolchain that better-sqlite3
# may need to compile never reaches the running image.

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Package manifests first, so a source-only change does not reinstall the world.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

# python3/make/g++ are only needed if better-sqlite3 has no prebuilt binary for this
# platform. They stay in this stage and are never shipped.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm ci

COPY . .
RUN npm run build


FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm ci --omit=dev \
 && apt-get purge -y python3 make g++ && apt-get autoremove -y

# tsx and the shared TypeScript source are needed at runtime only by the seed script.
COPY packages/shared/src packages/shared/src
COPY packages/server/src/seed packages/server/src/seed
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/web/dist packages/web/dist

ENV PORT=4000 \
    DATABASE_PATH=/data/salary.sqlite \
    WEB_DIST_PATH=/app/packages/web/dist
VOLUME /data
EXPOSE 4000

USER node
CMD ["node", "packages/server/dist/index.js"]
