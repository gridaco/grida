---
title: Universal Docs Routing (WG)
---

# Universal Docs Routing

## Summary

We need a **universal routing system** for user-facing docs and links where the
actual path depends on the user’s **org**, **project**, and sometimes the
**document context** (id + type). Docs should be written with a stable, concise
path like:

```
https://grida.co/_/connect/share
```

and resolved at runtime to the user-specific canonical path, for example:

```
https://grida.co/acme/project/00000000-0000-0000-0000-000000001234/connect/share
```

This keeps documentation readable while preserving correct routing for any
tenant and document.

---

## Terminology

- **Context path**: the org/project/doc portion of the URL.
- **Canonical path**: the fully expanded, tenant-specific path.
- **Universal route**: a shorthand path that starts with `/_/`.
- **Route registry**: the explicit list of shorthand routes and how they expand.

---

## Canonical path model

Canonical paths include the full tenant and document context:

- Project-level pages:
  - `/:org/:project/dash`
  - `/:org/:project/ciam`
- Document-level pages (example: forms):
  - `/:org/:project/:docId/connect/share`

The doc type is **not** encoded in the universal path; it is resolved from
document context (id + type) at runtime.

---

## Universal path model

Universal routes replace the context path with a single reserved segment:

```
/_/<path>
```

Examples:

- `/_/dash` → `/:org/:project/dash`
- `/_/ciam` → `/:org/:project/ciam`
- `/_/connect/share` → `/:org/:project/:docId/connect/share`

`/_/` is **never canonical**. It is only an alias for documentation and
context-aware navigation.

---

## Resolution algorithm (runtime)

1. Detect the universal prefix (`/_/`).
2. Resolve **current context**:
   - `org`, `project` from the active workspace/session.
   - `docId` + `docType` from the active document (if required).
3. Match the remainder against the **route registry**.
4. Expand to the canonical path using the resolved context.
5. Route/redirect to the canonical path.

If a required context is missing, the router must halt with a context selection
flow (or a clear error) instead of guessing.

---

## Invariants

- `_` is a **reserved segment** and must never be used as an org or project id.
- Universal routes are **explicitly registered**, not inferred.
- Doc type must **not** be encoded into `/_/` paths (no `/forms/`, no query
  params like `?doctype=forms`).
- Any universal path must resolve to **exactly one** canonical route.

---

## Uniqueness test (collision prevention)

Because routing is **not strictly rule-based**, shorthand names can collide.
We must enforce uniqueness with a looped test over the route registry.

**Requirement**

For every defined shorthand route, the matcher must return **exactly one**
result (itself).

**Sketch**

```
for (const route of universalRoutes) {
  const matches = matchUniversalRoute(route.samplePath)
  assert(matches.length === 1)
  assert(matches[0].id === route.id)
}
```

Notes:

- Each route definition must include a `samplePath` that exercises its matcher.
- The test must run in CI to catch collisions early.

---

## Examples

| universal path          | canonical path (example)                                                |
| ----------------------- | ----------------------------------------------------------------------- |
| `/_/dash`               | `/acme/project/dash`                                                  |
| `/_/ciam`               | `/acme/project/ciam`                                                  |
| `/_/connect/share`      | `/acme/project/00000000-0000-0000-0000-000000001234/connect/share`     |

---

## Non-goals

- No implicit guessing or inference beyond the route registry.
- No alternate universal prefixes (`/_/_/`, `/__/`).
- No doc type leakage in the universal path.

