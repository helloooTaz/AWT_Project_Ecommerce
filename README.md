# Minimal THREAD

Minimal THREAD is a NestJS and PostgreSQL starter for the CSC4161 e-commerce backend. It runs with health, authentication, Customer shopping, Inventory management, Staff CRUD, public product browsing, and Admin account management.

## Run locally

Use Node.js 22 or newer, npm, and PostgreSQL. The optional Docker Compose service supplies a local PostgreSQL 16 instance.

1. Extract the ZIP and open a terminal in the `minimal-thread` directory.
2. Run `npm ci --ignore-scripts`.
3. Copy the environment template.

   ```powershell
   Copy-Item .env.example .env
   ```

   On Bash, use `cp .env.example .env`. Generate a secret and paste the result into `JWT_SECRET` in `.env`.

   ```sh
   node -p "require('node:crypto').randomBytes(32).toString('hex')"
   ```

4. Start the Compose database, or point the `DB_*` values at a fresh PostgreSQL database owned by the configured user. With an existing PostgreSQL installation, enter its actual port and credentials.

   ```sh
   docker compose up -d --wait db
   ```

   The Compose defaults use `127.0.0.1:5433` and the `minimal_thread` database. Use a different host port if 5433 is occupied. The example password is for local development.

5. Apply the migration and start the server.

   ```sh
   npm run migration:run
   npm run build
   npm start
   ```

   During development, use `npm run start:dev` for automatic restarts.

Open [Swagger UI](http://127.0.0.1:3000/api/docs). Run **GET /api/health** first. Register a customer in **POST /api/auth/register**, copy `data.accessToken`, and paste it in **Authorize**. Try **GET /api/auth/me** and **GET /api/admin/access**. The customer receives 403 on the Admin route and 401 on protected routes without a token.

To run Minimal THREAD alongside Current THREAD on port 3000, set `PORT=3001` in Minimal THREAD's local `.env` and use Swagger at `http://127.0.0.1:3001/api/docs`. Point `DB_*` at a separate Minimal THREAD database.

To try the Admin route, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` and run `npm run seed:admin` after migrating. Use a distinct email from the customer account. The seed can be rerun and preserves an existing active Admin and its password. Login through the same Swagger login route and authorize with the returned Admin token.

## Inventory

The **Inventory** section in Swagger lets Inventory Managers and Admins view stock, receive deliveries, adjust balances, and read movement history, including checkout sales. Use an existing variant ID.

## Staff catalog

Run `npm run migration:run` to apply collection activation before starting the updated app. Staff and Admin can manage categories, collections, products, and variants through the **Staff** sections in Swagger. The **Public Catalog** section shows active products with active variants and current prices. To try the purchasing workflow, create a variant as Staff, receive stock as Inventory Manager, and purchase it through Checkout as Customer.

## Admin

After seeding and signing in as Admin, use the **Admin** section in Swagger to create Staff and Inventory Manager accounts, list or update them, and deactivate them. Deactivation blocks login and protected requests while retaining the user's ID for historical Inventory movements.

## Verify and extend

```sh
npm run typecheck
npm test
npm run migration:show
npm run schema:check
```

The PostgreSQL tests exercise the real Nest app, migrated schema, and rollback behavior. Create a separate database named `minimal_thread_test`, owned by the configured `DB_USER`. If you use Compose with the example credentials, you can create it with `docker compose exec db createdb -U thread_app minimal_thread_test`. In PowerShell, migrate the test database and then restore the normal environment for the test command.

```powershell
$env:DB_NAME = 'minimal_thread_test'
npm run migration:run
Remove-Item Env:DB_NAME
$env:TEST_DB_NAME = 'minimal_thread_test'
npm run test:postgres
Remove-Item Env:TEST_DB_NAME
```

In Bash use `DB_NAME=minimal_thread_test npm run migration:run` and `TEST_DB_NAME=minimal_thread_test npm run test:postgres`. The app and migration CLI read `.env` from the project root, with shell environment variables taking precedence.

Use `npm run migration:generate -- src/database/migrations/MeaningfulName` after changing a canonical entity. `npm run migration:revert` rolls back the last applied migration and can remove data with its tables. Run migration rollback experiments against a disposable database.

Start with [AGENTS.md](AGENTS.md) for team boundaries and development conventions.
