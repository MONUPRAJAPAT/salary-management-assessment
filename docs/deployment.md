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
docker build -t acme-salary .
docker volume create acme-salary-data
docker run -p 4000:4000 -v acme-salary-data:/data acme-salary
```

To seed the volume once:

```bash
docker run --rm -v acme-salary-data:/data \
  -e DATABASE_PATH=/data/salary.sqlite acme-salary \
  npx tsx packages/server/src/seed/run-seed.ts
```

> The `Dockerfile` is written for `linux/amd64`, where better-sqlite3 ships a prebuilt
> binary; the build toolchain is installed in case it has to compile, and is kept out of
> the runtime image. **It has not been built on this machine** — Docker is not installed
> here — so treat it as reviewed-not-run. The host and Render paths below were both run.

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
