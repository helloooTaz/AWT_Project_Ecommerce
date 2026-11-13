# THREAD Commerce API

THREAD is a single-brand fashion e-commerce backend for CSC4161. The NestJS application includes shared authentication, customer profiles, delivery addresses, shopping carts, checkout, order history, and mock payments. Feature ownership is defined in [AGENTS.md](AGENTS.md).

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
| `PAYMENT_PROVIDER` | Defaults to `DISABLED`. Set explicitly to `MOCK` to enable mock payment sessions and callbacks |
| `MOCK_PAYMENT_SIGNING_SECRET` | Required in `MOCK` mode. Generate a separate random secret using the same command as for `JWT_SECRET` |
| `ORDER_EXPIRY_ENABLED` | Defaults to `true` outside tests and `false` with `NODE_ENV=test`. Set `false` to pause automatic expiry |
| `ORDER_EXPIRY_POLL_INTERVAL_MS` | Time between polling ticks in milliseconds. Defaults to `60000` and accepts `1000`–`3600000` |
| `ORDER_EXPIRY_BATCH_SIZE` | Maximum candidate orders per poll. Defaults to `25` and accepts `1`–`100` |

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

## Product size recommendations

Send `POST /api/v1/products/{productId}/size-recommendation` from Swagger or any HTTP client. The route is public and the product must be published. A request can use `{"heightCm":175,"weightKg":70,"chestCm":98}`. Height and weight are required. Chest, waist, and hip are optional. Use JSON numbers with height 50–260 cm, weight 10–500 kg, and circumferences 30–300 cm. Invalid input returns 400, and a missing, draft, or archived product returns 404.

The service compares each supplied measurement against the guide bounds for that size. Bounds are inclusive and may be one-sided. A size needs at least one comparable measurement, and every comparable measurement must fit. For overlapping sizes, the lowest mean midpoint distance wins. Each distance is divided by its range width, and an exact-width range scores zero for an exact match. A match with only one-sided comparisons ranks after matches with a midpoint. Equal scores prefer more matched measurements and then size label order. `confidence` is `LOW` for one compared measurement or height and weight alone, and `MODERATE` when multiple comparisons include a circumference.

HTTP 200 uses the standard success envelope. `data.status` describes the outcome.

| Status | Meaning |
| --- | --- |
| `RECOMMENDED` | The closest matching size has an active variant. `stockAvailable` indicates whether any active color of that size has unreserved stock. |
| `NO_GUIDE` | The product has no guide with ranges. |
| `INSUFFICIENT_MEASUREMENTS` | The guide has no bounds for the supplied measurements. |
| `NO_MATCH` | The supplied measurements fall outside every comparable range. |
| `NO_ACTIVE_VARIANT` | `bestFitSize` shows the closest match, and `recommendedSize` is null. Other fitting sizes with active variants may appear in `alternatives`. |

`availableSizes` lists distinct active variant labels, regardless of stock. `alternatives` lists other matching active sizes in fit order. This estimate leaves measurements, carts, customer profiles, and stock reservations untouched.

### Size-guide data handoff

`CreateSizeGuides1794470400009` creates one guide per product and multiple ranges per guide. Bounds use PostgreSQL `numeric(6,2)` with centimeter lengths and kilogram weights. PostgreSQL enforces at least one positive finite bound per range and validates the order of each min/max pair. Set each unique guide size label to the exact `ProductVariant.size` value used by that product. Staff owns guide records and can reuse the canonical entities for guide management. For a local demo, apply migrations and run `npm test -- --runInBand size-recommendations.e2e` with `TEST_DATABASE_URL` set. The suite creates a published shirt with size and color fixtures and exercises the Swagger-documented route.

## Customer order history

Use a `CUSTOMER` bearer token in Swagger or the `Authorization` header. Both routes return the standard success envelope.

| Method and path | Result |
| --- | --- |
| `GET /api/v1/me/orders` | List the caller's order summaries with ID, status, currency, total, and timestamps. Orders sort by creation time descending, then ID descending. Defaults to `page=1&limit=20`, with a maximum limit of 100. Counts are in `meta.pagination`. |
| `GET /api/v1/me/orders/:id` | Read an owned order, its shipping address snapshot, and item snapshots with SKU, product name, size, color, unit price, quantity, and line total. A missing or other customer's order returns 404. |

Amounts such as `totalMinor`, `unitPriceMinor`, and `lineTotalMinor` are decimal strings representing integer BDT minor units. For example, `"250000"` represents BDT 2,500.00. A removed catalog variant appears as `variantId: null` and its saved item details remain available.

`CreateOrders1794470400005` creates `orders`, `order_items`, and the `order_status` enum after the account and catalog tables. The Orders service is exported for other backend modules and provides a summary lookup by ID for trusted callers such as fulfillment. Apply the migrations and use the PostgreSQL order-history tests to exercise populated orders with fixtures. A newly registered customer sees empty history until orders are recorded.

### Cancel an unpaid order

Send an empty `POST /api/v1/me/orders/:id/cancel` with the owner's `CUSTOMER` bearer token. Only `PENDING_PAYMENT` orders are eligible. A successful cancellation returns 200 with the order ID in `data.orderId` and `CANCELLED` in `data.status`. Missing and other-owned orders return 404. Repeating a cancellation or cancelling an order in another status returns 409. Paid orders require a separate refund and cancellation process.

Cancellation locks the order and calls `InventoryService.releaseForOrder(manager, orderId)` in the same transaction. Inventory locks the active reservation rows by order item ID and the affected balances by variant ID, subtracts the released quantities from `reserved`, and marks the reservations `RELEASED`. `onHand` stays the same. If every reservation was already released, an otherwise eligible order can still be cancelled. A failure rolls back the stock and order changes together.

Payment callbacks take the same order lock. If successful payment commits first, cancellation returns 409. If cancellation commits first, new success and failure callbacks and payment-session requests return 409. An outstanding `PENDING` payment attempt stays in history and is permanently ineligible for processing. Replays of previously accepted events still use the existing deduplication response.

## Checkout

Send `POST /api/v1/checkout` with a `CUSTOMER` bearer token, an `Idempotency-Key` header, and a body such as `{"addressId":"6268504d-c404-4730-9abb-9e8bd527f06a"}`. Keys are case-sensitive and accept 1–128 ASCII letters, digits, dots, underscores, or hyphens.

- **201 Created** returns `data.orderId`, `status: "PENDING_PAYMENT"`, `currency: "BDT"`, and `totalMinor` as a decimal string. The order appears in customer order history.
- **200 OK** returns the existing order and its current status when the customer repeats the key with the same address UUID. The SHA-256 fingerprint uses the normalized address UUID. A replay works after the cart is cleared or changes and leaves any new items in place.
- **400 Bad Request** covers invalid input or an empty cart. **404 Not Found** covers an address outside the caller's account or a variant that is unavailable for purchase. **409 Conflict** covers insufficient stock, an unsupported total, or reusing a completed key with another address.

Checkout owns one PostgreSQL transaction. It locks the customer's cart row and purchased lines, reads authoritative catalog prices, saves the address and product snapshots, reserves stock for 15 minutes, records the key, and clears the purchased items. A failure rolls back the order, reservation, key, and cart changes together. `CreateIdempotencyRecords1794470400007` enforces one record per customer and key.

## Mock payments

Apply `CreatePayments1794470400008`, set `PAYMENT_PROVIDER=MOCK`, and configure a dedicated `MOCK_PAYMENT_SIGNING_SECRET` before starting the server. Keep the signing secret on the provider or demo operator side.

1. Create an order through checkout. Send an empty `POST /api/v1/orders/:id/payment-session` with the owner's `CUSTOMER` bearer token. The 200 response includes `providerRef`, `status`, `amountMinor`, `currency`, and `expiresAt`. The amount comes from the order and is an exact decimal string in BDT minor units. `expiresAt` is the earliest reservation expiry. Missing and other-owned orders return 404. Ineligible orders return 409.
2. From a separate local PowerShell terminal, replace the example reference and amount below with those returned by the session. This signs the UTF-8 JSON bytes and sends that same body to the mock callback. The script reads the secret from the environment or local `.env`. Use `FAILED` to demonstrate a declined attempt.

   ```powershell
   @'
   const { createHmac, randomUUID } = require('node:crypto');
   const [providerRef, amountMinor, status] = process.argv.slice(2);
   const body = Buffer.from(JSON.stringify({ eventId: randomUUID(), providerRef, amountMinor, status }));
   const signature = createHmac('sha256', process.env.MOCK_PAYMENT_SIGNING_SECRET).update(body).digest('hex');
   const port = process.env.PORT || '3000';
   fetch(`http://localhost:${port}/api/v1/webhooks/payments/mock`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', 'X-Mock-Payment-Signature': signature },
     body,
   }).then(async (response) => {
     console.log(response.status, await response.text());
     if (!response.ok) process.exitCode = 1;
   });
   '@ | node --env-file-if-exists=.env - 'c99f1619-d5a6-4a56-94d4-1dbd8f1bff4b' '250000' 'PAID'
   ```

3. Read the order through `GET /api/v1/me/orders/:id`. A valid success moves the payment to `PAID` and the order to `CONFIRMED` in the same transaction. Reservations stay `ACTIVE` and inventory balances retain their existing quantities for fulfillment.

An eligible order reuses its open session. A failed attempt is terminal and the order keeps its current status and reservations. While the order remains payable, a new session gets a new reference. The first accepted terminal outcome wins for each attempt. A distinct event with the same outcome is acknowledged, and the opposite outcome returns 409.

The webhook expects uncompressed JSON and a 64-character hexadecimal HMAC-SHA256 digest in `X-Mock-Payment-Signature`. Each event has a provider-generated UUID v4 `eventId`. Reuse the same ID and fields when retrying delivery. An already accepted ID returns 200 with `data.duplicate` set to `true`. Reusing an ID with different fields returns 409. Rejected events and rolled-back transactions leave the ID available for retry. The app limits callbacks to 60 requests per connected IP per minute per process. A reverse proxy can share that budget across its clients.

## Order confirmation email

Set `MAIL_ENABLED=true` in your local `.env` and provide `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM` (a sender email address). Startup
validates those settings when enabled. Mail defaults to disabled, and automated
tests use a fake transport. SMTP uses implicit TLS on port 465 and requires
STARTTLS on other ports.

1. Open a Mailtrap Email Sandbox and copy its SMTP settings into `.env`.
   The sandbox host is `sandbox.smtp.mailtrap.io`, typically on port `2525`.
   Use a demo sender address such as `orders@example.com`.
2. Enable mock payments as described above, start the app, and sign in as a
   demo customer. Check out, open a payment session, and send a signed `PAID`
   callback using the PowerShell example above.
3. Confirm the webhook returned HTTP 200 and the order is `CONFIRMED`. In the
   Mailtrap inbox, inspect the HTML and plain-text versions for the order
   reference, purchased items, quantities, and BDT total. Run the signing
   example again with the same session and amount to send a new event ID.
   The inbox should still show one confirmation for the order. To test an
   exact replay, resend the original signed JSON bytes and signature.

SMTP is attempted only after the newly confirmed payment and order commit.
The webhook waits for that attempt and returns the existing acknowledgement
even if delivery fails. Failures log a warning with the order ID. This is
best-effort delivery with no durable retry. A process exit after commit or an
SMTP failure can leave an order confirmed without an email, and callback
replays do not retry delivery. A durable outbox would require persisted jobs,
a retry worker, and a delivery deduplication strategy.

## Automatic order expiry

The worker runs on application startup and at each configured polling tick. It skips ticks while a batch is running and finishes the current batch at shutdown. PostgreSQL holds the outstanding work, so a new process can pick up overdue orders after a restart.

The first active reservation deadline closes the payment window for the whole order. Each poll finds a bounded page of `PENDING_PAYMENT` orders with at least one `ACTIVE` reservation due according to PostgreSQL. A cursor advances past failed candidates and wraps so later orders get a turn and failures can be retried. The cursor only controls scan order.

The worker locks each candidate through `OrdersService.lockForUpdate` in its own transaction, then rechecks status and deadline. This makes candidates safe to select without locks and prevents duplicate release across instances. The worker calls `InventoryService.releaseForOrder` to release all active reservations, preserves `onHand`, and transitions the order to `EXPIRED` in the same transaction. Lock waits time out after five seconds per lock. Failures roll back and can be retried by a later poll.

A paid or cancelled order keeps its committed status when the worker reaches it. Successful payment already requires the PostgreSQL clock to be before the deadline, even between polls. After expiry commits, new payment sessions, new signed payment events, and customer cancellation return 409. Payment history remains available, and previously accepted events still deduplicate. Future fulfillment should take the order lock before changing reservations.

## Request correlation and checkout timing

Every HTTP response includes a server-generated `X-Request-ID`. For JSON API
envelopes, the same value appears in `meta.requestId`. The request log records
the method, path without the query string, request ID, final status, and
duration through response finish.

Checkout also includes `X-Response-Time`, such as `12.34ms`. This covers the
checkout pipeline after guards, including validation and asynchronous
checkout work. Guard rejections still carry the request ID. The interceptor
runs only on checkout.

For a demo, send `GET /api/v1/health` and a malformed JSON request. Match each
response's header and envelope ID to its log line. Then check out in Swagger
or Postman and compare the timing header with the end-to-end duration in the
log. Reuse the checkout idempotency key to see timing on the replay response.

## Verification

```sh
npm run build
npm run lint
npm test
```

The foundation tests run without PostgreSQL. For the profile, address, cart, size recommendation, order-history, checkout dependency, checkout, and payment suites, use a dedicated local test database, apply migrations with `DATABASE_URL` pointing to it, then set `TEST_DATABASE_URL` to the same URL and run `npm test`. Each suite uses a generated JWT secret, creates its own fixtures, and cleans them up. The payment suite generates its own mock signing secret. Jest skips these suites when `TEST_DATABASE_URL` is unset.
