# Backend Engineer Technical Handoff: Vendor Operations, Fulfilment & Dispute Architecture

> **Repository:** `chimzyfire-ship-it/SellFastBuyFast-Customer` (Root & Core API) & `SellFastBuyFast-Vendor`  
> **Date:** September 3, 2026  
> **Document Version:** 1.0.0  
> **Author:** Antigravity Pairing Agent  

---

## 1. Executive Summary & Context

The **SellFastBuyFast Vendor Portal** frontend (`https://sell-fast-buy-fast-vendor.vercel.app`) has been built out and updated with production-grade UI modules for:
1. **Command Center (`dashboard`)**: Real-time store operational pulse, urgent action queue, live KPI metric cards, and KYC status.
2. **Fulfilment Queue (`fulfilment`)**: Multi-stage order dispatch pipeline with 6 segmented tabs, real-time search, interactive 5-step order timeline drawer, and carrier dispatch modal.
3. **Returns & Disputes (`returns`)**: 7-day buyer protection dispute manager, evidence lightbox viewer, and return approval/rejection decision workflows.

This document serves as the formal specification and technical guide for the backend engineering team regarding the order state machine, carrier logistics model, escrow safeguards, and Core API integration.

---

## 2. Core Question Answered: Do Vendors Handle Deliveries?

### ❌ The Rule: Vendors DO NOT Perform Final Doorstep Deliveries
Under the SellFastBuyFast marketplace specifications:
* **The Vendor's Scope:** Order Fulfillment & Dispatch Handoff only.
  1. **Accept Order:** Verifies physical inventory and commits to fulfilling.
  2. **Pack Order:** Boxes, labels, and seals the package.
  3. **Record Courier Handoff:** Hands the package to a **licensed third-party logistics courier** (e.g., GIG Logistics, DHL Express, Fez Delivery, Kwik Delivery, Speedaf) and records the carrier name, tracking code / waybill number, and optional pickup proof.
* **The Delivery Scope:** Managed by Logistics Partners & Platform Operations.
  - The transition to `delivered` (`/v1/fulfilment/orders/:id/deliver`) is **strictly restricted** to `operations_admin`, `support_agent`, or logistics webhooks upon delivery proof.
  - **Why this invariant exists:** To prevent merchant fraud. If merchants could self-mark orders as `delivered`, bad actors could prematurely trigger escrow payout releases without shipping goods.

---

## 3. Order Lifecycle & State Machine

```
[Buyer Places Order]
         │
         ▼
  pending_payment
         │ (Paystack webhook verifies payment)
         ▼
 payment_confirmed  <── Vendor clicks "Accept Order" (/orders/:id/accept)
         │
         ▼
    processing      <── Vendor packs items (/orders/:id/pack)
         │          <── Vendor hands to courier (/orders/:id/ship)
         ▼
    in_transit      <── Courier delivers; Platform records proof (/orders/:id/deliver)
         │
         ▼
    delivered       <── 7-DAY BUYER INSPECTION & RETURN WINDOW OPENS
         │
    ┌────┴────────────────────────┐
    │ (No dispute within 7 days)  │ (Customer opens return / dispute)
    ▼                             ▼
completed                     disputed
(/orders/:id/complete)        (/customer-care/returns)
(Ledger releases funds)       (Merchant decides: Approve / Reject)
```

### Transition Guardrails Matrix

| From Status | Allowed Next Statuses | Actor Responsible | Core API Endpoint |
|---|---|---|---|
| `pending_payment` | `payment_confirmed`, `cancelled` | Paystack Webhook / System | `/v1/payments/verify` |
| `payment_confirmed` | `processing`, `cancelled`, `refunded` | **Merchant** | `POST /v1/fulfilment/orders/:id/accept` |
| `processing` (shipment `pending`) | `shipment: packed` | **Merchant** | `POST /v1/fulfilment/orders/:id/pack` |
| `processing` (shipment `packed`) | `in_transit` | **Merchant** | `POST /v1/fulfilment/orders/:id/ship` |
| `in_transit` | `delivered`, `disputed` | **Carrier Webhook / Operations** | `POST /v1/fulfilment/orders/:id/deliver` |
| `delivered` | `completed`, `disputed` | **Platform Operations / Cron** | `POST /v1/fulfilment/orders/:id/complete` |
| `disputed` | `completed`, `refunded` | **Support / Operations** | `/v1/customer-care/returns/:id/receive` |

---

## 4. Double-Entry Escrow & Financial Invariants

SellFastBuyFast maintains an immutable double-entry ledger (`journal_entries` and `journal_lines`) where `SUM(debits) == SUM(credits)`.

### Financial Flow by Milestone:
1. **At `payment_confirmed`:**
   - **Debit:** `platform_paystack_clearing` (Asset)
   - **Credit:** `platform_escrow_holding` (Liability)
   - *Merchant balance is NOT credited yet.*
2. **At `delivered`:**
   - Delivery timestamp `shipment.deliveredAt` is recorded.
   - `order.returnWindowEndsAt` is set to `deliveredAt + 7 days`.
3. **At `completed` (after 7-day window expires with zero open returns):**
   - **Debit:** `platform_escrow_holding` (`order.subtotalMinor`)
   - **Credit:** `platform_commission_revenue` (`order.platformCommissionMinor`)
   - **Credit:** `merchant_payable_ledger` (`order.subtotalMinor - order.platformCommissionMinor`)
   - Merchant funds are now unlocked and eligible for settlement in the payout module.

---

## 5. Returns & Disputes Module Specifications

### Policy Invariants (`customerCare.policy.ts`):
* Return window duration: **7 days** (`RETURN_WINDOW_DAYS = 7`).
* Orders are only eligible for return if `order.status === 'delivered'` and `now <= deliveredAt + 7 days`.
* If a return is active, the order is blocked from moving to `completed` (`errors.conflict('RETURN_OPEN')`).

### Endpoints Used by Vendor Portal:
* **`GET /v1/customer-care/merchant/:merchantId/returns`**:
  Returns all return cases associated with the merchant.
* **`POST /v1/customer-care/returns/:id/decision`**:
  - Request body: `{ decision: 'approved' | 'rejected', note: string }`
  - Authorization: `merchant_owner`, `merchant_staff`, `staff`.
  - On `approved`: Notifies buyer with return instructions and warehouse address provided in `note`.
  - On `rejected`: Records `decisionNote` and notifies buyer and moderation.

---

## 6. Frontend Architecture & Resilient Hybrid Data Layer

The vendor portal (`vendor-portal/app.js`) implements a dual-mode communication layer:
1. **Primary Route:** Calls Core API (`http://localhost:4000` or hosted HTTPS endpoint) using JWT Bearer tokens with idempotency keys (`Idempotency-Key`).
2. **Fallback Route (Direct Supabase):** If Core API is unreachable or running locally while accessed from hosted Vercel, the client directly queries Supabase tables using authenticated Supabase client (`sbp_...` tokens), providing complete zero-downtime resilience.

### Schema Expectations for Overview:
Any endpoint returning overview stats (`/v1/vendor/merchant/:merchantId/overview`) must provide the following structure:
```json
{
  "merchant": { "id": "...", "businessName": "...", "status": "active" },
  "viewer": { "memberRole": "owner", "isOwner": true },
  "catalogue": { "total": 12, "draft": 2, "pendingApproval": 1, "published": 9, "archived": 0 },
  "fulfilment": { "awaitingAcceptance": 3, "awaitingPacking": 2, "inTransit": 4 },
  "returnRequests": { "open": 1, "requested": 1 },
  "verification": { "status": "approved", "rejectionReason": null, "updatedAt": "..." },
  "paymentModule": { "status": "deferred" }
}
```

---

## 7. Recommended Next Steps for the Backend Engineer

1. **Deploy Core API to Public HTTPS Staging:**
   - Host `services/core-api` on a managed platform (e.g. Render, Railway, AWS ECS, Fly.io) with a public HTTPS URL.
   - Set `VENDOR_API_URL=https://api-staging.sellfastbuyfast.com` in Vercel environment variables to eliminate local-to-cloud mixed content warnings.
2. **Logistics Courier Webhook Integrations:**
   - Implement incoming webhook receivers for GIGL / DHL / Fez / Speedaf tracking webhooks.
   - When the carrier fires `DELIVERED_TO_RECIPIENT`, verify the webhook signature and automatically trigger `transitionOrder(tx, order.id, 'delivered')` with carrier proof URL.
3. **Escrow Completion Cron Job:**
   - Create a scheduled worker (e.g. BullMQ or pg_cron) running hourly:
     ```sql
     SELECT id FROM orders 
     WHERE status = 'delivered' 
       AND updated_at < NOW() - INTERVAL '7 days'
       AND id NOT IN (SELECT order_id FROM return_requests WHERE status NOT IN ('rejected', 'completed'));
     ```
   - Automatically execute `/v1/fulfilment/orders/:id/complete` to release merchant funds without manual human staff intervention.
4. **Dedicated Payment Module (`/v1/payouts`):**
   - Implement Paystack Transfer Recipient creation (`/transferrecipient`).
   - Build merchant bank account verification (`/bank/resolve`).
   - Implement automated or on-demand balance withdrawal workflows.
