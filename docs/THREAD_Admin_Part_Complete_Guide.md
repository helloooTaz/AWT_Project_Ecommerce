# THREAD — Single-Brand Fashion Commerce REST API
## Admin Domain Comprehensive Technical Manual & Defense Guide

**System Role:** Developer D — Administrator & Security Infrastructure Owner  
**Course:** CSC4161 Advanced Programming in Web Technology  
**Project Repository:** THREAD Commerce API (NestJS + TypeScript + PostgreSQL + TypeORM)  
**Deliverable File:** `docs/THREAD_Admin_Part_Complete_Guide.doc` & `docs/THREAD_Admin_Part_Complete_Guide.md`

---

## 1. Executive Summary & Module Ownership

As **Developer D (Admin)**, you own the entire security, identity, role governance, and administrative oversight infrastructure for the THREAD application.

### Owned Modules:
1. **`auth`**: Authentication foundation, password hashing with bcrypt, JWT token signing, and Passport JWT validation strategy.
2. **`users` (Staff Administration)**: Complete CRUD lifecycle for staff and warehouse personnel, profile inspection (`/users/me`), and soft deactivations.
3. **`roles`**: Role-Based Access Control (RBAC) guard (`RolesGuard`) and custom metadata decorator (`@Roles()`).
4. **`audit`**: Centralized security audit log system (`audit_logs` table), recording before/after JSON snapshots, and administrative browsing endpoint (`/admin/audit-logs`).
5. **`analytics`**: Real-time platform KPI analytics (`/admin/analytics/summary`) providing user censuses, audit volume, and catalog/order aggregate metrics.

---

## 2. System Domain Boundaries & 4-Tier Architecture

| Domain / Role | Owner | Modules | Responsibilities & Boundaries |
| :--- | :--- | :--- | :--- |
| **Admin** | **Developer D (You)** | `auth`, `users`, `roles`, `audit`, `analytics` | Identity, RBAC, staff provisioning, audit trails, platform analytics. **Cannot** mutate inventory balances directly, alter product catalog prices, or bypass order state machines. |
| **Inventory Manager** | Developer C | `inventory`, `stock-movements`, `fulfillment`, `shipments` | SKU balance tracking (`on_hand`, `reserved`), intake receipts, stock adjustments, order pack/ship logistics. |
| **Customer** | Developer A | `accounts`, `addresses`, `cart`, `checkout`, `orders`, `payments`, `size-recommendations` | Customer address book, shopping cart, transactional multi-table checkout, unpaid order expiry worker, sizing advice. |
| **Staff (Merchandising)** | Developer B | `catalog`, `categories`, `collections`, `size-guides`, `returns` | Product catalog, SKUs, category taxonomy, seasonal collections, size chart measurement ranges, return reviews. |

---

## 3. Security & Authentication Architecture (`auth`)

### 3.1 Bcrypt Password Encryption
* **Salt Rounds:** `12` rounds via `bcrypt.hash(password, 12)` (exceeds the standard 10 rounds for high entropy).
* **Comparison:** `bcrypt.compare(candidatePassword, user.passwordHash)` runs in `AuthService.login()`.
* **Zero-Knowledge Sanitization:** Password hashes are excluded from all database queries returning user data (`select` blocks in TypeORM).

### 3.2 JSON Web Tokens (JWT)
* **Algorithm:** HMAC-SHA256 (`HS256`) with a cryptographically strong secret defined in `.env` and validated by `env.validation.ts`.
* **Token Expiry:** 1 day (`1d`).
* **Payload Claims:** `{ "sub": "<user_uuid>" }` (minimal footprint to avoid token bloat).
* **Passport JWT Strategy (`JwtStrategy`):**
  1. Extracts the Bearer token from the `Authorization` header.
  2. Decodes and verifies token signature and expiration.
  3. Validates the `sub` claim as a valid UUID.
  4. Queries the database to confirm the user exists and has `status = 'ACTIVE'`.
  5. Injects the authenticated user object (`{ id, role }`) into the Express request. If the user was deactivated, the request is immediately rejected with `401 Unauthorized`.

### 3.3 Privilege Escalation Prevention
* **Public Registration (`POST /api/v1/auth/register`):** Hardcodes `role: UserRole.CUSTOMER`. Any `role` property in the request body is stripped and ignored.
* **Staff Provisioning (`POST /api/v1/admin/staff`):** The only sanctioned way to create `STAFF`, `INVENTORY_MANAGER`, or `ADMIN` accounts. Protected by `JwtAuthGuard` and `RolesGuard` requiring the `ADMIN` role.

---

## 4. Role-Based Access Control (RBAC) & Custom Decorators (`roles`)

### 4.1 System Roles
* `ADMIN`: Full administrative and security governance.
* `INVENTORY_MANAGER`: Stock receipts, adjustments, order packing, and shipping.
* `STAFF`: Catalog curation, category hierarchy, size charts, return inspection.
* `CUSTOMER`: Storefront shopper actions (cart, checkout, addresses, order history).
* *Guest (Unauthenticated):* Catalog browsing, product search, login, registration.

### 4.2 Custom Decorators
1. **`@Roles(...)` Decorator (`src/modules/roles/roles.decorator.ts`):**
   Attaches required role metadata to controllers or route handlers.
2. **`RolesGuard` (`src/modules/roles/roles.guard.ts`):**
   Reads route metadata using NestJS `Reflector`. Checks if the calling user's role matches the required roles. Returns `403 Forbidden` if unauthorized.
3. **`@CurrentUser()` & `@Actor()` Decorators (`src/common/decorators/actor.decorator.ts`):**
   Extracts user identity, client IP, and User-Agent directly from execution context without boilerplate code in controllers.

---

## 5. Staff Account Administration (`users`)

All staff management endpoints are mounted under `/api/v1/admin/staff` and guarded by `ADMIN`:

| Method | Endpoint | Description | Audit Log Recorded |
| :--- | :--- | :--- | :--- |
| `POST` | `/admin/staff` | Create new staff or inventory account with email, name, password, and role. | `STAFF_CREATED` with full `after` state. |
| `GET` | `/admin/staff` | Paginated staff list with role, status, and search filters. | None (Read query). |
| `GET` | `/admin/staff/:id` | Detailed profile for single staff member by UUID. | None (Read query). |
| `PATCH` | `/admin/staff/:id` | Update staff full name, role, or status. | `STAFF_UPDATED` with `before` and `after` diffs. |
| `DELETE` | `/admin/staff/:id` | Soft-deactivate staff member (`status = INACTIVE`). | `STAFF_DEACTIVATED` with state change. |

---

## 6. Multi-Table Atomic Database Transactions

Every modifying operation in `UsersService` runs inside an atomic transaction using `this.dataSource.transaction(async manager => { ... })`:

```typescript
// src/modules/users/users.service.ts
return this.dataSource.transaction(async (manager) => {
  const userRepository = manager.getRepository(User);
  
  // 1. Create and save user record
  const user = await userRepository.save(
    userRepository.create({
      email,
      fullName: input.fullName.trim(),
      passwordHash,
      role: input.role,
      status: UserStatus.ACTIVE,
    }),
  );

  // 2. Insert audit log record using the same transaction manager
  await this.audit.record(
    {
      actorId,
      action: 'STAFF_CREATED',
      entity: 'users',
      entityId: user.id,
      after: {
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
      },
    },
    manager,
  );

  return user;
});
```

### Why This Matters for Defense:
* **Atomicity:** If the audit log insertion fails, the user is not saved (`ROLLBACK`).
* **Compliance:** Guaranteed that every administrative change has an immutable corresponding audit trail.

---

## 7. Security Audit Trail System (`audit`)

### 7.1 Database Table (`audit_logs`)
Created via migration `1794470400010-CreateAuditLogs.ts`:
* `id` (`uuid`, PK): Unique identifier.
* `actor_id` (`uuid`, FK -> `users.id` ON DELETE SET NULL): Who performed the action.
* `action` (`varchar(64)`): Action tag (e.g. `STAFF_CREATED`, `STAFF_UPDATED`, `STAFF_DEACTIVATED`).
* `entity` (`varchar(64)`): Modified table (`users`).
* `entity_id` (`varchar(64)`): ID of the affected record.
* `before` (`jsonb`): State snapshot prior to change.
* `after` (`jsonb`): State snapshot following change.
* `created_at` (`timestamptz`): UTC timestamp of the event.

### 7.2 Audit Log Browsing (`GET /api/v1/admin/audit-logs`)
Administrators can browse and filter system events with 1-based pagination (`page`, `limit`), filtering by `action`, `entity`, `actorId`, or `entityId`. Includes the populated actor relation (email, full name, role).

---

## 8. Platform Analytics & Reporting (`analytics`)

Endpoint `GET /api/v1/admin/analytics/summary` provides real-time system metrics using native SQL aggregations:

1. **User Counts:** Grouped by `role` and `status` (`ACTIVE` vs `INACTIVE`).
2. **Audit Metrics:** Total audit count and recent velocity (`INTERVAL '24 hours'`).
3. **System Totals:** Total commercial orders and product catalog entries.

---

## 9. Request Validation & Controlled Exception Handling

* **ValidationPipe:** Strips non-whitelisted attributes (`whitelist: true, forbidNonWhitelisted: true`). Returns clean field validation errors with status `400 Bad Request`.
* **HttpExceptionFilter:** 
  * Intercepts PostgreSQL unique violation `23505` and returns safe `409 Conflict` ("Email already registered").
  * Masks internal server errors, database connection strings, and stack traces from leaking to clients.
* **Success Envelope:** All endpoints wrap responses in a consistent JSON structure:
  ```json
  {
    "success": true,
    "message": "OK",
    "data": { ... },
    "meta": { "requestId": "...", "pagination": { ... } }
  }
  ```

---

## 10. Viva Defense Cheat Sheet

### Top 5 Examination Questions & Ready Answers:

**Q1: What exact modules and features did you develop?**  
*Answer:* "I developed Developer D's domain (Admin). My deliverables include the shared authentication foundation with bcrypt password hashing and JWT issuance, declarative RBAC guards with custom `@Roles()` and `@Actor()` decorators, staff account administration under `/admin/staff`, the centralized audit log system with JSONB before/after state capture, and platform analytics under `/admin/analytics/summary`."

**Q2: How do you prevent privilege escalation?**  
*Answer:* "Public customer registration (`POST /auth/register`) hardcodes the role to `CUSTOMER` and ignores any role parameter sent in the body. Staff and internal accounts can only be provisioned through `POST /admin/staff`, which is strictly protected by `JwtAuthGuard` and `RolesGuard` requiring `ADMIN` role."

**Q3: Where did you use database transactions?**  
*Answer:* "In `UsersService`, staff creation, profile updates, and soft-deactivations execute inside atomic database transactions using `this.dataSource.transaction(async manager => ...)`. The user record update and the audit log insertion execute in the same transaction. If audit logging fails, the user changes roll back immediately."

**Q4: Why did you use soft-delete instead of hard-delete for staff?**  
*Answer:* "Staff members are linked to historical orders, audit logs, and stock movements. Hard-deleting them would violate database foreign key constraints and destroy audit history. Instead, we set `status = INACTIVE`. `JwtStrategy` validates `status = ACTIVE` on every authenticated request, so deactivation revokes access instantly."

**Q5: What bonus features did you implement?**  
*Answer:* "I implemented 4 distinct bonus categories:
1. **Custom Decorators:** `@Actor()`, `@CurrentUser()`, and `@Roles()`.
2. **Audit Logging:** Dedicated `audit_logs` table with JSONB diffs and querying API.
3. **Advanced Database Transactions:** Atomic multi-table transactions in `UsersService`.
4. **OpenAPI / Swagger UI:** Full annotations on all admin endpoints at `/api/docs`."
