# THREAD Commerce & Operations REST API
## Comprehensive Architectural Specification & System Documentation
**Course:** CSC 4161 / CSC 4182 (Advanced Programming in Web Technologies) | AIUB | Fall 2026-2027  
**Target Role Focus:** **Administrator (Role D)** & System Integration

---

## 1. Executive Summary & Problem Statement

Modern fashion and apparel retailers operate in high-velocity direct-to-consumer (DTC) environments with complex product matrices (e.g., styles, sizes, colors, and stock-keeping units / SKUs). When catalog updates, inventory reservations, customer carts, and checkout pipelines operate in disconnected silos, race conditions cause severe business failures: product overselling, stale pricing, phantom reservations, and inconsistent order ledgers.

**THREAD** is an enterprise-grade single-brand fashion e-commerce REST API built with NestJS, TypeScript, PostgreSQL, and TypeORM. It models end-to-end retail commerce with atomic multi-table transactions, four-role Role-Based Access Control (RBAC), immutable historical price/item snapshots, audit logging, and automated expiry mechanisms.

---

## 2. System Architecture & High-Level Design

The application employs a **Modular Monolith** architecture. Rather than introducing premature microservice complexity or building isolated fragmented applications, the entire system is hosted in a single cohesive NestJS runtime with strictly defined domain boundaries and zero circular dependencies.

### Core Architectural Principles:
* **Controller → Service → Repository**: Controllers handle HTTP serialization and Swagger docs; Services execute domain rules and transactional orchestration; TypeORM Repositories manage database persistence.
* **Immutable Snapshots**: Order items freeze variant names, SKU codes, sizes, colors, and unit prices at purchase time, ensuring historical purchases remain accurate even if catalog prices change later.
* **Integer Minor Units (BDT)**: Monetary values are strictly stored as integer minor units (e.g., 250,000 BDT minor units = 2,500.00 BDT) to eliminate floating-point rounding errors.
* **Strict Schema Migrations**: Automatic schema synchronization is disabled (`synchronize: false`). The relational schema is versioned across 11 migration files in `src/database/migrations`.
* **UUID Primary Keys**: All entities use cryptographic UUIDs (`gen_random_uuid()`) to prevent sequential ID guessing and enumeration attacks.

---

## 3. User Roles & Role-Based Access Control (RBAC)

THREAD enforces four authenticated roles plus an unauthenticated Guest browsing mode:

| Role / Actor | Allowed Capabilities | Explicit Restrictions & Boundaries |
| :--- | :--- | :--- |
| **Guest** | Public catalog browsing, product search/filter, customer registration, and login. | Cannot view customer orders, cart, or access private endpoints. |
| **`CUSTOMER`** | Manage delivery addresses, cart items, checkout, personal order history, rule-based size advice. | Cannot alter product prices, modify stock balances, or inspect other users' data. |
| **`STAFF`** | CRUD on products, variants, categories, collections, and size guides; publish products. | Cannot mutate stock balances, promote users, or modify payment statuses directly. |
| **`INVENTORY_MANAGER`** | Receive inventory receipts, execute stock count adjustments, process pack/ship logistics. | Cannot modify catalog prices, change account roles, or initiate customer refunds. |
| **`ADMIN`** (Your Role) | Create and deactivate staff accounts, reassign roles, browse system audit logs, and view platform analytics. | Must operate through authorized business invariants and cannot bypass financial transaction rules. |

---

## 4. Module Breakdown by Team Ownership

| Developer / Role | Owned Modules & Entities | Primary Business Outcomes |
| :--- | :--- | :--- |
| **Developer A (Customer)** | `accounts`, `addresses`, `cart`, `checkout`, `orders`, `payments`, `size-recommendations` | Customer address CRUD, user-scoped carts, transactional checkout, order snapshots, background unpaid-order expiry worker, simulated mock payments, and rule-based sizing. |
| **Developer B (Staff)** | `catalog`, `categories`, `collections`, `size-guides` | Product catalog management, variant SKU uniqueness, category hierarchy, collection bridges (M:N), and size-guide measurement brackets. |
| **Developer C (Inventory)** | `inventory`, `stock-movements`, `fulfillment`, `shipments` | SKU balance tracking (`on_hand`, `reserved`), row-locked reservation APIs, append-only stock movement logs, order packing, and shipping dispatch. |
| **Developer D (Admin — You)** | `auth`, `users`, `roles`, `audit`, `analytics` | Authentication foundation (JWT + bcrypt), RBAC guards, staff account administration, transactional audit logging, platform operational analytics, and admin seed script. |

---

## 5. Request & Response Lifecycle Pipeline

Every incoming HTTP request traverses a standardized NestJS middleware, guard, pipe, and interceptor pipeline:
1. **RequestLoggingMiddleware**: Mounts before route handlers; generates a unique UUID `X-Request-ID` header, tracks latency, and logs client requests cleanly.
2. **JwtAuthGuard & Passport Strategy**: Validates the Bearer token in the `Authorization` header; decodes claims and populates `req.user`.
3. **RolesGuard**: Reads role metadata specified by the `@Roles(...)` decorator and denies access with a safe `403 Forbidden` if the user lacks the required role.
4. **ValidationPipe**: Strips unwhitelisted properties (`whitelist: true, forbidNonWhitelisted: true`) and returns client-safe `400 Bad Request` with field-level validation errors.
5. **HttpExceptionFilter**: Catches all exceptions (including PostgreSQL error code `23505` for unique violations) and wraps them into a unified, non-leaking error envelope.

---

## 6. Critical ACID Database Transactions (Course Requirement M2)

### Scenario 1: High-Concurrency Customer Checkout
1. Customer sends `POST /api/v1/checkout` with an `Idempotency-Key` header.
2. Validates delivery address ownership and cart contents.
3. Starts a database transaction via `DataSource.transaction()`.
4. Fetches authoritative prices from the catalog (ignoring client-side prices).
5. Acquires **pessimistic row locks** (`SELECT FOR UPDATE`) on all variant balance rows.
6. Verifies `on_hand - reserved >= requested_quantity` for each item.
7. Increments `reserved` stock and inserts `stock_reservations` with an expiration timestamp.
8. Inserts the `orders` row (status: `PENDING_PAYMENT`) and frozen `order_items` snapshots.
9. Empties the customer's cart and saves an idempotency record.
10. Commits the transaction. If two customers simultaneously check out the last remaining item, exactly one succeeds and the other receives `409 Conflict` (insufficient stock). If any operation fails, all changes roll back immediately.

### Scenario 2: Admin Staff Lifecycle & Audit Logging (Your Feature)
Whenever an Administrator creates, updates, or deactivates a staff member in `UsersService`:
1. Opens an explicit transaction via `this.dataSource.transaction(async manager => ...)`.
2. Saves or updates the staff user entity.
3. Calls `AuditService.record(..., manager)` to insert an immutable audit trail entry containing the actor's ID, action code (e.g., `STAFF_CREATED`, `STAFF_UPDATED`, `STAFF_DEACTIVATED`), and JSON snapshots of `before` and `after` states.
4. Both operations commit simultaneously. If the audit log fails to record, the staff account change is completely rolled back, guaranteeing an unalterable audit trail.

---

## 7. Admin Domain Endpoints Reference (Role D)

| Endpoint | HTTP Method | Access | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/auth/register` | POST | Public | Registers a new customer. Role is strictly forced to `CUSTOMER`. |
| `/api/v1/auth/login` | POST | Public | Verifies credentials against bcrypt password hashes and issues a JWT Bearer token. |
| `/api/v1/users/me` | GET | Any Authenticated | Returns safe user profile (excluding password hash) for the current caller. |
| `/api/v1/admin/staff` | POST | ADMIN | Creates a new `STAFF` or `INVENTORY_MANAGER` account with an audited record. |
| `/api/v1/admin/staff` | GET | ADMIN | Returns paginated list of staff accounts with optional filtering by role and status. |
| `/api/v1/admin/staff/:id` | GET | ADMIN | Retrieves detailed profile information for a specific staff member. |
| `/api/v1/admin/staff/:id` | PATCH | ADMIN | Updates staff name, role, or status with before/after state capture in audit logs. |
| `/api/v1/admin/staff/:id` | DELETE | ADMIN | Deactivates (soft-deletes) staff member by setting status to `INACTIVE` and writes audit log. |
| `/api/v1/admin/audit-logs` | GET | ADMIN | Browses paginated system audit log entries with filter options (by action, entity, actor). |
| `/api/v1/admin/analytics/summary` | GET | ADMIN | Returns high-level platform statistics: user counts by role/status, audit volume, and catalog/order totals. |

---

## 8. Staff & Catalog Domain Endpoints Reference (Role B — Utso)

| Endpoint | HTTP Method | Access | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/products` | GET | Public | Paginated list of published products with active variants and price formatting. |
| `/api/v1/products/:id` | GET | Public | Detailed published product view with active variants, category, and collections. |
| `/api/v1/categories` | GET | Public | Browsable active categories list. |
| `/api/v1/collections` | GET | Public | Browsable active marketing collections list with product links. |
| `/api/v1/products/:id/size-guide` | GET | Public | Public measurement brackets and fit guide for a product. |
| `/api/v1/staff/products` | POST | STAFF, ADMIN | Creates product in `DRAFT` status with optional initial variants in an atomic transaction. |
| `/api/v1/staff/products` | GET | STAFF, ADMIN | Paginated list of all products across all statuses (`DRAFT`, `PUBLISHED`, `ARCHIVED`). |
| `/api/v1/staff/products/:id` | GET | STAFF, ADMIN | Full product detail including inactive variants and audit metadata. |
| `/api/v1/staff/products/:id` | PATCH | STAFF, ADMIN | Updates product title, description, category, and collections. |
| `/api/v1/staff/products/:id` | DELETE | STAFF, ADMIN | Soft-archives product (status set to `ARCHIVED`) and audits event. |
| `/api/v1/staff/products/:id/publish` | PATCH | STAFF, ADMIN | Validates active variant existence and transitions product to `PUBLISHED`. |
| `/api/v1/staff/products/:id/variants` | POST | STAFF, ADMIN | Adds SKU variant with size, color, and price (checks unique SKU). |
| `/api/v1/staff/products/:id/variants` | GET | STAFF, ADMIN | Lists all variants for a product. |
| `/api/v1/staff/products/:id/variants/:variantId` | PATCH | STAFF, ADMIN | Updates variant details; automatically audits price mutations with before/after diffs. |
| `/api/v1/staff/products/:id/variants/:variantId` | DELETE | STAFF, ADMIN | Deactivates variant (`isActive: false`) and audits mutation. |
| `/api/v1/staff/categories` | CRUD | STAFF, ADMIN | Full category lifecycle management (prevents deletion if products linked). |
| `/api/v1/staff/collections` | CRUD | STAFF, ADMIN | Full collection lifecycle and M:N product mapping management. |
| `/api/v1/staff/products/:id/size-guide` | CRUD | STAFF, ADMIN | Manages product size guides and measurement range brackets. |
| `/api/v1/staff/returns` | GET, PATCH | STAFF, ADMIN | Browses return requests and approves/rejects customer return tickets. |

---

## 9. Project Dependencies & Libraries

| Package | Purpose & Operational Function |
| :--- | :--- |
| `@nestjs/core`, `@nestjs/common` | Core NestJS framework, dependency injection, lifecycle management, controllers, and services. |
| `@nestjs/typeorm`, `typeorm` | Database ORM providing entity mapping, migrations, query builders, and transaction managers. |
| `pg` | Low-level PostgreSQL connection and communication driver. |
| `@nestjs/jwt`, `passport-jwt` | JSON Web Token issuance, signing, and bearer authentication strategy integration. |
| `bcrypt` | One-way cryptographic password hashing using 12 salt rounds. |
| `class-validator`, `class-transformer` | Decorators for DTO validation and input transformation. |
| `@nestjs/swagger` | Automated OpenAPI specification generation and Swagger interactive documentation. |
| `joi` | Schema-based environment variable validation on server bootstrap. |
| `nodemailer` | Email delivery transport for customer order confirmations. |
| `jest`, `supertest` | Unit testing framework and HTTP integration/E2E test assertion harness. |

---

## 10. Viva Defense & Examination Guide

### Administrator (Role D) Q&A:
1. **Q: What was your individual contribution to the group project?**  
   *A: "I owned the **Admin** domain (Developer D). My deliverables include the shared authentication foundation with bcrypt password hashing and JWT token issuance, RBAC guards with the custom `@Roles()` and `@Actor()` decorators, complete staff account management (`/admin/staff`), the centralized audit log system with before/after diff tracking (`audit_logs` table and `/admin/audit-logs`), and administrative platform analytics."*

2. **Q: How did you implement database transactions in your domain?**  
   *A: "In `UsersService`, staff creation, role modification, and deactivation run inside an atomic database transaction using `this.dataSource.transaction()`. The user record update and the audit log insertion execute in the same transaction. If audit logging fails, the user changes roll back immediately."*

3. **Q: How do you prevent privilege escalation?**  
   *A: "Public registration (`POST /auth/register`) hardcodes the role to `CUSTOMER` and ignores any role parameter in the body. Staff accounts can only be created by an authenticated administrator through `POST /admin/staff`, which is protected by `JwtAuthGuard` and `RolesGuard` with `@Roles([UserRole.ADMIN])`."*

4. **Q: Why do you store money in integer minor units?**  
   *A: "Standard floating-point numbers in computers suffer from IEEE 754 precision issues (e.g., 0.1 + 0.2 = 0.30000000000000004). Storing money as integer minor units (such as 250,000 for 2,500.00 BDT) guarantees exact arithmetic with zero rounding error."*

---

### Staff & Catalog Developer (Role B — Utso) Q&A:
1. **Q: What was your individual contribution to the group project?**  
   *A: "I owned the **Staff** domain (Developer B). My deliverables include full CRUD and lifecycle management for the catalog (`products` and `product_variants`), taxonomy management (`categories` and `collections`), the Many-to-Many bridge table (`product_collections`), size-guide measurement brackets (`size_guides` and `size_guide_ranges`), and customer return ticket review (`return_requests`). I also authored the `@StaffActor()` custom decorator, the `CatalogPriceTransformInterceptor` for response manipulation, and transactional auditing across catalog mutations."*

2. **Q: How did you model the Many-to-Many (M:N) relationship between Products and Collections?**  
   *A: "In TypeORM, I defined `@ManyToMany(() => Collection)` on `Product` and `@ManyToMany(() => Product)` on `Collection`, mapped through a dedicated bridge table `product_collections` via `@JoinTable`. The table has composite primary keys (`product_id`, `collection_id`) with cascading foreign keys, allowing a product to belong to multiple curated seasonal drops and collections to host multiple products."*

3. **Q: How do you enforce business rules during product publishing?**  
   *A: "In `CatalogService.publishProduct()`, before transitioning a product status from `DRAFT` to `PUBLISHED`, the service verifies that the product has at least one active variant with a positive price (`priceMinor > 0`). If no valid sellable variants exist, it rejects the request with a `400 Bad Request`. When successful, it records a `PRODUCT_PUBLISHED` audit log."*

4. **Q: What bonus features did you individually implement for the Staff role?**  
   *A: "I implemented three core bonuses:
   1. **Response Manipulation / Interceptor**: `CatalogPriceTransformInterceptor` intercepts product endpoints, converts integer minor units (e.g., 250,000) into formatted currency strings ('2,500.00 BDT'), and calculates aggregated `pricingSummary` (`minPrice`, `maxPrice`) and `variantCount` on the fly.
   2. **Advanced Multi-Table Transactions**: `CatalogService.createProduct()` creates a product, multiple initial SKU variants, and records an audit log atomically inside `this.dataSource.transaction()`. If any variant has a duplicate SKU, everything rolls back.
   3. **Audit Log Integration & Custom Decorator**: Every variant price update triggers `VARIANT_PRICE_CHANGED` in `audit_logs` capturing before/after price values. Controller endpoints use `@StaffActor()` to cleanly inject authenticated staff metadata."*
