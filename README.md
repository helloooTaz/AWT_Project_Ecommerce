# THREAD Commerce API

THREAD is a single-brand fashion e-commerce backend for CSC4161. The NestJS application includes shared authentication and customer delivery address management. Feature ownership is defined in [AGENTS.md](AGENTS.md).

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

Use either `create` for a handwritten migration or `generate` to diff the entities against a local database with existing migrations applied. Review the SQL and verify the up/down behavior before sharing a migration. `CreateUsers1794470400000` creates the canonical account table before `CreateAddresses1794470400001` adds its foreign key.

For a compiled run, use `npm run build`, `npm run db:migrate:prod` and `npm run start:prod` from the repository root.

## Delivery address demo

1. Register at `POST /api/v1/auth/register` with `email`, `fullName`, and `password`. Public registration always creates a `CUSTOMER`.
2. Log in at `POST /api/v1/auth/login` with `email` and `password`. Use `data.accessToken` as a bearer token in Swagger or in the `Authorization` header.
3. Create an address with `recipient`, `phone`, `addressLine1`, and `city`. `phone` accepts 7–15 digits with an optional leading `+`. `addressLine2` is optional and can be cleared by setting it to `null` on PATCH.

| Method and path | Result |
| --- | --- |
| `POST /api/v1/me/addresses` | Create, 201 |
| `GET /api/v1/me/addresses` | List own addresses, 200. Defaults to `page=1&limit=20` with a maximum limit of 100 |
| `GET /api/v1/me/addresses/:id` | Read, 200 |
| `PATCH /api/v1/me/addresses/:id` | Update one or more fields, 200 |
| `DELETE /api/v1/me/addresses/:id` | Delete, 204 |

### Shared authentication handoff

Reuse the canonical `User` and `UsersService` in `src/modules/users`, the roles in `src/modules/roles`, and the guards exported by `AuthModule`. Apply `JwtAuthGuard` before `RolesGuard` on role-protected routes and declare allowed roles with `@Roles([...])`. The JWT has a UUID `sub` and a one-hour expiry. Authentication reads the active user and current role from the database and makes the typed identity available through `@CurrentUser()`. The address foreign key restricts hard deletion of users with addresses.

## Profile update demo

Send `PATCH /api/v1/users/me` with a bearer token and a body such as `{"fullName":"Samira Rahman"}`. Any active authenticated account can update its own name. The API trims surrounding whitespace and returns the account ID and updated name in `data`.

## Verification

```sh
npm run build
npm run lint
npm test
```

The foundation tests run without PostgreSQL. For the profile and address suites, use a dedicated local test database, apply migrations with `DATABASE_URL` pointing to it, then set `TEST_DATABASE_URL` to the same URL and run `npm test`. Each suite starts the full app with a generated JWT secret, creates its own fixtures, and cleans them up. Jest skips these suites when `TEST_DATABASE_URL` is unset.
