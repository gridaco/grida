---
title: Multi-tenant Custom Domains on Vercel
---

# Multi-tenant Custom Domains on Vercel

> Long-lived invariants and architectural decisions for Grida custom domain support when Vercel is the edge provider.

## Audience

- Core platform engineers
- Infra maintainers
- Future agents working on routing and domain mapping

## Purpose

Capture long‑lived architectural truths and invariants for custom domain support. This document intentionally avoids task-level instructions and short-term implementation details.

---

## Problem space

Grida is a multi‑tenant web platform where tenant content must be addressable via:

- Platform subdomains (e.g. `tenant.grida.site`)
- User‑owned domains (e.g. `example.com`, `app.example.com`)

The system must support true apex domains (root domains without subpaths or proxies) while preserving:

- Tenant isolation
- HTTPS by default
- Predictable routing semantics
- Operational simplicity

---

## Non‑negotiable platform decisions

The following decisions are foundational and must not be revisited lightly.

### Hosting & edge provider

- Vercel is the authoritative edge and routing provider
- All HTTP(S) traffic terminates at Vercel
- TLS certificates are provisioned and renewed by Vercel

No custom reverse proxies, certificate authorities, or DNS‑level routing layers are introduced.

### Domain ownership model

- A domain is an identity key, not a content container
- Each hostname resolves to exactly one tenant
- A tenant may own multiple domains
- A domain may not be shared across tenants

### DNS responsibility boundary

- Grida never modifies user DNS records
- Users configure DNS at their registrar
- Grida provides deterministic instructions only

This keeps legal ownership, trust, and failure modes explicit.

---

## Canonical domain types

### Apex domains

**Definition**

- Root domains without subdomain labels
- Examples: `example.com`, `mybrand.co`

**Routing constraint**

- Apex domains cannot use CNAME records
- Must resolve via IPv4 A record

**Vercel requirement**

- A record must point to Vercel’s anycast IP: `76.76.21.21`

This value is considered stable infrastructure knowledge (as long as Vercel remains the edge provider).

### Subdomains

**Definition**

- Domains with a subdomain label
- Examples: `app.example.com`, `links.example.com`

**Routing constraint**

- Subdomains resolve via CNAME

**Vercel model**

- Each Vercel project exposes a canonical DNS target
- Subdomains must CNAME to that target

The exact alias may change over time; the abstraction is what matters.

---

## Domain verification semantics

### Default verification path

- DNS resolution to the correct Vercel endpoint implies control
- No explicit challenge is required in most cases

### Explicit verification (edge case)

Explicit verification is required only when:

- A domain is already claimed in another Vercel account
- Ownership is ambiguous at the platform level

Mechanism:

- Temporary TXT record at the apex
- Token is issued by Vercel

This is a fallback, not the primary path.

---

## Routing & resolution model

### Host-based resolution

Tenant resolution is driven by the HTTP `Host` header, not URL paths.

Conceptually:

```text
Host -> Domain Registry -> Tenant Identity
```

### Platform domains

- Known suffix (e.g. `.grida.site`)
- Tenant identity is derived from the subdomain

### Custom domains

- Any host not under the platform suffix
- Tenant identity is resolved via a domain mapping registry

The routing layer must not assume origin or intent — only hostname.

---

## Canonicalization & redirect policy

### Canonical host

- If a tenant has a custom domain, it becomes the canonical host
- Platform subdomains are secondary

### Duplicate hostnames

Common duplicates:

- `www.example.com` vs `example.com`
- `tenant.grida.site` vs a custom domain

Policy:

- Exactly one canonical hostname per tenant
- All other hostnames must `301` redirect

This is primarily an SEO and user‑trust concern.

---

## Security invariants

The following must always hold:

- No domain may resolve to multiple tenants
- No tenant may claim an unverified domain
- HTTPS is mandatory
- Domain verification is DNS‑based only

No application‑level trust is placed on user input.

---

## Operational expectations

### Propagation reality

- DNS changes are not instant
- Platform must tolerate delayed resolution
- “Pending” is a first‑class state

### Failure transparency

Failures must be attributable to one of:

- DNS misconfiguration
- Ownership verification missing
- External provider error (Vercel)

Silent failure is unacceptable.

---

## Explicit non-goals

This system intentionally does not support:

- DNS automation
- Registrar integrations
- Wildcard domains
- Nameserver delegation
- Custom TLS management

These are architectural escape hatches, not core needs.

---

## Design philosophy

Custom domains are not a feature — they are infrastructure identity.

The platform must:

- Treat domains as stable identifiers
- Avoid cleverness
- Align with how the web actually works

Anything that violates those principles is a bug, not innovation.

---

## References & conceptual recipes

This section intentionally contains stable external references and high-level recipes. These are meant for orientation and recall, not copy-paste implementation.

### Canonical references (Vercel)

These links are considered authoritative as long as Vercel remains the edge provider:

- [Vercel — Multi-tenant domain management](https://vercel.com/docs/multi-tenant/domain-management)
- [Vercel — Domains](https://vercel.com/docs/projects/domains)
- [Vercel — Platforms Starter Kit](https://vercel.com/blog/platforms-starter-kit)

### Reference implementation (community)

The following project is a **non-authoritative but high-quality reference** that implements the same domain model at scale:

- Dub.co (open source)
  https://github.com/dubinc/dub

Dub follows the same core principles documented here:

- Vercel-managed domains and TLS
- DNS-based ownership verification
- Host-based tenant resolution

This reference is included for practical orientation only. Platform behavior must remain aligned with Vercel’s guarantees, not any third-party implementation.

### Conceptual recipes (non-binding)

These are mental checklists, not implementation guides.

#### Adding a custom domain (conceptual)

1. Tenant declares intent to use a domain
2. Platform associates domain with the Vercel project
3. Platform instructs user to configure DNS
4. DNS resolution proves control
5. Vercel provisions TLS
6. Platform maps `host -> tenant`

If any step is skipped, the system must remain in a safe, non-active state.

#### Resolving a request

On every request:

1. Read `Host` header
2. Decide: platform domain vs custom domain
3. Resolve to tenant identity
4. Enforce canonical host (redirect if needed)
5. Serve tenant content

No request should bypass this sequence.

#### Diagnosing a broken domain

If a custom domain is not working, the root cause is almost always one of:

- DNS record incorrect or missing
- DNS propagation delay
- Domain claimed elsewhere (verification required)
- External provider outage

Application logic is rarely the culprit.

---

## Longevity statement

This document is expected to remain valid across:

- UI rewrites
- Routing refactors
- Backend framework changes
- Agent turnover

As long as:

- Vercel remains the edge provider
- DNS remains the ownership primitive

If either assumption changes, this document must be revisited.
