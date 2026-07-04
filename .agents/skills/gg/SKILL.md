---
name: gg
description: >
  Working pattern for Grida Gateway (GG) — Grida's first-party, metered,
  no-BYOK AI surface: the scoped-token mint, the OpenAI-compatible +
  native gateway endpoints, the `gg` client provider, and the desktop
  wiring that spends org credit without a user key. Anchor for the
  `GRIDA-GG: <surface>` grep marker; its security half is
  `GRIDA-SEC-006`. Use when adding or touching any GG file, the `gg`
  provider kind, the `gg:ai` token audience, or deciding whether code
  belongs to the gateway surface. Companions: `security` (the
  GRIDA-SEC-006 half), `ee-billing` (the ledger it spends), `agent-system`
  and `desktop` (the two hosts).
---

# gg — Grida Gateway

**Grida Gateway (GG)** is Grida's first-party AI gateway: the path by
which a signed-in client runs AI — text, image, video — **without a
user-supplied model key** (no BYOK), billed to the organization's prepaid
credit. It is one coherent, extractable surface, marked so a single grep
finds all of it, and it is **designed to spin out** of this repo into a
standalone service at `grida.gg`. Treat every touch as work on a product
that will one day live on its own.

Canonical spec: [Hosted AI (metered, no-BYOK)](https://grida.co/docs/wg/platform/hosted-ai).
Security boundary: `GRIDA-SEC-006` in [SECURITY.md](https://github.com/gridaco/grida/blob/main/SECURITY.md).

## What counts as GG

The test: _does this code exist to let a keyless client spend org credit on
a Grida-hosted model?_ If yes, it is GG. Four surfaces:

- **`token`** — the scoped-token mint + verify. A purpose-scoped,
  short-lived, org-bound JWT (audience `gg:ai`) is the _only_ credential
  the gateway accepts. This surface is also `GRIDA-SEC-006`.
- **`gateway`** — the server endpoints: the OpenAI-compatible text surface
  (chat completions, models) and the native image/video generation
  surfaces. They verify the `gg:ai` token and meter through the billing
  seam; they carry no billing logic of their own.
- **`provider`** — the client-side `gg` provider kind (in the agent
  package) that resolves to the gateway, plus its in-memory session store,
  factories, and media adapters. It is the _consumer_ of GG.
- **`desktop`** — the renderer lifecycle that mints/re-mints the token and
  pushes it to the sidecar (memory-only custody), and the daemon `gg`
  capability/namespace that receives it.

Not GG: the billing ledger itself (that is `ee-billing` / `grida_billing`);
the billing seam's `providerOptions.grida` namespace (Grida-billing's key,
shared with GRIDA-SEC-003); BYOK providers (the carve-out GG sits beside).

## The `GRIDA-GG` marker

Like `GRIDA-EE`, the surface is grep-able. Tag every file that exists
_only_ for GG, with the surface as the sub-label:

```ts
// GRIDA-GG: token — scoped-token mint/verify (also GRIDA-SEC-006)
// GRIDA-GG: gateway — OpenAI-compatible chat completions
// GRIDA-GG: provider — the `gg` client provider kind
// GRIDA-GG: desktop — renderer token lifecycle
```

Sub-labels are surface names (`token` / `gateway` / `provider` /
`desktop`), not ids. The grep is the index:

```sh
grep -rn 'GRIDA-GG' editor packages desktop
```

Tag the file header when the whole file is GG; tag inline when only a
branch is (e.g. the `gg` arm inside a shared provider resolver). The
canonical name is **Grida Gateway (GG)**; write it that way in prose.

## The naming map (canonical identifiers)

One brand, several forms — consistent with how the repo already names
(`GRIDA-EE` marker + `grida_billing` schema + descriptive symbols):

| concept                       | identifier                                                 |
| ----------------------------- | ---------------------------------------------------------- |
| grep marker                   | `GRIDA-GG: <surface>`                                      |
| token audience (wire)         | `gg:ai`                                                    |
| signing secret (env)          | `GG_TOKEN_SECRET` (+ `GG_TOKEN_SECRET_PREVIOUS`)           |
| client provider kind (wire)   | `gg`                                                       |
| provider id / metadata (code) | `GG_PROVIDER_ID`, `GG_PROVIDER_METADATA`, `isGgProviderId` |
| daemon capability / namespace | `gg` (tag `gg@1`)                                          |
| TS symbols                    | `GridaGateway*` (e.g. `GridaGatewaySessionStore`)          |
| files                         | `gg-*.ts`                                                  |
| future public host            | `grida.gg` (endpoint paths stay `/api/v1/ai/*` for now)    |

Deliberate carve-outs (not renamed, on purpose): the public endpoint
_paths_ (`/api/v1/ai/*`) — a versioned REST contract whose brand is the
host, not the path; and `providerOptions.grida` — the billing seam's key.

## Working on GG

1. Tag every file you create or touch with `GRIDA-GG: <surface>`.
2. Place new code in a `gg`-named location; don't dilute a BYOK or OSS one.
3. **Direction of dependency: consumers → GG contract, not GG → consumers.**
   The gateway must not import desktop/renderer code; the client provider
   depends on the wire contract, not the server internals. This is what
   makes the spin-out cheap.
4. The gateway meters through the existing billing seam — it never grows
   its own billing logic. Pre-flight entitlement gate, post-flight usage
   ingest, sold at cost. See [`ee-billing`](../ee-billing/SKILL.md).

## When GG crosses security

The `token` surface (mint + verify + custody) **is** `GRIDA-SEC-006`. Any
file on that surface carries **both** markers:

```ts
// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: token — scoped-token mint/verify
```

Touching it runs the [`security`](../security/SKILL.md) review **first**
(the boundary contract, fail-closed secret handling, audience pinning),
then this skill (the surface-organization pass). The invariant to protect:
_the credential a native process holds for AI is worth at most 15 minutes
of AI calls on one org's credit — and nothing more._

> Precedence is stated here and cross-referenced from `GRIDA-SEC-006` in
> SECURITY.md, so a reader entering from either side lands in the other.

See also: [`security`](../security/SKILL.md) (the GRIDA-SEC-006 half),
[`ee-billing`](../ee-billing/SKILL.md) (the credit ledger GG spends),
[`ee`](../ee/SKILL.md) (the EE marker pattern this mirrors),
[`agent-system`](../agent-system/SKILL.md) and
[`desktop`](../desktop/SKILL.md) (the two hosts), [`naming`](../naming/SKILL.md).
