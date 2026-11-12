# THREAD Commerce API

THREAD is a single-brand fashion e-commerce backend for CSC4161. The NestJS application includes shared authentication, customer profiles, delivery addresses, shopping carts, and order history. Feature ownership is defined in [AGENTS.md](AGENTS.md).

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

## Shopping cart

Use a `CUSTOMER` bearer token and the UUID of an active variant on a published product.

| Method and path | Request and result |
| --- | --- |
| `GET /api/v1/me/cart` | List the caller's cart with current BDT prices in minor units, stock availability, and subtotal. An empty cart returns an empty list and a zero subtotal. |
| `POST /api/v1/me/cart/items` | Add `{"variantId":"<variant UUID>","quantity":2}`. Creates the cart on the first add. Returns 201, or 409 if the variant is already in the cart. |
| `PATCH /api/v1/me/cart/items/:itemId` | Update with `{"quantity":3}`. Returns 200, or 404 for an item outside the caller's cart. |
| `DELETE /api/v1/me/cart/items/:itemId` | Remove the item. Returns 204, or 404 for an item outside the caller's cart. |

Each line shows `availableQuantity` and `canPurchase`. A line stays visible when stock runs short or its product or variant becomes unavailable. The subtotal includes all priced lines at their current price. It is `null` if the amount exceeds JavaScript's safe integer range. Cart operations leave inventory balances untouched. The PostgreSQL integration suite provides catalog and stock fixtures for exercising the full flow.

### Catalog and Inventory handoff

- Staff owns the canonical `Category`, `Product`, and `ProductVariant` entities from `CreateCartCatalog1794470400002`. Cart uses the batched `CatalogService.findVariantsWithProducts` lookup and the published/active rule in `CatalogService.isPurchasable`.
- Inventory owns `InventoryBalance` from `CreateInventoryBalances1794470400003`. `InventoryService.getAvailability` reads `onHand - reserved` by variant and returns zero for a missing balance.
- `CreateCarts1794470400004` enforces one cart per user and one line per variant per cart. Cart lines keep a reference to the canonical variant and read its price on demand.

### Checkout service dependencies

- `CatalogService.getPurchasableVariants(manager, variantIds)` reads through the caller's TypeORM manager. It returns results in input order with variant and product IDs, product name and status, SKU, size, color, and `priceMinor` as a decimal string. Repeated IDs return 400. Missing, inactive, or unpublished variants return 404.
- `InventoryService.reserveForOrder(manager, items, reservationExpiresAt)` expects an active transaction and item records with `orderItemId`, `variantId`, and `quantity` matching the order items in that transaction. It locks balance rows by ascending variant ID, checks the combined requested quantity per variant, inserts an `ACTIVE` reservation per item, and increments `reserved`. Insufficient stock or a duplicate reservation returns 409. The caller owns commit and rollback.
- `CreateStockReservations1794470400006` adds `stock_reservations` after the Orders migration. Its unique order-item foreign key allows one reservation per line, and the status/expiry index supports future expiry processing. Reservations change the reserved quantity. Stock-movement events apply to stock receipt and adjustment.

## Customer order history

Use a `CUSTOMER` bearer token in Swagger or the `Authorization` header. Both routes return the standard success envelope.

| Method and path | Result |
| --- | --- |
| `GET /api/v1/me/orders` | List the caller's order summaries with ID, status, currency, total, and timestamps. Orders sort by creation time descending, then ID descending. Defaults to `page=1&limit=20`, with a maximum limit of 100. Counts are in `meta.pagination`. |
| `GET /api/v1/me/orders/:id` | Read an owned order, its shipping address snapshot, and item snapshots with SKU, product name, size, color, unit price, quantity, and line total. A missing or other customer's order returns 404. |

Amounts such as `totalMinor`, `unitPriceMinor`, and `lineTotalMinor` are decimal strings representing integer BDT minor units. For example, `"250000"` represents BDT 2,500.00. A removed catalog variant appears as `variantId: null` and its saved item details remain available.

`CreateOrders1794470400005` creates `orders`, `order_items`, and the `order_status` enum after the account and catalog tables. The Orders service is exported for other backend modules and provides a summary lookup by ID for trusted callers such as fulfillment. Apply the migrations and use the PostgreSQL order-history tests to exercise populated orders with fixtures. A newly registered customer sees empty history until orders are recorded.

## Checkout

Send `POST /api/v1/checkout` with a `CUSTOMER` bearer token, an `Idempotency-Key` header, and a body such as `{"addressId":"6268504d-c404-4730-9abb-9e8bd527f06a"}`. Keys are case-sensitive and accept 1–128 ASCII letters, digits, dots, underscores, or hyphens.

- **201 Created** returns `data.orderId`, `status: "PENDING_PAYMENT"`, `currency: "BDT"`, and `totalMinor` as a decimal string. The order appears in customer order history.
- **200 OK** returns the existing order and its current status when the customer repeats the key with the same address UUID. The SHA-256 fingerprint uses the normalized address UUID. A replay works after the cart is cleared or changes and leaves any new items in place.
- **400 Bad Request** covers invalid input or an empty cart. **404 Not Found** covers an address outside the caller's account or a variant that is unavailable for purchase. **409 Conflict** covers insufficient stock, an unsupported total, or reusing a completed key with another address.

Checkout owns one PostgreSQL transaction. It locks the customer's cart row and purchased lines, reads authoritative catalog prices, saves the address and product snapshots, reserves stock for 15 minutes, records the key, and clears the purchased items. A failure rolls back the order, reservation, key, and cart changes together. `CreateIdempotencyRecords1794470400007` enforces one record per customer and key.

## Verification

```sh
npm run build
npm run lint
npm test
```

The foundation tests run without PostgreSQL. For the profile, address, cart, order-history, checkout dependency, and checkout suites, use a dedicated local test database, apply migrations with `DATABASE_URL` pointing to it, then set `TEST_DATABASE_URL` to the same URL and run `npm test`. Each suite uses a generated JWT secret, creates its own fixtures, and cleans them up. Jest skips these suites when `TEST_DATABASE_URL` is unset.
