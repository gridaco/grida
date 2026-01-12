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

3. **Mint JWT**

   - Backend mints a JWT containing a session identifier (`sid`).
   - Client uses Supabase client `accessToken: async () => jwt`.

4. **RLS**
   - DB helpers read `request.jwt.claims` and resolve:
     - `customer_uid()`
     - `project_id()`
   - Policies can reference these helpers to enforce row access.

---

### Cryptography & JWT signing keys

#### Why ES256 (signing keys) over HS256 (legacy secret)?

- ES256 enables safe rotation and fast verification via public key discovery (JWKS).
- HS256 shared secrets are discouraged for production and complicate rotation.

See Supabase docs:

- [`JWT Signing Keys`](https://supabase.com/docs/guides/auth/signing-keys)
- [`JWTs` / verification + `accessToken`](https://supabase.com/docs/guides/auth/jwts#verifying-a-jwt-from-supabase)
- [`Third-party auth` overview (limitations)](https://supabase.com/docs/guides/auth/third-party/overview#limitations)

#### First-party custom auth (not a third-party provider)

This system intentionally behaves as **first-party custom auth** for the customer portal:

- We **do not** create / manage customers as Supabase Auth users (`auth.users`).
- We **do** mint JWTs that Supabase/PostgREST can verify so RLS can enforce access.

There is an alternative design: treat `grida_ciam` as a **third-party auth provider** and have Supabase verify JWTs via an OIDC issuer discovery + JWKS setup.

While doable, it would likely require:

- OIDC issuer discovery endpoints and JWKS hosting, and
- a per-tenant (per `project_id`) issuer configuration to preserve strict tenant scoping,

which is operationally heavier and offers no clear benefits for our current goals.

As a result, we require `grida_ciam` to sign JWTs using a signing key that Supabase trusts (ES256 signing keys system), while still keeping the customer identity model separate from Supabase Auth.

#### Hosted Supabase constraint (important)

Hosted Supabase **does not allow extracting** the platform-managed private signing key.

Therefore, `grida_ciam` requires you to **bring/import your own private key**:

- Import your ES256 private key into Supabase Auth as a signing key.
- Store the same private key in your backend secret manager.
- Configure the backend to use `SUPABASE_SIGNING_KEY_JSON` (private JWK; must include `d`).

This allows:

- Backend to **sign** JWTs.
- Supabase/PostgREST to **verify** JWTs using JWKS (public-only).

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

- **JWKS is public-only**: `.../auth/v1/.well-known/jwks.json` does not include `d` and cannot be used to sign.
- **Local Supabase Auth key file**: the local Auth container expects a compatible signing key setup; keep `signing_keys.json` consistent with your local stack.
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
