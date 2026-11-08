# THREAD project conventions

Use [PROJECT_SOURCE_OF_TRUTH.md](PROJECT_SOURCE_OF_TRUTH.md) v1.1 for the agreed architecture, endpoint contracts, data model and state transitions. Review contract changes with the affected owners before merging.

## Module ownership

| Developer | Owned modules |
| --- | --- |
| Customer | `accounts`, `addresses`, `cart`, `checkout`, `orders`, `payments`, `size-recommendations` |
| Staff | `catalog`, `categories`, `collections`, `size-guides`, `returns` |
| Inventory Manager | `inventory`, `stock-movements`, `fulfillment`, `shipments` |
| Admin | `auth`, `users`, `roles`, `audit`, `analytics` |

The authenticated roles are `CUSTOMER`, `STAFF`, `INVENTORY_MANAGER` and `ADMIN`. Guests are unauthenticated visitors. The Admin developer owns the shared authentication and permission contracts. Catalog, inventory reservations and order transitions belong to their respective domain owners.

## Implementation

- Extend the existing NestJS application. Keep controllers focused on HTTP, services on business rules, and TypeORM repositories on persistence. Register each feature module once and export only the services other modules need.
- Keep one canonical entity per table. Put entities in their owning feature and name files `*.entity.ts`. Use exported domain services for cross-module operations, and review changes with both owners.
- Keep HTTP routes under `/api/v1` and Swagger at `/api/docs`. Use request DTO classes and preserve the documented success and error envelopes. Use client-safe messages when throwing HTTP exceptions from routes. The shared filter includes field details for DTO validation and maps PostgreSQL unique violations to a safe 409. Keep credentials, password hashes and database errors out of responses and logs.
- Use UUIDs, UTC timestamps, camelCase JSON and snake_case database names. Store BDT amounts as integer minor units. Use 1-based pagination with a default limit of 20 and maximum of 100.
- Keep `synchronize: false`. Write and review versioned migrations in `src/database/migrations` for schema changes. Each feature owner authors the migrations for their domain and verifies them against a clean database.
- Keep TypeScript strict, use ESLint and Prettier, and keep `.env` out of Git. Update `.env.example` for new configuration and commit `package-lock.json` with dependency changes.
- Run `npm ci`, `npm run build`, `npm run lint` and `npm test` before review. Include the affected endpoints, migration names and verification results in feature reviews.
