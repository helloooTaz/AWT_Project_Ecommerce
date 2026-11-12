# THREAD Commerce API

THREAD is a single-brand fashion e-commerce backend for CSC4161. The NestJS application includes shared authentication. Feature ownership is defined in [AGENTS.md](AGENTS.md).

## Run locally

1. Install Node.js 24 LTS (24.11 or later), npm and PostgreSQL 13 or later for its built-in UUID generation. Node.js 22.13 or later in the 22.x line is also supported.
2. Create a local PostgreSQL role with a password and a database named `thread` owned by that role. Give the role permission to create tables in the database schema.
3. Copy `.env.example` to `.env` and replace the placeholders in `DATABASE_URL`. Percent-encode special characters in the username or password. Set `JWT_SECRET` to the output of `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
4. Run these commands from the repository root.

   ```sh
   npm ci
   npm run db:migrate
   npm run start:dev
   ```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL connection URL |
| `JWT_SECRET` | Required for app startup. Use a distinct random secret per environment with at least 32 characters |
| `PORT` | HTTP port, defaults to `3000` |
| `SWAGGER_ENABLED` | Set to `false` to disable Swagger UI and OpenAPI JSON. Defaults to `true` |

With the default port, `GET http://localhost:3000/api/v1/health` returns HTTP 200 with `data.status` set to `"ok"`. This checks HTTP liveness. Startup requires a working PostgreSQL connection. Open Swagger UI at `http://localhost:3000/api/docs`, or fetch the OpenAPI document from `/api/docs-json`.

## Migrations

The application and the TypeORM CLI share the same connection and entity-discovery settings. Schema changes go through explicit migrations. Add feature entities under `src/modules/<feature>/` as `*.entity.ts`. The CLI only requires `DATABASE_URL`.

```sh
npm run db:migration:create -- src/database/migrations/DescribeChange
npm run db:migration:generate -- src/database/migrations/DescribeChange
npm run db:migration:show
npm run db:migrate
npm run db:migrate:revert
```

Use either `create` for a handwritten migration or `generate` to diff the entities against a local database with existing migrations applied. Review the SQL and verify the up/down behavior before sharing a migration. `CreateUsers1794470400000` creates the canonical account table.

For a compiled run, use `npm run build`, `npm run db:migrate:prod` and `npm run start:prod` from the repository root.

## Shared authentication

1. Register at `POST /api/v1/auth/register` with `email`, `fullName`, and `password`. Public registration always creates a `CUSTOMER`.
2. Log in at `POST /api/v1/auth/login` with `email` and `password`. Use `data.accessToken` as a bearer token in Swagger or in the `Authorization` header.

Reuse the canonical `User` and `UsersService` in `src/modules/users`, the roles in `src/modules/roles`, and the guards exported by `AuthModule`. Apply `JwtAuthGuard` before `RolesGuard` on role-protected routes and declare allowed roles with `@Roles([...])`. The JWT has a UUID `sub` and a one-hour expiry. Authentication reads the active user and current role from the database and makes the typed identity available through `@CurrentUser()`.

## Verification

```sh
npm run build
npm run lint
npm test
```

The foundation tests run without PostgreSQL.
