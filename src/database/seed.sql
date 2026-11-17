-- ============================================================================
-- THREAD — Single-Brand Fashion Commerce & Operations REST API
-- Database Seeding Data (PostgreSQL 14+)
-- File: seed.sql
-- Canonical Specification: PROJECT_SOURCE_OF_TRUTH.md (v1.0) & Academic Proposal
-- ============================================================================
-- All seeded credentials use the password: Password123!
-- Bcrypt Hash: $2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm
--
-- Account Directory:
-- 1. admin@thread.local          | Role: ADMIN              | System Administrator
-- 2. staff@thread.local          | Role: STAFF              | Sarah Khan (Merchandising)
-- 3. inventory@thread.local      | Role: INVENTORY_MANAGER  | Rafiqul Islam (Warehouse)
-- 4. customer1@thread.local      | Role: CUSTOMER           | Tahmid Rahman (Shopper 1)
-- 5. customer2@thread.local      | Role: CUSTOMER           | Nusrat Jahan (Shopper 2)
-- 6. inactive.staff@thread.local | Role: STAFF (INACTIVE)   | Deactivated Test Staff
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. CLEANUP (Idempotent: prevents duplicate key errors on repeated runs)
-- ----------------------------------------------------------------------------
TRUNCATE TABLE
    return_items, return_requests, wishlist_items, wishlists,
    audit_logs, shipments, idempotency_records, payments,
    stock_reservations, order_items, orders, cart_items, carts,
    stock_movements, inventory_balances, size_guide_ranges, size_guides,
    product_variants, product_collections, products, collections, categories,
    addresses, users
CASCADE;

-- ----------------------------------------------------------------------------
-- 1. USERS (Identity & Access Control — Owner D)
-- ----------------------------------------------------------------------------
INSERT INTO users (id, email, password_hash, full_name, role, status, created_at, updated_at) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin@thread.local', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', 'System Administrator', 'ADMIN', 'ACTIVE', NOW() - INTERVAL '30 days', NOW()),
('a0000000-0000-0000-0000-000000000002', 'staff@thread.local', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', 'Sarah Khan', 'STAFF', 'ACTIVE', NOW() - INTERVAL '25 days', NOW()),
('a0000000-0000-0000-0000-000000000003', 'inventory@thread.local', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', 'Rafiqul Islam', 'INVENTORY_MANAGER', 'ACTIVE', NOW() - INTERVAL '25 days', NOW()),
('a0000000-0000-0000-0000-000000000004', 'customer1@thread.local', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', 'Tahmid Rahman', 'CUSTOMER', 'ACTIVE', NOW() - INTERVAL '15 days', NOW()),
('a0000000-0000-0000-0000-000000000005', 'customer2@thread.local', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', 'Nusrat Jahan', 'CUSTOMER', 'ACTIVE', NOW() - INTERVAL '10 days', NOW()),
('a0000000-0000-0000-0000-000000000006', 'inactive.staff@thread.local', '$2b$10$EpRnTzVlqHNP0.fUbXUwSOyuiXe/QLSUG6xNekdHgTGmrpHEfIoxm', 'Former Staff Member', 'STAFF', 'INACTIVE', NOW() - INTERVAL '40 days', NOW());


-- ----------------------------------------------------------------------------
-- 2. ADDRESSES (Customer Shipping Addresses — Owner A)
-- ----------------------------------------------------------------------------
INSERT INTO addresses (id, user_id, recipient_name, phone, address_line1, address_line2, city, postal_code, country, is_default, created_at, updated_at) VALUES
('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'Tahmid Rahman', '+8801712345678', 'House 42, Road 11, Block D', 'Banani', 'Dhaka', '1213', 'Bangladesh', TRUE, NOW() - INTERVAL '14 days', NOW()),
('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'Tahmid Rahman', '+8801712345678', 'Flat 5B, Concord Tower', 'GEC Circle', 'Chattogram', '4000', 'Bangladesh', FALSE, NOW() - INTERVAL '12 days', NOW()),
('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'Nusrat Jahan', '+8801819876543', 'Apartment 3A, House 15, Sector 4', 'Uttara', 'Dhaka', '1230', 'Bangladesh', TRUE, NOW() - INTERVAL '9 days', NOW());


-- ----------------------------------------------------------------------------
-- 3. CATEGORIES & COLLECTIONS (Merchandising — Owner B)
-- ----------------------------------------------------------------------------
INSERT INTO categories (id, name, slug, description, is_active, created_at, updated_at) VALUES
('c0000000-0000-0000-0000-000000000001', 'Men''s Apparel', 'mens-apparel', 'Tailored shirts, trousers, and refined essentials for men.', TRUE, NOW() - INTERVAL '28 days', NOW()),
('c0000000-0000-0000-0000-000000000002', 'Women''s Apparel', 'womens-apparel', 'Contemporary tailoring, dresses, and modern outerwear for women.', TRUE, NOW() - INTERVAL '28 days', NOW()),
('c0000000-0000-0000-0000-000000000003', 'Footwear', 'footwear', 'Minimalist leather sneakers and understated daily shoes.', TRUE, NOW() - INTERVAL '28 days', NOW()),
('c0000000-0000-0000-0000-000000000004', 'Accessories', 'accessories', 'Premium canvas bags, leather goods, and minimalist accents.', TRUE, NOW() - INTERVAL '28 days', NOW());

INSERT INTO collections (id, name, slug, description, is_active, created_at, updated_at) VALUES
('d0000000-0000-0000-0000-000000000001', 'Summer Essentials 2026', 'summer-essentials-2026', 'Breathable natural fibers and relaxed silhouettes for warm climates.', TRUE, NOW() - INTERVAL '27 days', NOW()),
('d0000000-0000-0000-0000-000000000002', 'Minimalist Linen', 'minimalist-linen', '100% European flax linen garments tailored for daily ease.', TRUE, NOW() - INTERVAL '27 days', NOW()),
('d0000000-0000-0000-0000-000000000003', 'Urban Monochrome', 'urban-monochrome', 'Crisp whites, deep navies, and charcoal staples.', TRUE, NOW() - INTERVAL '27 days', NOW());


-- ----------------------------------------------------------------------------
-- 4. PRODUCTS (Catalog — Owner B)
-- ----------------------------------------------------------------------------
INSERT INTO products (id, category_id, name, slug, description, status, created_at, updated_at) VALUES
('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Classic Oxford Cotton Shirt', 'classic-oxford-cotton-shirt', 'A timeless button-down shirt woven from 100% combed long-staple cotton.', 'PUBLISHED', NOW() - INTERVAL '26 days', NOW()),
('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Relaxed Linen Chino Trousers', 'relaxed-linen-chino-trousers', 'Garment-dyed pure linen chinos with an elasticated drawstring waistband.', 'PUBLISHED', NOW() - INTERVAL '26 days', NOW()),
('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'Structured Oversized Wool Blazer', 'structured-oversized-wool-blazer', 'Lightweight tropical wool blend blazer featuring clean horn buttons.', 'PUBLISHED', NOW() - INTERVAL '26 days', NOW()),
('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', 'Minimalist Leather Low-Tops', 'minimalist-leather-low-tops', 'Handcrafted calfskin leather sneakers with vulcanized rubber sole.', 'PUBLISHED', NOW() - INTERVAL '26 days', NOW()),
('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', 'Heavyweight Everyday Canvas Tote', 'heavyweight-everyday-canvas-tote', 'Durable 16oz cotton canvas tote bag with reinforced handles.', 'PUBLISHED', NOW() - INTERVAL '26 days', NOW()),
('e0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 'Ribbed Merino Knit Polo', 'ribbed-merino-knit-polo', 'Extra-fine merino wool knitted polo shirt. (Draft preview item)', 'DRAFT', NOW() - INTERVAL '5 days', NOW()),
('e0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000002', 'Heritage Trench Coat', 'heritage-trench-coat', 'Double-breasted weatherproof cotton gabardine trench coat.', 'ARCHIVED', NOW() - INTERVAL '60 days', NOW());


-- ----------------------------------------------------------------------------
-- 5. PRODUCT_COLLECTIONS (M:N Bridge — Owner B)
-- ----------------------------------------------------------------------------
INSERT INTO product_collections (product_id, collection_id) VALUES
('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001'), -- Oxford -> Summer Essentials
('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003'), -- Oxford -> Urban Monochrome
('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001'), -- Linen Trousers -> Summer Essentials
('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002'), -- Linen Trousers -> Minimalist Linen
('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003'), -- Blazer -> Urban Monochrome
('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001'), -- Sneakers -> Summer Essentials
('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000003'), -- Sneakers -> Urban Monochrome
('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000001'); -- Tote -> Summer Essentials


-- ----------------------------------------------------------------------------
-- 6. PRODUCT_VARIANTS (Sellable SKUs — Owner B)
-- Currency: BDT minor units (poisha). E.g., 2,490.00 BDT = 249000
-- ----------------------------------------------------------------------------
INSERT INTO product_variants (id, product_id, sku, size, color, price_minor, is_active, created_at, updated_at) VALUES
-- Classic Oxford Shirt (Product 1)
('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'OXF-WHT-S', 'S', 'White', 249000, TRUE, NOW() - INTERVAL '25 days', NOW()),
('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'OXF-WHT-M', 'M', 'White', 249000, TRUE, NOW() - INTERVAL '25 days', NOW()),
('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 'OXF-WHT-L', 'L', 'White', 249000, TRUE, NOW() - INTERVAL '25 days', NOW()),
('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 'OXF-NVY-M', 'M', 'Navy', 249000, TRUE, NOW() - INTERVAL '25 days', NOW()),
('f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000001', 'OXF-NVY-L', 'L', 'Navy', 249000, TRUE, NOW() - INTERVAL '25 days', NOW()),

-- Relaxed Linen Trousers (Product 2)
('f0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000002', 'LNN-OLV-30', '30', 'Olive', 320000, TRUE, NOW() - INTERVAL '25 days', NOW()),
('f0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000002', 'LNN-OLV-32', '32', 'Olive', 320000, TRUE, NOW() - INTERVAL '25 days', NOW()), -- Dedicated concurrency race fixture (on_hand=1)
('f0000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000002', 'LNN-OLV-34', '34', 'Olive', 320000, TRUE, NOW() - INTERVAL '25 days', NOW()), -- Out-of-stock fixture (on_hand=0)
('f0000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000002', 'LNN-SND-32', '32', 'Sand', 320000, TRUE, NOW() - INTERVAL '25 days', NOW()),

-- Wool Blazer (Product 3)
('f0000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000000003', 'BLZ-CHR-S', 'S', 'Charcoal', 650000, TRUE, NOW() - INTERVAL '25 days', NOW()),
('f0000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000003', 'BLZ-CHR-M', 'M', 'Charcoal', 650000, TRUE, NOW() - INTERVAL '25 days', NOW()),

-- Leather Sneakers (Product 4)
('f0000000-0000-0000-0000-000000000012', 'e0000000-0000-0000-0000-000000000004', 'SNK-WHT-41', '41', 'White', 480000, TRUE, NOW() - INTERVAL '25 days', NOW()),
('f0000000-0000-0000-0000-000000000013', 'e0000000-0000-0000-0000-000000000004', 'SNK-WHT-42', '42', 'White', 480000, TRUE, NOW() - INTERVAL '25 days', NOW()),

-- Canvas Everyday Tote (Product 5)
('f0000000-0000-0000-0000-000000000014', 'e0000000-0000-0000-0000-000000000005', 'TOT-NAT-OS', 'OneSize', 'Natural', 145000, TRUE, NOW() - INTERVAL '25 days', NOW()),

-- Inactive Variant for testing validation/checkout rejection
('f0000000-0000-0000-0000-000000000015', 'e0000000-0000-0000-0000-000000000001', 'OXF-WHT-XL', 'XL', 'White', 249000, FALSE, NOW() - INTERVAL '25 days', NOW());


-- ----------------------------------------------------------------------------
-- 7. SIZE GUIDES & RANGES (Owner: Developer B — for Developer A's recommender)
-- ----------------------------------------------------------------------------
INSERT INTO size_guides (id, product_id, name, gender, description, created_at, updated_at) VALUES
('10000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Men''s Shirt Standard Fit Guide', 'MEN', 'Standard torso measurements for casual and business button-down shirts.', NOW() - INTERVAL '24 days', NOW()),
('10000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'Men''s Relaxed Trousers Size Guide', 'MEN', 'Waist and height sizing for drawstring relaxed linen chinos.', NOW() - INTERVAL '24 days', NOW());

INSERT INTO size_guide_ranges (id, size_guide_id, size_label, min_height_cm, max_height_cm, min_weight_kg, max_weight_kg, chest_cm, waist_cm, hip_cm, created_at) VALUES
-- Shirt ranges (S, M, L, XL)
('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'S', 160, 172, 55, 65, 92, 80, 94, NOW()),
('11000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'M', 170, 180, 65, 76, 98, 86, 100, NOW()),
('11000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'L', 178, 188, 75, 87, 106, 94, 108, NOW()),
('11000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'XL', 182, 195, 86, 100, 114, 102, 116, NOW()),

-- Trouser ranges (30, 32, 34)
('11000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', '30', 165, 175, 60, 68, NULL, 76, 92, NOW()),
('11000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', '32', 170, 182, 68, 78, NULL, 81, 98, NOW()),
('11000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', '34', 175, 188, 78, 88, NULL, 86, 104, NOW());


-- ----------------------------------------------------------------------------
-- 8. INVENTORY BALANCES (Owner C)
-- Invariant: available = on_hand - reserved. reserved <= on_hand.
-- Special Case: Variant LNN-OLV-32 (f...007) has on_hand=1, reserved=0 to
-- fulfill SOT §9.3 concurrency and rollback race test!
-- ----------------------------------------------------------------------------
INSERT INTO inventory_balances (id, variant_id, on_hand, reserved, updated_at) VALUES
('12000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 25, 0, NOW()),  -- OXF-WHT-S
('12000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 40, 2, NOW()),  -- OXF-WHT-M (2 reserved for active Order 1)
('12000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', 30, 0, NOW()),  -- OXF-WHT-L
('12000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000004', 20, 0, NOW()),  -- OXF-NVY-M
('12000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000005', 15, 0, NOW()),  -- OXF-NVY-L
('12000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000006', 10, 0, NOW()),  -- LNN-OLV-30
('12000000-0000-0000-0000-000000000007', 'f0000000-0000-0000-0000-000000000007', 1, 0, NOW()),   -- LNN-OLV-32 (SOT §9.3 CONCURRENCY TEST TARGET: on_hand=1, reserved=0)
('12000000-0000-0000-0000-000000000008', 'f0000000-0000-0000-0000-000000000008', 0, 0, NOW()),   -- LNN-OLV-34 (OUT OF STOCK TEST CASE)
('12000000-0000-0000-0000-000000000009', 'f0000000-0000-0000-0000-000000000009', 12, 0, NOW()),  -- LNN-SND-32
('12000000-0000-0000-0000-000000000010', 'f0000000-0000-0000-0000-000000000010', 8, 0, NOW()),   -- BLZ-CHR-S
('12000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-000000000011', 5, 0, NOW()),   -- BLZ-CHR-M
('12000000-0000-0000-0000-000000000012', 'f0000000-0000-0000-0000-000000000012', 15, 0, NOW()),  -- SNK-WHT-41
('12000000-0000-0000-0000-000000000013', 'f0000000-0000-0000-0000-000000000013', 18, 0, NOW()),  -- SNK-WHT-42
('12000000-0000-0000-0000-000000000014', 'f0000000-0000-0000-0000-000000000014', 50, 1, NOW()),  -- TOT-NAT-OS (1 reserved for pending Order 3)
('12000000-0000-0000-0000-000000000015', 'f0000000-0000-0000-0000-000000000015', 0, 0, NOW());   -- OXF-WHT-XL (Inactive variant)


-- ----------------------------------------------------------------------------
-- 9. STOCK MOVEMENTS (Audit Trail — Owner C)
-- ----------------------------------------------------------------------------
INSERT INTO stock_movements (id, variant_id, actor_id, type, quantity, reason, created_at) VALUES
('13000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'RECEIPT', 40, 'Initial supplier batch shipment PO-2026-081', NOW() - INTERVAL '20 days'),
('13000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000003', 'RECEIPT', 1, 'Sample stock intake for showroom verification', NOW() - INTERVAL '20 days'),
('13000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000003', 'RECEIPT', 9, 'Initial seasonal delivery of outerwear', NOW() - INTERVAL '15 days'),
('13000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000003', 'SHIPMENT_CONSUMED', -1, 'Fulfillment dispatch for historical Order 2', NOW() - INTERVAL '7 days'),
('13000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000003', 'RECEIPT', 50, 'Warehouse restock from local artisan supplier', NOW() - INTERVAL '10 days');


-- ----------------------------------------------------------------------------
-- 10. SHOPPING CARTS & ITEMS (Active Session state — Owner A)
-- ----------------------------------------------------------------------------
INSERT INTO carts (id, user_id, created_at, updated_at) VALUES
('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '2 days', NOW()),
('20000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', NOW() - INTERVAL '1 day', NOW());

INSERT INTO cart_items (id, cart_id, variant_id, quantity, created_at, updated_at) VALUES
-- Customer 1 cart has 1x Oxford White S and 1x Canvas Tote
('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 1, NOW() - INTERVAL '2 days', NOW()),
('21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000014', 1, NOW() - INTERVAL '1 day', NOW()),

-- Customer 2 cart has 1x Sneakers size 42
('21000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000013', 1, NOW() - INTERVAL '1 day', NOW());


-- ----------------------------------------------------------------------------
-- 11. ORDERS & ORDER ITEMS (Owner A)
-- Rule: Historical snapshots preserved immutable in JSONB and columns.
-- ----------------------------------------------------------------------------
-- Order 1: CONFIRMED (Paid, awaiting picking/packing)
-- Customer 1 bought 2x OXF-WHT-M @ 2490.00 BDT = 4,980.00 BDT (498000 minor units)
INSERT INTO orders (id, user_id, status, currency, total_minor, shipping_address_snapshot, created_at, updated_at) VALUES
('30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'CONFIRMED', 'BDT', 498000,
 '{"recipientName": "Tahmid Rahman", "phone": "+8801712345678", "addressLine1": "House 42, Road 11, Block D", "addressLine2": "Banani", "city": "Dhaka", "postalCode": "1213", "country": "Bangladesh"}'::jsonb,
 NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days');

INSERT INTO order_items (id, order_id, variant_id, sku_snapshot, name_snapshot, size_snapshot, color_snapshot, unit_price_minor, quantity, line_total_minor, created_at) VALUES
('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'OXF-WHT-M', 'Classic Oxford Cotton Shirt', 'M', 'White', 249000, 2, 498000, NOW() - INTERVAL '3 days');


-- Order 2: DELIVERED (Past completed order lifecycle)
-- Customer 2 bought 1x BLZ-CHR-S @ 6500.00 BDT = 6,500.00 BDT (650000 minor units)
INSERT INTO orders (id, user_id, status, currency, total_minor, shipping_address_snapshot, created_at, updated_at) VALUES
('30000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'DELIVERED', 'BDT', 650000,
 '{"recipientName": "Nusrat Jahan", "phone": "+8801819876543", "addressLine1": "Apartment 3A, House 15, Sector 4", "addressLine2": "Uttara", "city": "Dhaka", "postalCode": "1230", "country": "Bangladesh"}'::jsonb,
 NOW() - INTERVAL '8 days', NOW() - INTERVAL '5 days');

INSERT INTO order_items (id, order_id, variant_id, sku_snapshot, name_snapshot, size_snapshot, color_snapshot, unit_price_minor, quantity, line_total_minor, created_at) VALUES
('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000010', 'BLZ-CHR-S', 'Structured Oversized Wool Blazer', 'S', 'Charcoal', 650000, 1, 650000, NOW() - INTERVAL '8 days');


-- Order 3: PENDING_PAYMENT (Recently checked out, stock reserved, awaiting payment session confirmation)
-- Customer 1 checkout for 1x TOT-NAT-OS @ 1,450.00 BDT (145000 minor units)
INSERT INTO orders (id, user_id, status, currency, total_minor, shipping_address_snapshot, created_at, updated_at) VALUES
('30000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'PENDING_PAYMENT', 'BDT', 145000,
 '{"recipientName": "Tahmid Rahman", "phone": "+8801712345678", "addressLine1": "House 42, Road 11, Block D", "addressLine2": "Banani", "city": "Dhaka", "postalCode": "1213", "country": "Bangladesh"}'::jsonb,
 NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes');

INSERT INTO order_items (id, order_id, variant_id, sku_snapshot, name_snapshot, size_snapshot, color_snapshot, unit_price_minor, quantity, line_total_minor, created_at) VALUES
('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000014', 'TOT-NAT-OS', 'Heavyweight Everyday Canvas Tote', 'OneSize', 'Natural', 145000, 1, 145000, NOW() - INTERVAL '10 minutes');


-- ----------------------------------------------------------------------------
-- 12. STOCK RESERVATIONS (Owner C)
-- ----------------------------------------------------------------------------
-- Active reservation for Order 1 item (2 units of OXF-WHT-M)
INSERT INTO stock_reservations (id, order_item_id, variant_id, quantity, status, expires_at, created_at, updated_at) VALUES
('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 2, 'ACTIVE', NOW() + INTERVAL '24 hours', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
-- Active reservation for Order 3 pending payment (1 unit of TOT-NAT-OS)
('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000014', 1, 'ACTIVE', NOW() + INTERVAL '20 minutes', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes');


-- ----------------------------------------------------------------------------
-- 13. PAYMENTS (Owner A)
-- ----------------------------------------------------------------------------
INSERT INTO payments (id, order_id, provider, provider_ref, amount_minor, status, created_at, updated_at) VALUES
('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'MOCK', 'MOCK-PAY-202611-0001', 498000, 'PAID', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
('60000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'MOCK', 'MOCK-PAY-202611-0002', 650000, 'PAID', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),
('60000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'MOCK', 'MOCK-SESS-202611-0003', 145000, 'INITIATED', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes');


-- ----------------------------------------------------------------------------
-- 14. IDEMPOTENCY RECORDS (Owner A)
-- ----------------------------------------------------------------------------
INSERT INTO idempotency_records (id, user_id, request_key, order_id, request_hash, created_at) VALUES
('65000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', '8f4d58b1-customer1-checkout-001', '30000000-0000-0000-0000-000000000001', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', NOW() - INTERVAL '3 days');


-- ----------------------------------------------------------------------------
-- 15. SHIPMENTS (Fulfillment — Owner C)
-- ----------------------------------------------------------------------------
INSERT INTO shipments (id, order_id, carrier, tracking_number, status, created_at, updated_at) VALUES
('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'Steadfast Courier', 'ST-2026-DH-100234', 'DELIVERED', NOW() - INTERVAL '7 days', NOW() - INTERVAL '5 days');


-- ----------------------------------------------------------------------------
-- 16. AUDIT LOGS (Security & Governance — Owner D)
-- ----------------------------------------------------------------------------
INSERT INTO audit_logs (id, actor_id, action, entity, entity_id, before, after, created_at) VALUES
('80000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'USER_PROVISIONED', 'users', 'a0000000-0000-0000-0000-000000000002', NULL, '{"email": "staff@thread.local", "role": "STAFF", "status": "ACTIVE"}'::jsonb, NOW() - INTERVAL '25 days'),
('80000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'USER_PROVISIONED', 'users', 'a0000000-0000-0000-0000-000000000003', NULL, '{"email": "inventory@thread.local", "role": "INVENTORY_MANAGER", "status": "ACTIVE"}'::jsonb, NOW() - INTERVAL '25 days'),
('80000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'PRODUCT_PUBLISHED', 'products', 'e0000000-0000-0000-0000-000000000001', '{"status": "DRAFT"}'::jsonb, '{"status": "PUBLISHED"}'::jsonb, NOW() - INTERVAL '24 days'),
('80000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'STOCK_RECEIPT', 'inventory_balances', '12000000-0000-0000-0000-000000000002', '{"on_hand": 0}'::jsonb, '{"on_hand": 40}'::jsonb, NOW() - INTERVAL '20 days');


-- ----------------------------------------------------------------------------
-- 17. PHASE 2 ENTITIES: WISHLISTS & RETURNS (Optional Demonstration Fixtures)
-- ----------------------------------------------------------------------------
-- Customer 1 Wishlist with Linen Sand Trousers and Leather Sneakers
INSERT INTO wishlists (id, user_id, created_at) VALUES
('85000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', NOW() - INTERVAL '5 days');

INSERT INTO wishlist_items (id, wishlist_id, product_id, variant_id, created_at) VALUES
('86000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000009', NOW() - INTERVAL '5 days'),
('86000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000013', NOW() - INTERVAL '4 days');

-- Return Request by Customer 2 on delivered Order 2 (Blazer S)
INSERT INTO return_requests (id, order_id, user_id, status, reason, created_at, updated_at) VALUES
('90000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'REQUESTED', 'Sizing slightly snug across the shoulders, requesting size M exchange.', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days');

INSERT INTO return_items (id, return_request_id, order_item_id, quantity, condition_notes, inspection_status, created_at) VALUES
('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 1, 'Item unworn with original tags attached in factory garment bag.', 'PENDING', NOW() - INTERVAL '2 days');
