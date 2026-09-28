# Deployment

The application is **one process**: in production the Node server serves the API and the
built React bundle from the same origin, so there is no CORS configuration, no second
service, and no reverse proxy to get right.

## The only two things it needs

1. **Node 20.11+**
2. **A writable, persistent path for the SQLite file.** This is the part that is easy to get
   wrong on a platform with an ephemeral filesystem: without a mounted disk the database is
   silently recreated empty on every redeploy.

| Variable        | Default              |                                                  |
| --------------- | -------------------- | ------------------------------------------------ |
| `PORT`          | `4000`               |                                                  |
| `DATABASE_PATH` | `data/salary.sqlite` | must be on a persistent volume                   |
| `WEB_DIST_PATH` | `../web/dist`        | the built UI; ignored if the path does not exist |
| `NODE_ENV`      | `development`        |                                                  |

`GET /api/health` is the health-check endpoint.

## Directly on a host

```bash
npm ci
npm run build
npm run seed          # first deploy only; omit to keep existing data
NODE_ENV=production npm start
```

`npm run seed` refuses to overwrite a database that already has employees in it. Re-seeding
needs `npm run seed -- --force`, which discards every salary record — deliberately not
something that can happen by accident.

## Docker

```bash
docker compose up --build          # http://localhost:4000
docker compose run --rm app node packages/server/dist/seed.js   # first run only
```

Or without compose:

```bash
docker build -t acme-salary .
docker volume create acme-salary-data
docker run --rm -v acme-salary-data:/data acme-salary node packages/server/dist/seed.js
docker run -p 4000:4000 -v acme-salary-data:/data acme-salary
```

The image is built in three stages, so the runtime layer carries production
dependencies and compiled output only — no dev dependencies, no TypeScript source, no
compiler. The seed is compiled to `dist/seed.js` by the same build, which is why it runs
under plain `node` rather than needing `tsx` at runtime.

Two details that are easy to get wrong and are handled here:

- **`/data` is created and chowned to `node` in the image, before `VOLUME` is declared.**
  Docker seeds a fresh named volume from the image's directory; a `/data` that only
  appears at mount time is owned by root, and the unprivileged runtime user cannot create
  the database in it.
- **The volume is not optional.** Without it SQLite writes into the container's writable
  layer and every salary record is discarded when the container is replaced.

Built and run. On Docker 29.8 / arm64 the image is **391 MB** and the container reports
healthy in a few seconds; the seed writes 10,000 employees into the volume as the
unprivileged `node` user, and the data survives `docker compose restart`.

Three defects were found and fixed in the course of getting there, two by reading it and
one only by building it:

- The seed needed `tsx`, which the runtime image does not install. It is now compiled to
  `dist/seed.js` by the same build and runs under plain `node`.
- `/data` was unwritable under `USER node`, because `VOLUME` was declared for a directory
  that did not exist in the image.
- **`npm ci --omit=dev` at the workspace root installed the entire front end** — 143 MB of
  icon components and 35 MB of Mantine, into an image whose only job is to serve those
  same components as pre-built static files. Scoping the install to the server workspace
  took `node_modules` from 250 MB to 29 MB and the image from 637 MB to 391 MB.

## Render

`render.yaml` in the repository root is a complete blueprint, including the **1 GB
persistent disk mounted at `/var/data`** that SQLite needs. After the first deploy, seed
once from the Render shell:

```bash
DATABASE_PATH=/var/data/salary.sqlite npm run seed
```

## Anywhere else

Any platform that runs a Node process and can attach a disk works the same way: build, point
`DATABASE_PATH` at the mount, start. Fly.io, Railway and a plain VM with systemd all fit
without changes.

## When SQLite stops being the right answer

SQLite serialises writes. One HR Manager will never notice; a second concurrent writer
eventually will. Every SQL statement lives in `packages/server/src/repositories/`, so moving
to Postgres is a Kysely dialect change plus a review of about six window-function queries —
not an application rewrite. See ADR-0002.
