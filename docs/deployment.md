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

Two blueprints, because the choice is about cost rather than correctness.

### Free (`render.yaml`)

**New → Blueprint → pick the repository.** Nothing else to do — no shell step, no seeding.

Render's persistent disks require a paid instance type, so the free configuration has no
disk and sets `SEED_ON_BOOT=true`. The app generates its 10,000-employee dataset at
startup if the database is empty: deterministic, and under a second, so every visitor
sees exactly the same organisation.

What it costs: the instance spins down after about 15 minutes idle and the next request
waits ~50s for a cold start, which also resets the data. **Within a session nothing is
lost** — a reviewer can record a raise and watch the median move. Only a spin-down or
redeploy returns it to the seed.

That is a real limitation and worth saying out loud rather than hiding, but for a
demonstration it is the right trade: the alternative is a paid instance for an app nobody
is storing real payroll in.

### Persistent (`render-persistent.yaml`)

For data that must survive a redeploy. Requires a paid instance type. Rename it to
`render.yaml` — Render only reads that filename — then seed once from the service Shell:

```bash
DATABASE_PATH=/var/data/salary.sqlite npm run seed
```

It deliberately does **not** set `SEED_ON_BOOT`. With a real disk the database should be
seeded once, on purpose, not regenerated by a process restart.

### The SEED_ON_BOOT guard

`seedIfEmpty()` writes 10,000 employees, so it is guarded twice and both must hold:

1. `SEED_ON_BOOT=true` must be set explicitly. It is off by default, so a normal
   deployment never reaches the code.
2. The `employees` table must be empty. Even switched on, it will not touch a database
   that already holds people.

There is no combination of settings under which it discards salary data, and
`seed-if-empty.test.ts` asserts exactly that.

## Anywhere else

Any platform that runs a Node process and can attach a disk works the same way: build, point
`DATABASE_PATH` at the mount, start. Fly.io, Railway and a plain VM with systemd all fit
without changes.

## When SQLite stops being the right answer

SQLite serialises writes. One HR Manager will never notice; a second concurrent writer
eventually will. Every SQL statement lives in `packages/server/src/repositories/`, so moving
to Postgres is a Kysely dialect change plus a review of about six window-function queries —
not an application rewrite. See ADR-0002.
