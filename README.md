# THREAD Commerce API

THREAD is a single-brand fashion e-commerce backend for CSC4161. This foundation provides one NestJS application, a PostgreSQL connection and the shared HTTP conventions. The feature folders are reserved for the four developers listed in [AGENTS.md](AGENTS.md).

## Run locally

1. Install Node.js 24 LTS (24.11 or later), npm and PostgreSQL. Node.js 22.13 or later in the 22.x line is also supported.
2. Create a local PostgreSQL role with a password and a database named `thread` owned by that role. Give the role permission to create tables in the database schema.
3. Copy `.env.example` to `.env` and replace the placeholders in `DATABASE_URL`. Percent-encode special characters in the username or password.
4. Run these commands from the repository root.

   ```sh
   npm ci
   npm run db:migrate
   npm run start:dev
   ```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL connection URL |
| `PORT` | HTTP port, defaults to `3000` |
| `SWAGGER_ENABLED` | Set to `false` to disable Swagger UI and OpenAPI JSON. Defaults to `true` |

With the default port, `GET http://localhost:3000/api/v1/health` returns HTTP 200 with `data.status` set to `"ok"`. This checks HTTP liveness. Startup requires a working PostgreSQL connection. Open Swagger UI at `http://localhost:3000/api/docs`, or fetch the OpenAPI document from `/api/docs-json`.

## Migrations

The application and the TypeORM CLI share the same connection and entity-discovery settings. Schema changes go through explicit migrations. Add feature entities under `src/modules/<feature>/` as `*.entity.ts`.

```sh
npm run db:migration:create -- src/database/migrations/DescribeChange
npm run db:migration:generate -- src/database/migrations/DescribeChange
npm run db:migration:show
npm run db:migrate
npm run db:migrate:revert
```

Use either `create` for a handwritten migration or `generate` to diff the entities against a local database with existing migrations applied. Review the SQL and verify the up/down behavior before sharing a migration. The foundation has an empty migration history.

For a compiled run, use `npm run build`, `npm run db:migrate:prod` and `npm run start:prod` from the repository root.

## Verification

```sh
npm run build
npm run lint
npm test
```

The Jest tests cover environment validation and the HTTP bootstrap. They run without PostgreSQL. Use the local setup steps to verify the full application against your database.
