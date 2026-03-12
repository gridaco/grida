# `grida.fbs` TODO — Pre–major-release cleanup backlog

This document tracks **design flaws and improvement candidates** in the current FlatBuffers schema (`format/grida.fbs`) that we deferred to keep the format evolving without breaking changes.

## Why this exists

- **Default strategy**: We follow **schema evolution** (additive, non-breaking changes) whenever possible so existing files keep loading and new capabilities can be added safely. See `format/AGENTS.md` for the Evolution vs Breaking guidelines.
- **Reality**: The schema still needs **periodic cleanups**—either while we’re in rapid iteration or, in any case, **before each major release** (e.g. before we ship the major version with central server in place).
- **Scope**: Items listed here are places where we _couldn’t_ change the schema yet without breaking evolution; they are candidates for a coordinated cleanup or a planned breaking release.

## How to use this doc

- **Before a major release**: Review items below; decide which to address as part of the release (with matching Rust + TS updates; see `format/AGENTS.md`).
- **When adding items**: Describe the flaw or improvement and, if known, whether you expect it to be **Evolution** (new field/table/variant) or **Breaking** (rename, remove, renumber).

---

## TODO items

### 1. `VectorNetworkData.vertices` should be table-based, not struct-based

`vertices` is currently encoded as `[CGPoint]` (struct array). This is compact but rigid: structs cannot evolve, cannot express per-item optional semantics, and always imply all-zero defaults.

We should migrate to a table-backed vertex model (e.g. `[VectorNetworkVertex]`) where each vertex can evolve safely over time while preserving explicit intent. **Breaking.**

---

### 2. `CanonicalEllipticalShapeRingSectorParameters` missing `corner_radius`

The ellipse arc's `corner_radius` field (`EllipseNodeRec.corner_radius: Option<f32>`) controls rounding of arc endpoints. It exists in the Rust runtime model but has no corresponding field in `CanonicalEllipticalShapeRingSectorParameters`. The value is silently lost on FBS roundtrip.

**Fix**: Add `corner_radius: float = 0.0;` to `CanonicalEllipticalShapeRingSectorParameters` in `grida.fbs`, then update encoder/decoder. **Evolution.**

---
