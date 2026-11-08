# THREAD — Single-Brand Fashion Commerce API
## Project source of truth (SOT) · v1.1 · 6 November 2026

> **Status:** Planning specification, NOT an implemented application. All code, APIs, database tables, tests and deployments described below are targets.  
> **Read this whole file before writing code.** Every team member and every LLM assistant must treat the sections marked **LOCKED** as the same contract.  
> **Academic source:** CSC4161 *Advanced Programming in Web Technology — Project Proposal Guide and Sample Project Report* (October 2026), Part A, especially §§3–7.  
> **Important grading assumption:** The team is **assuming** environment configuration and database migration infrastructure may be shared. This is **not confirmed by the written guide**; ask the instructor. Every other optional bonus must be **implemented and demonstrated individually** by anyone claiming that bonus. The written guide also does not list separate deployment among its ten bonus categories; separate deployment is a reported oral instruction.

---

## 1. Vision & scope — LOCKED

**One-line pitch:** A single-brand, direct-to-consumer fashion e-commerce backend for clothing, footwear and accessories, comparable in business flow to Zara, H&M or Uniqlo, with a clean minimalist storefront to be built later.

**Not:** a multi-seller marketplace, a luxury concierge business, four independent backend projects, or a microservice system.

**Primary goals:**
1. Expose a consistent, independently testable NestJS REST API for shopping and retail operations.
2. Implement four authenticated RBAC roles: `CUSTOMER`, `STAFF`, `INVENTORY_MANAGER`, `ADMIN`.
3. Support catalog management, SKU-specific inventory, carts, transactional order placement, and fulfillment.
4. Prevent invalid state changes and overselling; preserve order price history and audit significant actions.
5. Meet **all five** mandatory course categories and give each teammate clearly owned, independently demonstrable work.

**Out of scope for baseline:** multi-vendor onboarding, multi-currency, coupons/loyalty, real card handling, paid virtual try-on AI, microservices, multiple warehouses, physical POS/boutique collection. Optional enhancements require explicit agreement before changing shared contracts.

**Backend first:** This pack specifies a **planned folder skeleton and contracts**, not implemented code. The required course deliverable is a backend demonstrated using Swagger/Postman. The Next.js frontend is a separate later portfolio phase, not a blocker for backend acceptance.

---

## 2. Grading interpretation and scope agreement — LOCKED

### 2.1 Minimum requirements (mandatory for the finished group system)

| ID | Course requirement | Concrete project evidence |
|---|---|---|
| M1 | Multiple related entities, full CRUD, pagination | At least `products`, `product_variants`, `categories`, `collections` have create/list/detail/update/archive/delete endpoints. Relations include 1:N and M:N. |
| M2 | Relational database, ORM and multi-table transaction | PostgreSQL + TypeORM + foreign keys; checkout creates order/order items and reserves variant stock atomically; forced failure leaves no partial data. |
| M3 | Registration/login, bcrypt password hashes, JWT, ≥2 roles with guards | Public registration creates only `CUSTOMER`; all staff routes are JWT + role-guarded. Show 401 and 403. |
| M4 | Create/update DTO validation | Separate DTOs, `class-validator`, global `ValidationPipe` with whitelist and `forbidNonWhitelisted`; bad input is 400 with field errors. |
| M5 | Controlled HTTP exception handling | 400/401/403/404/409 responses with one safe error shape; no stack traces or leaked DB errors. |

> **Important:** The written guide treats these as **group project** requirements; it does not state every member must independently build four CRUD entities or a standalone JWT system. If the instructor imposes individual minimum grading too, reconfirm the distribution before coding. A shared runtime used by all is NOT automatically shared bonus credit.

### 2.2 Optional bonuses (individual by the reported oral rule)

The **ten bonus types in the written guide** are: Middleware; Custom Decorators; Mailer; Swagger UI; Interceptors; Audit Log; Environment Configuration; Migrations; Response Manipulation; Advanced Database Transactions.

**Assumption for planning only:** `Environment Configuration` and `Migrations` are the **two permitted common exceptions**. Each developer **chooses** any other bonuses that naturally fit their domain. They need their own implementation, test and demonstration evidence. Merely using another teammate's bonus code is insufficient under the reported instruction; the instructor is the final authority.

**Separate deployment (reported instructor instruction):** Each member who wants deployment bonus must deploy and demonstrate the **ENTIRE MERGED backend with all four roles**, not only their own module. Use four independent Render web services, each connected to its own Render PostgreSQL database in the same member's workspace. All deployments use the **same tested Git commit** and versioned migrations. The written guide does not include deployment among its printed ten bonus types; instructor must still confirm whether four independently configured instances of identical source qualify.

---

## 3. Roles and access policy — LOCKED

Guest is **not** a fifth database role: it is an unauthenticated visitor on public routes.

| Actor | Natural responsibilities | Explicit exclusions |
|---|---|---|
| Guest | Browse published products, search/filter, register/login | No private customer resources, stock changes or purchases without login in v1 |
| `CUSTOMER` | Profile, addresses, cart, wishlist (optional), checkout, own orders, tracking, own return requests, size advice | Cannot set prices, payment/order status, inventory, other users' data |
| `STAFF` | Product/category/collection/variant content, prices, publish/archive, view operational orders, review return/cancellation requests | No stock mutation, staff permissions, or direct payment status edits |
| `INVENTORY_MANAGER` | Receive/adjust SKU stock, stock-movement history, reserve/release support, pick/pack/ship, returned-item inspection | No price, catalog, account-role or refund authorization |
| `ADMIN` | Create/deactivate staff, assign roles, view audit logs and sales dashboard, oversee and perform authorized management operations | Cannot bypass financial, transaction or state-machine invariants |

**Enforcement:** All modifying routes check JWT (except registration/login), RBAC, and ownership where applicable. A `CUSTOMER` cannot gain a staff role by specifying `role` in registration DTO. Admin is seeded by an approved bootstrap command, not public signup. Use default deny. Do not implement role-specific copies of AuthModule.

**Personnel vs roles:** Four *developers* own different domains aligned with the four roles, but all four role permissions are enforced by one backend.

---

## 4. Frozen technology & engineering choices — LOCKED

| Concern | Standard |
|---|---|
| Runtime/framework | Node.js LTS, NestJS with TypeScript; pin versions together in `package-lock.json` |
| Database/ORM | PostgreSQL, TypeORM; migrations only; `synchronize: false` |
| Authentication | `@nestjs/jwt`, Passport JWT strategy, bcrypt |
| Validation | `class-validator`, `class-transformer`, global ValidationPipe |
| Documentation | `@nestjs/swagger` (one application bootstrap; each module documents its own endpoints) |
| Configuration | `@nestjs/config`; Joi/class validation of required env values; commit `.env.example`, NEVER `.env` |
| Testing | Jest unit tests, NestJS/Supertest integration tests, Postman/Swagger demos |
| Code quality | ESLint, Prettier, TypeScript strict mode, no `any` in public contracts |
| Deployment (initial) | **Render native Node web service + Render Free PostgreSQL** in same member workspace; four full-stack backend instances (one/member); `render.yaml` Blueprint template |
| Containerization (later) | Docker is optional enhancement, not a prerequisite for the simple Render path |
| Future frontend | Separate Next.js + TypeScript repository consuming `/api/v1` |

**Architecture:** One NestJS modular monolith; one relational logical schema per environment; feature modules and explicit public service interfaces. No direct HTTP calls between internal modules. No duplicate `User`, `Product`, `Order` or `InventoryBalance` definitions.

**Currency:** `BDT` only; store money as integer minor units (`priceMinor`, `totalMinor`) for safe arithmetic. No floating-point prices. All public API timestamps ISO-8601 UTC. IDs are UUID strings. JSON uses `camelCase`; database uses `snake_case`. Return prices from backend, never calculate trusted totals in browser.

---

## 5. Team ownership, shared contracts, and boundaries — LOCKED

Each member owns the **files and tests in their domain**. Teammates can call exported services but must not edit another owner's entity/controller/service without agreeing on the change in a pull request.

| Dev / RBAC focus | OWNED modules & primary business outcomes | Dependencies consumed (not reimplemented) |
|---|---|---|
| **A — Customer** | `accounts`, `addresses`, `cart`, `orders`, `checkout`, `payments` (mock), `size-recommendations`; own-order API and checkout transaction | `auth` for JWT; `catalog` for active SKU/price; `inventory` for reservation operations |
| **B — Staff** | `catalog` (products, variants), `categories`, `collections`, `size-guides`; `returns` request review and customer-service functions (phase 2) | `auth` guards; `inventory` read-only availability; `orders` read-only details |
| **C — Inventory Manager** | `inventory`, `stock-movements`, `fulfillment`, `shipments`, return stock inspection (phase 2) | `catalog` variant identity; `orders` order summary/status transition interface |
| **D — Admin** | `auth`, `users` (staff creation/status), `roles`, `audit`, `analytics`, common auth/permission contracts | Domain read services; no direct bypass of order/payment/inventory mutations |

**Integration lead:** The team selects a rotating reviewer/integrator. This role is not an RBAC role and does not grant exclusive ownership of shared architecture.

**Shared infrastructure managed jointly:** `config/` and `database/migrations/` under the planning assumption. `common/` and `main.ts` contain unavoidable app-wide plumbing, but that does **not** automatically mean individually credited bonus work may be shared. A specific owner authors each change and the PR records it.

**Contract ownership:**
- Auth policy/API → Admin developer.
- Catalog SKU/price availability contract → Staff developer.
- Inventory reserve/release API → Inventory developer.
- Checkout/order state machine → Customer developer.
- Cross-domain contract changes → require approval from both affected owners before merge.

---

## 6. Suggested repository skeleton — LOCKED folder boundaries, flexible internal implementation

```text
thread-commerce-api/
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── .env.example                      # shared TEMPLATE, not credentials
├── .gitignore
├── render.yaml                      # copy vetted Blueprint template to backend repo root
├── DEPLOYMENT_RENDER.md            # complete, role-independent deployment playbook
├── Dockerfile                     # optional later, NOT required for native Render Node
├── compose.yaml                    # optional local PostgreSQL helper
├── docs/
│   ├── PROJECT_SOURCE_OF_TRUTH.md    # this file, only canonical specification
│   ├── api-contract.md               # agreed endpoint shapes and state rules
│   ├── decisions/                    # architecture decision records (ADRs)
│   └── evidence/                     # demo screenshots / verification notes
├── src/
│   ├── main.ts                       # global API prefix, pipe, filter, docs
│   ├── app.module.ts                 # register feature modules ONCE
│   ├── config/                       # SHARED assumption
│   │   ├── configuration.ts
│   │   └── env.validation.ts
│   ├── common/
│   │   ├── decorators/
│   │   ├── guards/
│   │   ├── filters/
│   │   ├── interceptors/
│   │   ├── middleware/
│   │   └── dto/
│   ├── database/
│   │   ├── data-source.ts
│   │   ├── migrations/               # SHARED history; individual authors identified by PR
│   │   └── seeds/
│   └── modules/
│       ├── auth/                      # D
│       ├── users/                     # D
│       ├── roles/                     # D
│       ├── audit/                     # D
│       ├── analytics/                 # D
│       ├── accounts/                  # A
│       ├── addresses/                 # A
│       ├── cart/                      # A
│       ├── orders/                    # A
│       ├── checkout/                  # A
│       ├── payments/                  # A
│       ├── size-recommendations/      # A
│       ├── catalog/                   # B
│       ├── categories/                # B
│       ├── collections/               # B
│       ├── size-guides/               # B
│       ├── returns/                   # B (workflow owner)
│       ├── inventory/                 # C
│       ├── stock-movements/           # C
│       ├── fulfillment/               # C
│       └── shipments/                 # C
├── test/
│   ├── integration/
│   └── e2e/
└── .github/workflows/
    └── ci.yml
```

**Per feature module pattern (recommended):**

```text
modules/catalog/
├── catalog.module.ts
├── catalog.controller.ts
├── catalog.service.ts
├── dto/
│   ├── create-product.dto.ts
│   ├── update-product.dto.ts
│   └── product-response.dto.ts
├── entities/
│   ├── product.entity.ts
│   └── product-variant.entity.ts
├── repositories/                 # only if custom abstraction adds value
└── catalog.service.spec.ts
```

**Do not generate independent NestJS apps in four subfolders.** All branches start from the same scaffold and dependencies.

---

## 7. Canonical data model — LOCKED names and core associations

### 7.1 Required first-wave entities

| Entity (table) | Owner | Core columns / invariants |
|---|---|---|
| `users` | D | `id`, `email UNIQUE`, `password_hash`, `full_name`, `role`, `status`, timestamps |
| `addresses` | A | `id`, `user_id FK`, recipient, phone, address lines, city, timestamps |
| `categories` | B | `id`, `name`, `slug UNIQUE`, `is_active` |
| `collections` | B | `id`, `name`, `slug UNIQUE`, `is_active` |
| `products` | B | `id`, `category_id FK`, `name`, `slug UNIQUE`, `description`, `status` (`DRAFT/PUBLISHED/ARCHIVED`), timestamps |
| `product_collections` | B | Composite PK (`product_id`, `collection_id`); M:N bridge |
| `product_variants` | B | `id`, `product_id FK`, `sku UNIQUE`, `size`, `color`, `price_minor >= 0`, `is_active` |
| `inventory_balances` | C | `id`, `variant_id UNIQUE FK`, `on_hand >= 0`, `reserved >= 0`, `reserved <= on_hand` |
| `stock_movements` | C | `id`, `variant_id FK`, `actor_id FK`, `type`, `quantity`, `reason`, `created_at`; append-only |
| `carts` | A | `id`, `user_id UNIQUE FK`, timestamps |
| `cart_items` | A | `id`, `cart_id FK`, `variant_id FK`, `quantity > 0`; unique (`cart_id`,`variant_id`) |
| `orders` | A | `id`, `user_id FK`, `status`, `currency='BDT'`, `total_minor`, `shipping_address_snapshot JSONB`, timestamps |
| `order_items` | A | `id`, `order_id FK`, `variant_id FK`, `sku_snapshot`, `name_snapshot`, `size_snapshot`, `color_snapshot`, `unit_price_minor`, `quantity`, `line_total_minor` |
| `stock_reservations` | C | `id`, `order_item_id UNIQUE FK`, `variant_id FK`, `quantity > 0`, `status`, `expires_at` |
| `payments` | A | `id`, `order_id FK`, `provider`, `provider_ref UNIQUE NULL`, `amount_minor`, `status`, timestamps |
| `idempotency_records` | A | `id`, `user_id FK`, `request_key`, `order_id FK`, `request_hash`, timestamps; unique (`user_id`,`request_key`) |
| `shipments` | C | `id`, `order_id FK`, `carrier`, `tracking_number`, `status`, timestamps |
| `audit_logs` | D | `id`, `actor_id FK NULL`, `action`, `entity`, `entity_id`, `before JSONB`, `after JSONB`, `created_at` |

### 7.2 Phase-2 entities (not required to unblock core checkout)

- B: `size_guides` / `size_guide_ranges` per product or product family; `return_requests` and `return_items`.
- A: `wishlists`, `wishlist_items` (optional), `refunds` if implementing refund process.
- A or D: `outbox_events` can be owned by the module that needs reliable notifications with coordinated review. A shared migration location does not imply shared bonus credit.

**Relationship evidence required by course:**
- 1:N: `products → product_variants`, `users → orders`, `orders → order_items`.
- M:N: `products ↔ collections` through `product_collections`.

**Core data rules:**
- Product identity is NOT sellable SKU identity. Inventory always belongs to a **variant**.
- A published product may be out of stock; unlisted/archived products cannot be added to checkout.
- Historical order item prices/names/options are **snapshots**, not live joins for displayed purchase history.
- Never physically delete paid orders, payments, stock movements or audit logs. Use status changes; catalog DELETE means archive/soft-delete, documented as such.
- No real payment card data in the application database.
- Role enum is only four values; guest is not stored.

### 7.3 Dependency order for migrations

1. Roles/user accounts and `users`.
2. Catalog/category/collection/product/variant tables and bridge.
3. Addresses and carts.
4. Inventory balances and stock movements.
5. Orders/order items, then reservations/payments/idempotency records/shipments.
6. Audit, size guide and optional phase-2 tables.

Each person authors migrations for **their entities**, but the team maintains **one migration history** with consistent names/timestamps and resolves collisions before merge. CI runs migrations on an empty test database. Never use `synchronize: true`.

---

## 8. Frozen API conventions and initial endpoint contract — LOCKED

### 8.1 Cross-cutting conventions

- API root: `/api/v1`; JSON `camelCase`; IDs UUID; UTC timestamps; pagination `page` (1-based) + `limit` (default 20, max 100).
- `GET` is read, `POST` create/action, `PATCH` partial update, `DELETE` archive/delete where permitted.
- HTTP success: 200/201/204; failures: 400 DTO, 401 missing/invalid JWT, 403 forbidden, 404 missing or hidden resource, 409 conflict, 500 generic unexpected.
- Keep public list/detail routes distinct from protected staff mutations.
- Stable response:
  ```json
  {"success":true,"message":"OK","data":{},"meta":{"requestId":"uuid"}}
  ```
  Lists add `meta.pagination: {"page":1,"limit":20,"total":0,"totalPages":0}`.
- Stable error:
  ```json
  {"success":false,"message":"Validation failed","error":{"code":"VALIDATION_ERROR","details":[{"field":"quantity","message":"must be greater than 0"}]},"meta":{"requestId":"uuid"}}
  ```
- Password hash, secrets and internal payment-provider credentials must **never** appear in responses/logs.
- Swagger bootstrap at `/api/docs`; each developer documents the routes they own. Docs access may be restricted by environment.

### 8.2 Endpoints, ownership, access and first deliverable

| Owner | Method and path | Access | Outcome |
|---|---|---|---|
| D | `POST /auth/register` | Public | Creates only CUSTOMER |
| D | `POST /auth/login` | Public | Returns JWT access token |
| D | `GET /users/me` | Any logged-in user | Returns safe profile |
| D | `POST /admin/staff` | ADMIN | Creates STAFF / INVENTORY_MANAGER |
| D | `GET /admin/staff`, `GET /admin/staff/:id` | ADMIN | Paginated staff, detail |
| D | `PATCH /admin/staff/:id`, `DELETE /admin/staff/:id` | ADMIN | Update role/profile, deactivate (soft-delete) |
| D | `GET /admin/audit-logs` | ADMIN | Paginated audit events |
| A | `PATCH /users/me` | Authenticated owner | Update own profile |
| A | CRUD `/me/addresses` | CUSTOMER | Manage own addresses |
| A | `GET /me/cart` | CUSTOMER | Cart and live available products |
| A | `POST /me/cart/items` | CUSTOMER | Add SKU + quantity |
| A | `PATCH /me/cart/items/:itemId` | CUSTOMER | Change quantity |
| A | `DELETE /me/cart/items/:itemId` | CUSTOMER | Remove item |
| A | `POST /checkout` | CUSTOMER | Atomic pending order + reservation |
| A | `GET /me/orders`, `GET /me/orders/:id` | CUSTOMER | Own order history/detail |
| A | `POST /orders/:id/payment-session` | Order owner | Create simulated payment session (baseline) |
| A | `POST /webhooks/payments/mock` | Signed mock-provider callback (not customer JWT) | Verify HMAC/signature; confirm/fail payment; mock mode only |
| A | `POST /products/:productId/size-recommendation` | Public or CUSTOMER | Estimate size with caveats; no purchase effect |
| B | `GET /products`, `GET /products/:id` | Public | Published product catalog/detail |
| B | CRUD `/staff/products` | STAFF or ADMIN | Manage/soft-archive products |
| B | CRUD `/staff/categories` | STAFF or ADMIN | Manage categories |
| B | CRUD `/staff/collections` | STAFF or ADMIN | Manage collections |
| B | CRUD `/staff/products/:productId/variants` | STAFF or ADMIN | Manage product variants |
| B | `PATCH /staff/products/:id/publish` | STAFF or ADMIN | Validate and publish |
| C | `GET /inventory` | INVENTORY_MANAGER or ADMIN | Stock overview |
| C | `POST /inventory/receipts` | INVENTORY_MANAGER or ADMIN | Receive stock transaction + movement |
| C | `POST /inventory/adjustments` | INVENTORY_MANAGER or ADMIN | Adjust with reason and transaction |
| C | `GET /inventory/movements` | INVENTORY_MANAGER or ADMIN | Paginated stock history |
| C | `GET /fulfillment/orders` | INVENTORY_MANAGER or ADMIN | Eligible confirmed orders |
| C | `PATCH /fulfillment/orders/:id/pack` | INVENTORY_MANAGER or ADMIN | Mark packed |
| C | `POST /fulfillment/orders/:id/shipments` | INVENTORY_MANAGER or ADMIN | Create shipment and consume reservation |

> **REST notation:** `CRUD /staff/categories` expands into `POST /staff/categories`, `GET /staff/categories`, `GET /staff/categories/:id`, `PATCH /staff/categories/:id`, `DELETE /staff/categories/:id`, and similarly for the other full-CRUD entities. Public catalog GETs and staff GETs may return different fields.

**Phase-2 only, do not block initial merge:** Staff return approval endpoints; Customer return request endpoints; Inventory inspection; Admin analytics; customer wishlist; signed provider webhooks; full refund workflow; email queue.

### 8.3 Contract DTO examples

**Cart item creation:**
```json
{"variantId":"uuid","quantity":2}
```

**Checkout:**
```http
POST /api/v1/checkout
Authorization: Bearer <customer-jwt>
Idempotency-Key: 8f4d58b1-...   # unique request token
Content-Type: application/json
```
```json
{"addressId":"uuid"}
```

**Checkout success (`201`):**
```json
{"success":true,"message":"Order created","data":{"orderId":"uuid","status":"PENDING_PAYMENT","currency":"BDT","totalMinor":520000},"meta":{"requestId":"uuid"}}
```

**Stock adjustment:**
```json
{"variantId":"uuid","delta":5,"reason":"STOCK_COUNT_CORRECTION"}
```
Only inventory manager/admin can invoke it; every adjustment writes a stock movement row in the same transaction.

**Size recommendation (optional customer enhancement accepted by team):**
```json
{"heightCm":175,"weightKg":70}
```
```json
{"recommendedSize":"M","confidence":"LOW","reason":"Estimate based on the product size guide; measurements may fit differently by style.","availableSizes":["S","M","L"]}
```
Numbers/sizes above are **example output only**, never universal height/weight sizing standards.

---

## 9. Critical cross-domain services and transaction contract — LOCKED

### 9.1 Checkout: responsibility split

- B (Catalog) supplies `getPurchasableVariants(manager, variantIds)` including canonical price, status and SKU **read in the checkout transaction**. NO pricing logic is trusted from client.
- C (Inventory) supplies `reserveForOrder(manager, items, reservationExpiresAt)` using **the same transaction EntityManager** supplied by A. Lock inventory rows deterministically, check `on_hand - reserved >= requested`, update `reserved`, and create reservation rows. If a balance row does not yet exist, treat availability as **zero**.
- A (Checkout) owns orchestration: validate ownership/cart/address, get canonical prices, start DB transaction, create order/item snapshots, call inventory reservation in that transaction, store idempotency record, commit, and return pending order.
- D (Auth) supplies auth guard and validated user claims. It does not duplicate the checkout flow.

**No circular dependencies:** `CheckoutModule` imports read/service interfaces from Cart, Catalog, Orders and Inventory; Inventory must not import Checkout. For fulfillment, C uses an exported `OrdersService` state-transition method from A instead of direct writes to A-owned tables.

### 9.2 Inventory state, order state, payment state

```
available = onHand - reserved
```

**Order:** `PENDING_PAYMENT → CONFIRMED → PROCESSING → SHIPPED → DELIVERED`; cancellation/expiry only from permitted earlier states.  
**Reservation:** `ACTIVE → CONSUMED` (on shipment), `ACTIVE → RELEASED` (unpaid expiry/cancellation).  
**Payment:** `INITIATED → PENDING → PAID | FAILED`; never let customer set `PAID` in a request body.

**Baseline payment mode:** a controlled **mock/test provider** only. `POST /orders/:id/payment-session` creates a test session. A separately signed mock-provider request to `POST /webhooks/payments/mock` triggers the confirmation service after HMAC verification and event-id deduplication. Enable that route **only** when the payment provider is explicitly configured to mock mode; keep the signing key secret and restrict/rate-limit the endpoint. Customers cannot set payment status or send an unsigned `paid=true` field. No real card input or real financial claim. A real provider adapter is optional future work.

### 9.3 Concurrency and rollback acceptance test

- Seed `on_hand=1, reserved=0` for a variant.
- Two customers concurrently request checkout for one unit each.
- Exactly **one** reserve succeeds; other receives 409; `reserved <= on_hand` after both.
- Induce a failure after order item insert but before reservation commits; assert **no order, order items or reservations remain** from the failed transaction.
- Retry identical checkout with same user and idempotency key; get existing order, not a second order.

### 9.4 Inventory mutations

Stock receipt and adjustment use transaction + row locking and **write a stock movement event**. On shipment, in one transaction: validate fulfillment state, convert reservation to consumed, decrement `on_hand` and `reserved`, create shipment and update order state. On cancellation/expiry, release `reserved` but do not decrement `on_hand`.

### 9.5 Audit and notification design

Core audit service/table is owned by D, but domain owners call it for *their sensitive writes* with meaningful metadata and can implement independent audit features if they want audit bonus credit. Do not log passwords, payment secrets or full sensitive address snapshots. Emails are optional bonus and must not be sent before a DB transaction commits; a simple after-commit service is acceptable for demo, with outbox/job queue as improvement.

---

## 10. Size recommendation — agreed optional feature (NO paid AI)

Customer developer owns the rule-based recommendation endpoint. Staff developer owns the product-specific size guide records. Feature is **advisory**, not a guarantee and not used to automatically alter carts.

1. User supplies height and weight; optional chest/waist/hip measurements can be added later without changing the base contract.
2. Read the product's configured size guide; if no suitable guide exists, return an explicit **no-recommendation** response, not an invented universal size.
3. Compute a deterministic best-match/range score and present **confidence as LOW** when only height/weight are available.
4. Return a recommended size **only if represented by an active product variant**, and provide stock availability separately.
5. Validate plausible inputs and do not store body measurements by default; avoid collecting unnecessary sensitive data.
6. Unit-test boundary values and products with no guide, ambiguous fit, and missing sizes.

**No image upload, virtual try-on, generative AI or paid API** in v1.

---

## 11. Role-specific minimum acceptance checklists — LOCKED

### A — Customer developer
- [ ] Own-profile/address CRUD with owner-only access and DTO validation.
- [ ] Cart items CRUD scoped by user; reject inactive/nonexistent variants.
- [ ] Checkout creates order/items/reservations atomically, server-side price snapshots, idempotency.
- [ ] Own order list/detail with pagination and no cross-customer access.
- [ ] Mock payment session and safe test confirmation flow.
- [ ] Unit/integration tests for 400, 401, 403/404 ownership, insufficient stock 409, rollback, duplicate checkout.
- [ ] Rule-based size recommendation endpoint and no-guide fallback.

### B — Staff developer
- [ ] Full CRUD for product, variant, category, collection with DTOs/pagination and proper status codes.
- [ ] 1:N product → variants, M:N product ↔ collections, category FK.
- [ ] SKU uniqueness and 409 on duplicate; publishing rules.
- [ ] Catalog public GET shows only published products; staff routes locked to staff/admin.
- [ ] Exports `getPurchasableVariants` to checkout with authoritative prices/status.
- [ ] Unit/integration tests for unique conflicts, invalid inputs, archiving and forbidden access.
- [ ] Staff-managed size guide data for customer recommendations.

### C — Inventory developer
- [ ] Stock receipt and adjustment with transactions + stock movement history.
- [ ] Availability calculated `onHand - reserved`; stock never negative.
- [ ] Export `reserveForOrder(manager,...)`, `releaseForOrder(...)`, `consumeForShipment(...)` service methods.
- [ ] Confirm stock-locking test with two concurrent checkouts and failed transaction rollback.
- [ ] Fulfillment queue, pack/ship transitions, shipment tracking record.
- [ ] Tests for invalid quantity/role/variant, duplicate shipment and state conflicts.

### D — Admin developer
- [ ] One shared runtime auth system, public customer registration and login, bcrypt, JWT.
- [ ] Guards enforce four roles; no self-promotion to staff/admin; owner checks delegated to domains.
- [ ] Admin-only staff account create/list/read/update/deactivate; seeded admin setup.
- [ ] Safe public user responses; 401/403 demos; validation and consistent exceptions.
- [ ] Audit log browsing for admin; role/account events audited.
- [ ] Tests for invalid tokens, privilege escalation, locked/deactivated accounts and duplicate emails.

**Group-level release gate:** all five mandatory categories demonstrably work. Each developer must be able to explain and demo their authored contributions, not merely point to a shared implementation.

---

## 12. Optional bonus menu — not mandatory and not automatic credit

Choose bonuses individually and keep them inside your domain. Examples are suggestions; they can be swapped without altering locked contracts.

| Bonus | A — Customer candidate | B — Staff candidate | C — Inventory candidate | D — Admin candidate |
|---|---|---|---|---|
| Middleware | Checkout request-correlation/logger | Catalog mutation audit-context middleware | Inventory trace/actor context | Admin security event logger |
| Decorator | `@CustomerId()` | `@CatalogActor()` | `@InventoryActor()` | `@Actor()` / `@Roles()` authored & demonstrated |
| Mailer | Order confirmation email | Return decision email | Shipment email | Staff invite email |
| Swagger | Own customer endpoints annotated | Own catalog endpoints annotated | Own stock endpoints annotated | Own auth/admin endpoints annotated |
| Interceptor | Cart/order timing or sanitized view | Product response transform | Stock summary transform | Admin reporting transform |
| Audit log | Order lifecycle event write | Product/price change log | Stock movement audit | Employee role/status changes and audit viewer |
| Response manipulation | Customer order summary DTO/pagination | Catalog DTO/image URLs | Inventory availability projection | Staff report safe response |
| Advanced transaction | Checkout and idempotency | Multi-step catalog publication/linked entities when warranted | Row-locked stock reservation / shipment | Atomic staff role change + audit, when warranted |

**Never implement pointless or duplicate mechanisms just for points.** For each claimed bonus, record author, files, concrete API case, test, and demo proof in `docs/evidence/<member>/BONUS_EVIDENCE.md`. If a bonus would require a second global interceptor/filter or inconsistent API envelope, agree on its integration beforehand.

**Assumed team-common:** `.env.example` + configuration schema; shared migration history. Actual `.env` secrets are **per developer/per deployment**. Other shared runtime utilities are integration dependencies, not presumed shared grading credit.

---

## 13. Branching, merge and independent-deployment workflow — LOCKED

**Repository model:** ONE backend Git repository with `main` protected; four role/domain branches (e.g., `feature/customer-checkout`, `feature/staff-catalog`, `feature/inventory-stock`, `feature/admin-auth`). Everyone starts from the agreed scaffold, NOT NestCLI fresh projects.

**Build order across teammates:**
1. Agree on this SOT, bootstrap NestJS and env/config/migration tooling, pin dependencies.
2. D publishes AuthModule + JWT guard contract; B publishes ProductVariant and CatalogPricing service contract.
3. C publishes inventory balance and reservation service methods; A can build cart/addresses/orders with mock adapters until C's interface exists.
4. A integrates transactional checkout using B/C services; C integrates fulfillment using OrdersService; B adds size guides for A's size recommender.
5. Each member optionally adds chosen bonuses; merge only after tests pass.

**Pull request policy:**
- One feature per PR; state changed entities, endpoints, owner and migration IDs.
- No edits to another owner's entities/routes without explicit review.
- Changing paths, enum values, DTO fields, status transitions or response wrapper requires a short ADR and the affected owner's approval.
- Migration names must be unique; integration lead tests migration-up on empty database. Resolve concurrent generated migrations before merge.
- Require `npm ci`, lint, build, unit tests, integration tests and migration smoke test in CI.
- Do not commit `.env`, credentials, access tokens, DB dumps containing private data or production data.

**Individual deployment (reported oral bonus):** After merge, each of the four members independently deploys **the same full backend** from the same tagged/reviewed Git commit using their own Render account/workspace, **one free Render PostgreSQL DB in the same region as their web service**, and their own secrets. No one deploys only their role. Each demonstrates all four roles on their own URL and personally explains build, DB, migrations, seed, smoke tests and troubleshooting. The team's final integrated backend is the **same code**; an optional fifth demo deployment is not required and would need additional quota.

### 13.1 Default Render deployment contract — LOCKED

- **Initial easiest hosting:** Render `runtime: node`, `plan: free` + Render PostgreSQL `plan: free`; no Docker or Neon required. Blueprints can provision both from one `render.yaml` after backend scripts are implemented.
- `deployment/render.yaml` in this pack is a **template, not a deployed application**. Put it in the **actual backend repo root** as `render.yaml` only after implementing the named npm scripts and `/api/v1/health` route. Same blueprint can be linked separately in each member's Render workspace.
- Configure both resources in the **same region** (`singapore` in the example), connect `DATABASE_URL` via `fromDatabase.connectionString` (private database URL), set per-deployment `JWT_SECRET` and mock payment signing key, and do not commit actual credentials.
- Build: `npm ci && npm run build`. Start (academic single-instance free deployment): `npm run db:migrate:prod && npm run start:prod`. The team must first create and test `db:migrate:prod` (the exact compiled TypeORM DataSource path varies) and verify `start:prod` points at compiled `main.js`. **Do not assume these scripts already exist.**
- On a Free Render web service, `preDeployCommand` and shell/one-off jobs are not supported. For this **single-instance demo only**, migrations in the start command are an explicitly documented compromise; never seed on every startup. A real multi-instance deployment should use a separately controlled migration step.
- Bootstrap **demo accounts and catalog** with a one-time local `seed:demo` script, using a temporary connection to that member's Render PostgreSQL **external URL** and appropriate TLS settings, or through another secure one-time initialization method designed by the team. No hard-coded admin credentials or public setup endpoints.
- Route `GET /api/v1/health` must report 200; `/api/docs` exposes OpenAPI (guard it outside demos as needed). App binds to `process.env.PORT` and `0.0.0.0`.
- Each free Render Postgres instance expires **30 days after creation** (and has 1 GB storage, no backups); create near the demo and plan fresh database + migrations + seed for recreation. Free web service may sleep and has nonpersistent filesystem. Product images therefore must not depend on local disk; seed external image URLs for demo or use separate object storage later.
- Render Free web service blocks outbound SMTP ports 25/465/587: if anyone chooses the optional mailer bonus, use an HTTPS email API or demonstrate local SMTP separately and verify instructor acceptance. Never claim SMTP works on Render without testing.
- **Evidence per member:** service URL, deployment/log screenshot, migration/seed evidence, Swagger screenshot, successful test of all four roles, 400/401/403/404/409 examples, and an independently executed end-to-end demo. Never record real secrets.

See `DEPLOYMENT_RENDER.md` for detailed sequence, exact template location, readiness gate, failure recovery and platform references.

**Frontend later:** separate `thread-commerce-web` repository; only REST `/api/v1` consumption; generated OpenAPI types optional. No direct frontend imports of NestJS entities/services or database connection.

---

## 14. Definition of done & objective demos — LOCKED

A module PR is done only when it has:

- Compiling NestJS code in the integrated app, correct module exports and no circular dependency.
- DTO validation, guards, ownership/permission tests, consistent success and error responses.
- TypeORM entity + migration where schema changes; no `synchronize: true`.
- Test cases: success; bad input 400; unauthenticated 401; wrong-role 403; missing 404; relevant duplicate/state conflict 409.
- Appropriate pagination for lists and no raw SQL/string interpolation from requests.
- OpenAPI examples for its endpoints (if individual Swagger bonus is claimed, author and evidence shown).
- README and local demo instructions; no secrets committed.

**Group integration demo (must work end to end):**
1. Seed admin; admin logs in, creates staff/inventory manager; guest registers as customer.
2. Staff creates category, collection, product and size/color variants; publishes product.
3. Inventory manager receives stock for a SKU.
4. Customer adds SKU to cart, checks size recommendation, places order.
5. Checkout stores order snapshots and reserves stock atomically; simulated payment confirms.
6. Inventory manager picks/packs/ships; system consumes reservation correctly.
7. Customer reads only their own order; staff sees operational details; admin sees staff/audit.
8. Re-run malicious/invalid cases and concurrent last-item scenario; verify 400/401/403/404/409 and rollback.
9. Run migrations on a clean PostgreSQL database; show GitHub commit evidence. Every member claiming deployment demonstrates the **complete four-role application** on their **own Render web service + own Render PostgreSQL** using the same integrated commit.

### Course documentation deliverables

The **formal proposal** follows the guide's 2–3 page structure. The **final project report**, when the project exists, should follow its prescribed sections: background study; requirements analysis; use case + ER diagram; 1NF–3NF normalization; full API list; screenshots including failure cases; implementation highlights; conclusion/references. Proposal/report claims must match actual code and Swagger; no fabricated evidence.

---

## 15. Scope control, decisions and unknowns

**LOCKED:** business model, exactly four authenticated roles, tech stack, one NestJS backend, one DB schema per environment, IDs/price/pagination conventions, core entity names/relationships, checkout ownership/transaction flow, **Render web + Render PostgreSQL as easiest demo deployment**, full integrated project in each member deployment, separate frontend later, no paid try-on, rule-based size recommendation.

**OPEN / team may choose independently:** precise UI later; optional wishlist/support/returns completeness; individual bonus choices; logging library; how size ranges are scored; carrier name for fake shipments; noncritical DTO optional fields.

**PENDING INSTRUCTOR CONFIRMATION:**
1. Is the second shared bonus truly **Migrations**, alongside Env?
2. Are the five minimum requirements graded once per team or individually per member?
3. Faculty requires full-project deployment by each claimant; does independently deploying the same merged commit to four accounts satisfy individual marking?
4. Does documenting individual endpoints count for an individual Swagger bonus, or is separate setup expected?

Until answered, do **not** claim these policies as confirmed. Keep individual implementation evidence.

**Change-control rule:** If an LLM proposes a different endpoint, entity field, transaction order, role name or architecture, it must **ask to amend this SOT first**. Never silently fork the contract. Changes require version bump (`v1.1`, etc.) and teammate review.

---

## 16. Universal LLM handoff prompt (copy/paste with this file)

> You are implementing **one assigned domain** of THREAD, a NestJS/TypeORM/PostgreSQL single-brand fashion e-commerce backend. Treat the attached `PROJECT_SOURCE_OF_TRUTH.md` as binding. Do NOT redesign roles, rename existing entities/endpoints, start a separate NestJS project, duplicate AuthModule, or change another owner's contracts without flagging the conflict. First identify your owned modules, upstream dependencies, endpoints, entities, minimum acceptance tests and proposed **optional** bonus tasks. Then implement incrementally from the shared scaffold using the existing package-lock, DTO conventions, migrations, guards and API envelope. Provide complete file paths and ready-to-run code, tests, migration notes and Postman/Swagger validation. Don't claim code, marks or deployment is complete without running evidence. If a needed interface is unfinished, build behind the agreed method signature or use a typed test stub; do not invent a parallel architecture. For deployment, follow `DEPLOYMENT_RENDER.md` exactly: Render native Node + Render PostgreSQL, complete merged backend for each teammate, no Neon requirement or Docker prerequisite.

**Member-specific entry prompts:** `ROLE_CUSTOMER.md`, `ROLE_STAFF.md`, `ROLE_INVENTORY.md`, `ROLE_ADMIN.md`. These reference THIS SOT; only this file defines shared contracts.


---

## 17. Lecture alignment and beyond-lecture opportunities — v1.1 addendum

The supplied lecture materials cover TypeScript fundamentals; NestJS modules/controllers/services/dependency injection; DTO validation/pipes; file upload; PostgreSQL + TypeORM entities/CRUD/relations; bcrypt, sessions and guards; exceptions and mailer. Keep the familiar **Controller → Service → TypeORM Repository** separation and feature-folder conventions where reasonable.

The *project guideline* separately requires JWT/RBAC, multi-table transaction, complete related CRUD, validation and controlled exceptions; those are **mandatory** regardless of lecture depth. Demonstrable advances beyond the class examples include migrations (`synchronize: false`), verified JWT ownership checks, transaction rollback, inventory row locking and overselling tests, idempotent checkout, order state transitions, reliable payment simulation, coherent documentation, integration tests and deployable configuration. Do not adopt hardcoded database passwords/JWT secrets, public role assignment, raw password serialization or `synchronize: true` merely because a classroom example uses them.

**Course-code conflict to resolve before submitting:** the PDF lecture slide headers say `CSC 4182`, while the separately supplied October 2026 project guide says `CSC4161`. This pack follows the **project guide** for its academic proposal title, pending faculty verification.
