# Resources - `resources`

> Fonts & Images (WASM / Embedded)

| feature id  | status | description                                                                                                         | PRs                                               |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `resources` | draft  | Resource management for engines that run in browsers (WASM) and embedded systems without reliable physical storage. | [#415](https://github.com/gridaco/grida/pull/415) |

This document proposes a high-level architecture for resource management.

**Non-goals:** Full file systems, package management, or font family fallback.

---

## 0. Glossary

- **Resource ID (RID):** Logical identifier (e.g., `res://images/logo.png`).
- **Blob:** Opaque byte sequence (encoded image, font file, etc.).
- **ByteStore:** In-memory, content-addressed store for blobs.
- **Decoded Asset:** CPU-side structure (parsed font tables, decoded pixels).
- **Realized Object:** Renderer-native object (e.g., `SkImage`, `Typeface`).
- **Pin:** Prevent eviction from cache.
- **Eviction:** Discarding cached state under policy.

---

## Related Features

- **[Fast Hashing - `hash-nch`](../feat-hash-nch/index.md):** Content-addressed storage using fast non-cryptographic hashing for resource identity and deduplication.

---

## 1. Levels of Support

### Level 1 — Basic Mode

Designed for quick delivery. May use more memory than needed, with limited eviction, and occasional instability under heavy load is acceptable.

- **Identity & Resolution:**

  - Support `res://` (simple table) and `mem://` (content hash).
  - `data:` MAY be supported for testing.

- **ByteStore:**

  - Store blobs by content hash (see [Fast Hashing - `hash-nch`](../feat-hash-nch/index.md)).
  - Fixed memory budget is RECOMMENDED, but eviction MAY be skipped.

- **Fonts:**

  - Create a `Typeface` directly from bytes.
  - Caller’s bytes can be dropped after creation.

- **Images:**

  - Keep encoded bytes.
  - Decode lazily via renderer.
  - Placeholder required on decode failure.

- **Eviction:**

  - Manual removal APIs (`remove(id)`) are sufficient.
  - Automatic eviction is optional.

- **Telemetry:**
  - MAY expose simple counters (e.g., bytes stored).

---

### Level 2 — Managed Mode

A production-grade design, with proper caching, eviction, and memory pressure handling.

- **Identity & Resolution:**

  - Support `res://`, `mem://`, `data:`; MAY add `pack://` and `https://`.
  - Maintain a `ResourceIndex` (RID ↔ blob).
  - Content-addressed dedupe across documents.

- **ByteStore:**

  - Use content hashes (see [Fast Hashing - `hash-nch`](../feat-hash-nch/index.md)).
  - Implement LRU (or similar) with configurable budget.
  - Support pin/unpin.
  - Provide `createUrl(bytes) → mem://...` and `revokeUrl(url)` APIs.

- **Decoders & Realizers:**

  - Separate decoding (bytes → decoded asset) from realization (decoded → renderer object).
  - Maintain independent budgets for decoded and realized layers.
  - Use composite cache keys (e.g., blob hash + scale bucket).

- **Fonts:**

  - Cache typefaces by blob hash and parameters.
  - Bytes MAY be dropped after creating the typeface, unless zero-copy mode is used (in which case bytes MUST be pinned).

- **Images:**

  - Prefer lazy decode (keep encoded bytes).
  - Manage decoded pixels (CPU) separately from realized GPU textures.
  - Evict decoded and realized objects under pressure.

- **Eviction & Pressure:**

  - Eviction order: Realized → Decoded → Bytes.
  - Respond to memory pressure signals.
  - Expose `onEvicted` events with reason (`memory-pressure`, `manual`, etc.).

- **Telemetry:**
  - Expose budgets, current usage, and eviction stats.

---

## 2. Memory Targets (Guidance)

| Tier                | Desktop (WASM)  | Mobile (WASM)   |
| ------------------- | --------------- | --------------- |
| ByteStore (encoded) | 96–256 MB       | 24–96 MB        |
| Decoded (CPU)       | 32–128 MB       | 8–48 MB         |
| Realized (GPU)      | Renderer budget | Renderer budget |

Notes:

- WASM `memory64` allows larger heaps, but practical limits are device-dependent.
- Evict decoded/realized layers first; keep encoded bytes where possible.

---

## 3. Upgrade Path

- Start with Level 1 (basic).
- Add eviction and pinning.
- Introduce separate decoded/realized caches.
- Add memory pressure handling and telemetry.
- Optionally add bundle/pack support.

---

**Rationale:**  
This model supports a **simple baseline** (Level 1) while defining a clear upgrade to **robust resource management** (Level 2) suitable for WASM and embedded systems that rely solely on memory.
