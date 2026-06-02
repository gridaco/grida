# `grida_ciam` schema — manifesto & design decisions

This document captures the **intent**, **scope**, and **design decisions** behind the `grida_ciam` schema.

It is written as a long-lived reference for contributors. If you change the CIAM auth model, update this doc.

---

## What is `grida_ciam`?

`grida_ciam` (Customer Identity & Access Management) is Grida’s **customer identity system**.

It includes both:

- **CIAM**: customer authentication/session primitives for customer-facing flows (e.g. customer portal).
- **CRM**: importing and managing customer data as a first-class entity in the platform.

It is **separate** from Supabase Auth’s `auth.users` on purpose.

---

## Core features (current + planned)

- **CIAM**
  - Email-based login (OTP) → customer session → JWT → RLS.

- **CRM**
  - Importing and managing customer data.
  - Tagging (current).
  - Metadata & custom attributes (planned).

- **Default customer binding across Grida features**
  - A consistent customer identity used by Grida features (e.g. form responses, referral, etc.).

---

## Goals

- **Customer portal authentication without `auth.users`**: customers can log in without creating Supabase Auth users.
- **Use PostgREST + RLS**: the database remains the policy enforcement point.
- **Minimal + shippable**: low operational overhead, simple tables, auditable flow.
- **Secure-by-default**: do not leak account existence (email enumeration), avoid plaintext OTP storage, short-lived challenges.
- **Per-tenant dedup**: customers are scoped by `project_id` and `customer_uid`.
- **Compatibility with third-party-auth pattern**: clients pass a JWT via `accessToken`.

---

## Non-goals

- Full general-purpose Auth replacement.
- Password auth, social OAuth, SSO, MFA (for now).
- Edge Functions as the primary auth mechanism (we do not rely on them here).
- Exposing internal tables directly via PostgREST (the schema is largely RPC-driven).

---

## Key design decision: why not `auth.users`?

We intentionally avoid “polluting” `auth.users` for customers because:

- Customers are tenant-scoped; `auth.users` is global.
- We want strict per-tenant identity semantics without coupling to Supabase Auth user lifecycle.
- Customer portal UX is different from editor/workbench auth.

The system is built so we can later **remove `public.customer.user_id`** cleanly once all customer flows are migrated.

---

## CIAM auth / infra / setup / design choices (the “unique” part)

This section describes the core CIAM auth model and its infrastructure requirements.

As `grida_ciam` evolves, keep this section up to date, and add new sections below (data model, policies, ops) as needed.

---

### Authentication flow (high level)

1. **Create OTP challenge**
   - User provides email and project context.
   - We store a salted hash (never the OTP in plaintext).
   - We send the OTP via email.

2. **Verify OTP → create customer session**
   - If valid and not expired, create a `grida_ciam.customer_session`.
   - Mark `public.customer.is_email_verified = true` and sync email on success.

3. **Create portal session token**
   - Backend issues an opaque URL-safe token via `create_customer_portal_session`
     and stores only its `sha256` hash; the raw token is returned once.
   - The token is redeemed server-side via `redeem_customer_portal_session`.

4. **Identity resolution**
   - _Current_: resolved **server-side using `service_role`**, filtering by
     `customer_uid` / `project_id` (DB requests do not carry customer-session claims).
   - _Future_: DB helpers (`customer_uid()` / `project_id()`) read `request.jwt.claims`
     so RLS policies can enforce row access directly.

See [Session model & cryptography](#session-model--cryptography) below for details.

---

### Session model & cryptography

#### Current: opaque portal-session tokens

The customer portal flow (email OTP → customer session → portal session) is **opaque
URL-token based**, not JWT based:

- `grida_ciam_public.create_customer_portal_session` mints a URL-safe random token
  (`grida_ciam.make_url_token`) and stores only its `sha256` hash
  (`customer_portal_session.token_hash`); the raw token is returned **once**.
- The token is redeemed server-side via `grida_ciam_public.redeem_customer_portal_session`.
- Identity is resolved **server-side using `service_role`**, filtering by `customer_uid` /
  `project_id`. Customer-session claims are **not** attached to DB requests today, so
  customer-facing reads do not yet rely on customer-scoped RLS (see the `TODO(ciam)` in
  `app/(tenant)/~/[tenant]/(p)/p/session/[token]/page.tsx`).

This system intentionally behaves as **first-party custom auth** for the customer portal:
customers are **not** created / managed as Supabase Auth users (`auth.users`).

#### Future direction: customer-session-oriented RLS

A later iteration may attach a per-customer authorization context to DB requests so RLS
can enforce access directly (rather than going through `service_role`). One candidate is to
mint JWTs that Supabase/PostgREST verifies via JWKS (ES256 signing keys), keeping the
customer identity model separate from Supabase Auth. This is **not implemented** — it would
require a signing-key setup (e.g. bring-your-own key on hosted Supabase, since
platform-managed private keys are not extractable) and is tracked as future work.

---

### Database objects (current)

#### Tables

- `grida_ciam.customer_otp_challenge`
  - Stores OTP challenge metadata and salted hash.
  - Includes `token_type` (`grida_ciam.one_time_token_type`) for future extensibility.
- `grida_ciam.customer_session`
  - Stateless-ish sessions with TTL and optional revocation.

#### Public RPC surface (`grida_ciam_public`)

- `create_customer_otp_challenge(...)`
- `verify_customer_otp_and_create_session(...)`
- `customer_uid()`
- `project_id()`

We keep the public surface RPC-based so internal tables aren’t directly exposed to PostgREST.

---

### RLS philosophy

- Treat the JWT as an **authorization context**.
- Never trust arbitrary client claims; resolve identity via the server-created `customer_session` row keyed by `sid`.
- Policies should reference `grida_ciam_public.customer_uid()` / `project_id()` rather than direct claim parsing.

---

### Operational notes / pitfalls

- **OTP attempt counting**: PL/pgSQL exceptions roll back changes in the same transaction; track attempts accordingly if you need strict accounting.

---

## Additional notes (room for evolution)

This section is intentionally a placeholder for future documentation as the schema grows beyond CIAM auth + infra.

### Data model & invariants (TODO)

- Document any important invariants (e.g. customer identity scoping, uniqueness expectations, retention).

### RLS policies inventory (TODO)

- List all tables protected by customer-portal RLS and the policies used.
- Include “gotchas” and examples of correct policy patterns.

### Operational runbooks (TODO)

- Key rotation runbook (import → trust → deploy backend secret → cutover → revoke).
- Incident response / revocation expectations (including JWKS caching implications).

### Future work (expected)

- Remove `public.customer.user_id` and migrate any remaining customer flows off Supabase Auth.
- Add token types beyond `confirmation_token` (email change, magic link, recovery, etc.).
- Add optional session revocation UX and stricter session binding (device fingerprinting, IP heuristics) if needed.
