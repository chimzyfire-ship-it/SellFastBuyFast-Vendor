# Technical Handoff: Pro Product Studio & Shopper Mobile Simulator Architecture

**Document ID:** `SFBF-HANDOFF-CATALOG-STUDIO-V2`  
**Target Role:** Senior Backend / Platform Engineer  
**Scope:** Core API (`services/core-api`), PostgreSQL / Supabase Ledger, and Marketplace Catalog Engine  
**Status:** Ready for Backend Implementation & Integration  

---

## 1. Executive Summary & Purpose

The **Product Studio** in the SellFastBuyFast Vendor Workspace has been upgraded to a pro-tier marketplace listing creator with an interactive **Shopper Mobile Simulator**. 

To support high-velocity e-commerce operations in Nigeria, the backend catalog engine must fulfill five mission-critical mandates:
1. **Multi-Variant Matrix Generation:** Support products with multiple SKU variants (e.g. Footwear sizes `EU 39–45`, colors `Black, Brown, Tan`), individual pricing, and isolated stock quantities.
2. **Two-Phase Inventory Reservation:** Prevent overselling during simultaneous shopper checkouts via pessimistic concurrency locks (`SELECT ... FOR UPDATE`).
3. **Automated Escrow & Commission Settlement:** Compute platform escrow commission (standard 5%) and hold funds in double-entry bookkeeping ledgers until courier delivery proof + 7-day buyer return inspection window expires.
4. **Operations Moderation State Machine:** Enforce strict listing quality verification (`draft` $\to$ `pending_approval` $\to$ `published` / `rejected`).
5. **Rich Attribute Taxonomy & Search Discovery:** Store condition (`brand_new`, `open_box`, `refurbished`), dimensions, shipping weight (in kg, required for GIGL/DHL automated shipping tier calculations), warranty, and return policies.

---

## 2. PostgreSQL Relational Schema & DDL

Execute the following DDL migration in `supabase/migrations/20260903000005_pro_product_studio_variants.sql` to establish complete database support:

```sql
-- 1. Product Listing Table with Taxonomy & Shipping Metadata
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICTED,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICTED,
    title VARCHAR(180) NOT NULL,
    brand VARCHAR(100) NOT NULL DEFAULT 'SellFast Signature',
    condition VARCHAR(30) NOT NULL DEFAULT 'brand_new' CHECK (condition IN ('brand_new', 'open_box', 'refurbished')),
    description TEXT NOT NULL,
    compare_price_minor BIGINT NULL CHECK (compare_price_minor IS NULL OR compare_price_minor > 0),
    weight_kg NUMERIC(6, 2) NOT NULL DEFAULT 0.85 CHECK (weight_kg > 0),
    dimensions_cm VARCHAR(60) NOT NULL DEFAULT '33 × 21 × 12',
    return_policy VARCHAR(50) NOT NULL DEFAULT '7_day_escrow' CHECK (return_policy IN ('7_day_escrow', 'inspection_only')),
    warranty VARCHAR(50) NOT NULL DEFAULT '30_days' CHECK (warranty IN ('no_warranty', '30_days', '6_months', '1_year')),
    tags TEXT[] DEFAULT '{}',
    status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'published', 'rejected', 'archived')),
    rejection_reason TEXT NULL,
    moderated_by UUID NULL REFERENCES auth.users(id),
    moderated_at TIMESTAMPTZ NULL,
    quality_score INT DEFAULT 100 CHECK (quality_score BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full-text search index for high-performance shopper search
CREATE INDEX IF NOT EXISTS idx_products_search 
ON public.products USING GIN (to_tsvector('english', title || ' ' || brand || ' ' || description));

CREATE INDEX IF NOT EXISTS idx_products_merchant_status 
ON public.products(merchant_id, status);

-- 2. Multi-Variant SKU Matrix Table
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    sku VARCHAR(64) NOT NULL UNIQUE,
    title VARCHAR(100) NOT NULL DEFAULT 'Default', -- e.g. "EU 42 / Black"
    option_size VARCHAR(20) NULL,
    option_color VARCHAR(30) NULL,
    price_minor BIGINT NOT NULL CHECK (price_minor > 0), -- Stored in kobo (₦100 = 10,000 kobo)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variants_product 
ON public.product_variants(product_id);

-- 3. Dedicated Inventory Levels Table (High-Concurrency Safe)
CREATE TABLE IF NOT EXISTS public.inventory_levels (
    variant_id UUID PRIMARY KEY REFERENCES public.product_variants(id) ON DELETE CASCADE,
    available_quantity INT NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
    reserved_quantity INT NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    low_stock_threshold INT NOT NULL DEFAULT 3 CHECK (low_stock_threshold >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. High-Resolution Media Gallery
CREATE TABLE IF NOT EXISTS public.product_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type VARCHAR(20) NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
    alt_text VARCHAR(180) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_product_sort 
ON public.product_media(product_id, sort_order ASC);
```

---

## 3. High-Concurrency Inventory Reservation Engine

During customer checkout, the shopper mobile app attempts to reserve stock across multiple variants. To guarantee that two customers cannot purchase the final pair of Size 42 Oxford shoes simultaneously:

```typescript
// services/core-api/src/modules/inventory/inventory.service.ts

import { PoolClient } from 'pg';

export interface CartItemReservation {
  variantId: string;
  quantity: number;
}

export async function reserveVariantInventory(
  client: PoolClient,
  items: CartItemReservation[],
  orderId: string
): Promise<void> {
  // Sort by variantId to prevent deadlocks across concurrent database transactions
  const sortedItems = [...items].sort((a, b) => a.variantId.localeCompare(b.variantId));

  for (const item of sortedItems) {
    // Acquire row-level lock immediately
    const res = await client.query(
      `SELECT available_quantity, reserved_quantity 
       FROM public.inventory_levels 
       WHERE variant_id = $1 
       FOR UPDATE`,
      [item.variantId]
    );

    if (res.rows.length === 0) {
      throw new Error(`Inventory record not found for variant: ${item.variantId}`);
    }

    const current = res.rows[0];
    if (current.available_quantity < item.quantity) {
      throw new Error(
        `Insufficient stock for variant ${item.variantId}. Available: ${current.available_quantity}, Requested: ${item.quantity}`
      );
    }

    // Atomic stock decrement and reservation
    await client.query(
      `UPDATE public.inventory_levels 
       SET available_quantity = available_quantity - $1,
           reserved_quantity = reserved_quantity + $1,
           updated_at = NOW() 
       WHERE variant_id = $2`,
      [item.quantity, item.variantId]
    );

    // Audit trail log
    await client.query(
      `INSERT INTO public.inventory_transactions 
       (variant_id, reference_type, reference_id, delta_available, delta_reserved, reason) 
       VALUES ($1, 'checkout_reservation', $2, -$3, +$3, 'Customer checkout reservation')`,
      [item.variantId, orderId, item.quantity]
    );
  }
}
```

---

## 4. Escrow Commission & Payout Calculations

The frontend Shopper Simulator computes the merchant net payout in real time using a standard **5% platform escrow commission rate**.

### Mathematical Model
For any item with Retail Selling Price $P$ (in kobo):
$$\text{Platform Commission} = \text{round}(P \times 0.05)$$
$$\text{Merchant Net Settlement} = P - \text{Platform Commission}$$

### Escrow Ledger Lifecycle
1. **Order Placed & Paid (Paystack/Card):**
   - Buyer pays: $P + \text{Delivery Fee}$.
   - Ledger Debit: `ASSET:PAYSTACK_COLLECTION`.
   - Ledger Credit: `LIABILITY:CUSTOMER_ESCROW_HOLDING` (Total Amount).
2. **Order Delivered & Signed by Courier:**
   - Courier submits delivery proof (waybill/photo).
   - 7-Day return window initiates.
3. **Escrow Release (Settlement Payout):**
   - Ledger Debit: `LIABILITY:CUSTOMER_ESCROW_HOLDING` ($P$).
   - Ledger Credit: `REVENUE:MARKETPLACE_COMMISSION` ($0.05 \times P$).
   - Ledger Credit: `LIABILITY:MERCHANT_SETTLEMENT_BALANCE` ($0.95 \times P$).

---

## 5. Operations Moderation State Machine

All new or updated product listings submitted with `submitForReview: true` enter the Operations moderation queue.

```
       ┌────────────────────────┐
       │         DRAFT          │
       └───────────┬────────────┘
                   │ Vendor clicks [Submit for Review]
                   ▼
       ┌────────────────────────┐
       │    PENDING_APPROVAL    │
       └─────┬────────────┬─────┘
             │            │
  Operations │            │ Operations
   Approves  │            │ Rejects (with reason)
             ▼            ▼
   ┌───────────┐        ┌───────────┐
   │ PUBLISHED │        │ REJECTED  │
   └─────┬─────┘        └─────┬─────┘
         │                    │
         │ Vendor archives    │ Vendor corrects specifications
         ▼                    ▼
   ┌───────────┐        ┌───────────┐
   │ ARCHIVED  │        │   DRAFT   │
   └───────────┘        └───────────┘
```

---

## 6. Core API Endpoint Contracts

### `POST /v1/catalog-management/merchant/:merchantId/products`
**Authorization:** Bearer token (Authenticated merchant owner/admin)

#### Request Payload:
```json
{
  "categoryId": "44444444-4444-4444-4444-444444444401",
  "title": "Italian Leather Men's Oxford Shoes",
  "brand": "SellFast Signature",
  "condition": "brand_new",
  "description": "Expertly handcrafted from supple full-grain Italian leather...",
  "comparePriceMinor": 5500000,
  "weightKg": 0.85,
  "dimensionsCm": "33 × 21 × 12",
  "returnPolicy": "7_day_escrow",
  "warranty": "30_days",
  "tags": ["mens footwear", "oxford", "formal"],
  "variants": [
    { "sku": "SFBF-OXF-40", "title": "EU 40 / Black", "optionSize": "40", "optionColor": "Black", "priceMinor": 4500000, "availableQuantity": 5 },
    { "sku": "SFBF-OXF-41", "title": "EU 41 / Black", "optionSize": "41", "optionColor": "Black", "priceMinor": 4500000, "availableQuantity": 8 },
    { "sku": "SFBF-OXF-42", "title": "EU 42 / Black", "optionSize": "42", "optionColor": "Black", "priceMinor": 4500000, "availableQuantity": 10 }
  ],
  "media": [
    { "mediaUrl": "https://cdn.sellfastbuyfast.com/shoes-cover.jpg", "mediaType": "image", "altText": "Italian Oxford Shoes", "sortOrder": 0 }
  ]
}
```

#### Response Payload (`201 Created`):
```json
{
  "id": "77777777-7777-7777-7777-777777777701",
  "merchantId": "22222222-2222-2222-2222-222222222201",
  "title": "Italian Leather Men's Oxford Shoes",
  "status": "draft",
  "variantsCount": 3,
  "totalAvailableStock": 23,
  "createdAt": "2026-09-03T18:30:00.000Z"
}
```

---

## 7. Supabase Row-Level Security (RLS) Policies

To ensure merchants can only view and manage their own listings:

```sql
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_levels ENABLE ROW LEVEL SECURITY;

-- 1. Merchant members can view their store products
CREATE POLICY "Merchants view store products"
ON public.products FOR SELECT
TO authenticated
USING (
  merchant_id IN (
    SELECT merchant_id FROM public.merchant_members WHERE user_id = auth.uid()
  )
  OR status = 'published' -- Shoppers can view published items
);

-- 2. Merchant members can insert products into their store
CREATE POLICY "Merchants insert store products"
ON public.products FOR INSERT
TO authenticated
WITH CHECK (
  merchant_id IN (
    SELECT merchant_id FROM public.merchant_members WHERE user_id = auth.uid()
  )
);

-- 3. Merchant members can update their own draft or published listings
CREATE POLICY "Merchants update store products"
ON public.products FOR UPDATE
TO authenticated
USING (
  merchant_id IN (
    SELECT merchant_id FROM public.merchant_members WHERE user_id = auth.uid()
  )
);
```

---

## 8. Summary of Tasks for Backend Engineer

- [ ] Execute migration `supabase/migrations/20260903000005_pro_product_studio_variants.sql`.
- [ ] Mount `POST /v1/catalog-management/merchant/:id/products` with the multi-variant payload parser.
- [ ] Implement `reserveVariantInventory()` pessimistic locking logic inside the order creation transaction.
- [ ] Connect the Operations moderation queue to filter by `status = 'pending_approval'`.
- [ ] Verify that double-entry ledger bookings accurately credit `LIABILITY:CUSTOMER_ESCROW_HOLDING` and debit upon delivery confirmation.
