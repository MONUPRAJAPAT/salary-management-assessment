# One deployable artifact: a single process serving the API and the built UI.
#
# Three stages so the runtime image carries production dependencies and compiled output
# and nothing else — no dev dependencies, no TypeScript source, no native toolchain.

# ---------------------------------------------------------------- production deps
FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

# better-sqlite3 ships prebuilt binaries for linux/amd64 and linux/arm64, so this
# normally installs without compiling. The toolchain is here for the case where it has
# to, and it stays in this stage — only node_modules is copied forward.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && npm ci --omit=dev

# ---------------------------------------------------------------- build
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && npm ci

COPY . .
# Produces packages/web/dist, packages/server/dist/index.js and dist/seed.js.
# @acme/shared is bundled in by tsup, so the runtime never resolves the workspace.
RUN npm run build

# ---------------------------------------------------------------- runtime
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    DATABASE_PATH=/data/salary.sqlite \
    WEB_DIST_PATH=/app/packages/web/dist

COPY --from=deps  /app/node_modules                 ./node_modules
COPY --from=build /app/packages/server/dist         ./packages/server/dist
COPY --from=build /app/packages/web/dist            ./packages/web/dist

# The volume directory must exist and be owned by the runtime user *before* VOLUME is
# declared. Docker seeds a fresh named volume from the image's directory, so a /data that
# only appears at mount time is owned by root and the node user cannot create the
# database in it.
RUN mkdir -p /data && chown -R node:node /data
VOLUME /data
EXPOSE 4000
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Seed with:  docker run --rm -v <volume>:/data <image> node packages/server/dist/seed.js
CMD ["node", "packages/server/dist/index.js"]
