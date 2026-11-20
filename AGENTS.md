# Minimal THREAD Team Instructions

Read [README.md](README.md) and review the Swagger API documentation before implementing a milestone. Keep work on the feature branch owned by your domain.

| Owner | Module | Deliverables |
| --- | --- | --- |
| Customer | `src/modules/customer` | Profile, addresses, cart, order history, checkout |
| Staff | `src/modules/staff` | Category, collection, product, and variant CRUD and catalog reads |
| Inventory Manager | `src/modules/inventory` | Stock reads, receipts, adjustments, and movement history |
| Admin | `src/modules/admin` and `src/modules/auth` | Staff account management and shared authentication and authorization |

Reuse the entities in `src/database/entities`. Coordinate shared contract changes with the affected domain owners. Add a migration for schema changes and keep `synchronize: false`. Keep `.env` values out of Git.

Use `@Public()` for the explicit public routes documented in Swagger. Use `@Roles(...)` for restricted routes and `@CurrentUser()` for the actor and customer ownership. Mark protected Swagger operations with `@ApiBearerAuth()`. Keep password hashes out of returned data by projecting public fields.

Use separate class-validator DTOs for create and update. Explicitly permit null only for nullable fields. Use `ParseUUIDPipe` for UUID parameters and `PageQueryDto` with `Page<T>` for lists. Return response data from controllers so the global interceptor wraps it. Throw Nest HTTP exceptions and leave database error translation to the shared filter. Use 204 for successful deletes.

Pass the checkout transaction's `EntityManager` into both shared services and use it for every related read and write. Keep checkout cash on delivery. Keep the stock update and movement in the same transaction. Keep cart and stock locking consistent with the existing checkout and cart services.

For each milestone, implement the assigned behavior and focused tests, run `npm run typecheck` and `npm test`, and run `npm run test:postgres` for database or cross-domain changes. Report the endpoints verified and any open integration gaps. When the task authorizes commits, make meaningful milestone commits and report their hashes. Integrate the domains on the team's shared branch after review.
