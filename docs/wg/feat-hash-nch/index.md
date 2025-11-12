---
title: Fast Hashing (hash-nch)
---

# Fast Hashing – `hash-nch`

> **Scope:** Fonts & Images (WASM / Embedded)

| feature id | status | description                                                                                      | PRs                                               |
| ---------- | ------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `hash-nch` | draft  | Fast **non‑cryptographic hashing** for engines that run in browsers (WASM) and embedded systems. | [#415](https://github.com/gridaco/grida/pull/415) |

This document proposes a lightweight, stable, and portable hashing strategy for **resource identity** (images, fonts, and other binary blobs) in Grida engines that target **`wasm32-unknown-emscripten`** and embedded environments.

---

## TL;DR / Decision

- **Winner:** `SeaHash` ([crate: `seahash`])
- **Class:** Non‑cryptographic hash (NCH)
- **Seed:** fixed (implicit, no per‑run randomness)
- **Canonical output:**
  - Internal: `u64`
  - External (text): **big‑endian lowercase hex** (16 chars)
  - Optional: **base64url (no padding)** for URL/file‑safe compact form
- **Why:** Pure Rust, tiny footprint, **very fast**, fully portable, deterministic across platforms and builds, and ideal for WASM (no special intrinsics).
- **Interop:** Ecosystem/db‑native functions are **non‑goals** for now; if needed later, we can add an **opt‑in `xxhash` backend** behind a feature flag without changing the public API.

---

## Goals

- **Consistency:** identical results across builds, architectures, and engine versions for the same bytes.
- **Performance:** near memory‑bandwidth throughput for large files (e.g., 16 MB PNGs in a few ms).
- **Portability:** runs the same in **wasm32 (emscripten)** and native; no reliance on CPU intrinsics.
- **Simplicity:** small dependency surface; straightforward API (one‑shot and streaming).
- **Determinism:** fixed algorithm/seed; no randomized hashers.

## Non‑Goals

- **Ecosystem / DB‑native function compatibility** (e.g., `xxh64()` inside SQL engines).
- **Cryptographic integrity** (tamper resistance). Use cryptographic hashes when required.
- **Serving as GUID / global identifiers** (not suitable as service-wide database IDs).

---

## Terminology

- **NCH (Non‑Cryptographic Hash):** fast hash optimized for speed & distribution, not for security (e.g., SeaHash, xxHash, Murmur).
- **Checksum:** simple error‑detection codes (e.g., CRC32) — useful for transport/storage integrity, not general identity.
- **Cryptographic hash:** collision‑resistant (e.g., SHA‑256, BLAKE3) — slower, used for security/integrity.

---

## Rationale: Why SeaHash?

1. **Pure Rust & Portable:** No platform intrinsics; compiles cleanly to `wasm32-unknown-emscripten`.
2. **Speed:** Among the fastest general NCH functions. On large buffers, often on par with or slightly ahead of xxHash64. In practice, hashing time is near memory‑bandwidth‑limited.
3. **Deterministic & Stable:** Outputs do not vary by endianness or build options. Perfect for persistent IDs.
4. **Footprint:** Small crate, minimal code size growth in WASM.
5. **Fit to our needs:** We control both producer and consumer of the hash. Cross‑tool recomputation (e.g., computing the same hash inside SQL) is **not** required at this stage.

> **Note:** xxHash (especially **XXH3**) is also excellent and widely adopted. Our current requirements favor **portability, size, and control** over cross‑ecosystem parity. We can still support xxHash in the future behind a feature flag without breaking the API (see _Extensibility_).

---

## API Proposal

### One‑shot

```rust
/// Compute a SeaHash of the entire byte slice.
pub fn hash_bytes(bytes: &[u8]) -> u64;
```

### Incremental (streaming)

```rust
pub struct Hasher { /* seahash state */ }
impl Hasher {
    pub fn new() -> Self;
    pub fn update(&mut self, chunk: &[u8]);
    pub fn finish(&self) -> u64; // non‑consuming
    pub fn finalize(self) -> u64; // consuming
}
```

### Encoding helpers (canonical outputs)

```rust
/// Big‑endian lowercase hex (16 chars for u64)
pub fn to_hex_be(h: u64) -> String;

/// URL‑safe Base64 without padding (shortest ASCII form)
pub fn to_b64url_nopad(h: u64) -> String;
```

**Conventions**

- Store/compare **`u64`** internally.
- Render to **big‑endian** bytes before converting to text (`hex`/`base64url`).
- Keep the algorithm name with serialized values when persisted externally: e.g., `seahash:3f1a…e6ab`.

---

## Output Formats (Recommended)

| Format              | Example (64‑bit)   |   Length | Pros                      | Cons                     | Use                           |
| ------------------- | ------------------ | -------: | ------------------------- | ------------------------ | ----------------------------- |
| Raw bytes `[u8; 8]` | `\x8a\x1f…\x3c`    |      8 B | Smallest; fastest compare | Opaque; awkward in JSON  | In‑memory keys, binary caches |
| Hex (BE, lower)     | `3f1a9b0c7d42e6ab` | 16 chars | Universal, readable       | 2× size of bytes         | Logs, JSON, CLI, filenames    |
| Base64URL (no pad)  | `PxqbDH1C5qs`      | 11 chars | Short ASCII, URL‑safe     | Less ubiquitous than hex | Short IDs, URLs, slugs        |

---

## WASM / Embedded Notes

- `wasm32` means **32‑bit addressing**; 64‑bit integer ops are available and compile to native WASM `i64` ops. Both SeaHash and xxHash64 run efficiently.
- For large buffers (e.g., 16 MB PNG), hashing time is typically **~1–3 ms** on desktop‑class hardware; transfer/copy often dominates.
- No CPU‑specific intrinsics required; works consistently in browsers and embedded runtimes.

---

## Candidate Comparison (what we considered)

| Algorithm                          | Crate             | Class    | Perf (native)         | wasm32 note          | Adoption                   | Why pick / not pick                                                           |
| ---------------------------------- | ----------------- | -------- | --------------------- | -------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| **SeaHash**                        | `seahash`         | NCH      | ★★★★☆ (very fast)     | ✅ Portable; great   | Low‑mid (Rust‑centric)     | **Chosen**: pure Rust, tiny, fast, deterministic                              |
| **xxHash (XXH64/XXH3)**            | `xxhash-rust`     | NCH      | ★★★★★ (XXH3 top‑tier) | ✅ Portable; great   | High (cross‑ecosystem)     | Not chosen now: interop not needed; larger footprint; optional future backend |
| **rustc‑hash (FxHash)**            | `rustc-hash`      | NCH      | ★★★★☆ (small keys)    | ✅                   | Mid (Rust compilers/tools) | Great for hashmaps; not ideal for large blobs                                 |
| **FoldHash**                       | `foldhash`        | NCH      | ★★★★☆ (maps)          | ✅                   | Mid (hashbrown)            | Map workloads; not stable for persisted IDs                                   |
| **Murmur3**                        | `murmur3`         | NCH      | ★★★☆☆                 | ✅ (pure Rust impls) | Mid‑high (legacy)          | Fine, but older; alignment gotchas in C/asm.js histories                      |
| **CityHash/FarmHash**              | `fasthash`        | NCH      | ★★★★☆                 | ✅ (baseline)        | Mid‑high (Google/Chromium) | Good, but not Rust‑first; platform‑tuned variants                             |
| **CRC32**                          | `crc32fast`       | Checksum | ★★☆☆☆ (SW)            | ⚠️ slower in wasm    | Very high                  | Interop/integrity; 32‑bit only; not for dedup                                 |
| **Cryptographic (SHA‑256/BLAKE3)** | `sha2` / `blake3` | Crypto   | ★★–★★★☆               | ✅                   | Very high                  | Use when tamper resistance is needed; heavier                                 |

> Stars are relative to NCH peers for our workloads (large binary blobs). Exact numbers are environment‑dependent.

---

## What about “ecosystem‑friendly” xxHash?

- Some DBs/engines expose `xxh64()` in SQL (e.g., Spark/Databricks; Postgres via extension). That matters **only** if we want to recompute the **same** hash inside those systems.
- Our current pipeline computes hashes inside the engine and stores values; external recomputation is **not** a requirement.
- If that changes, we can expose an **adapter**:
  - `HashAlgo::SeaHash` (default)
  - `HashAlgo::XxHash64` / `HashAlgo::Xxh3_64` (feature‑gated)
  - Same API, same output encodings.

---

## Usage Examples

```rust
// One‑shot
let h: u64 = hash_bytes(&bytes);
let hex = to_hex_be(h);

// Streaming
let mut st = Hasher::new();
st.update(&bytes[0..8192]);
st.update(&bytes[8192..]);
let h2 = st.finalize();
```

---

## Expected Collisions & Safety

- NCHs are **not** collision‑proof. For our dedup/resource identity use, `u64` is sufficient (astronomically low collision odds at our scale).
- Do **not** use NCHs for untrusted security contexts or as password digests. Use cryptographic hashes instead.
- For hash‑table DoS resistance with untrusted keys, prefer randomized map hashers (e.g., `hashbrown` default) rather than a fixed NCH.

---

## Intended Scope

The `hash-nch` output is intended as a **scoped identifier** for resources (such as images, fonts, or documents) inside the engine. It provides fast, deterministic identity useful for deduplication, cache keys, and change detection within a project.

It is **not** meant to serve as a global, service-wide database primary key. For service-wide uniqueness or external identifiers, use UUIDs, ULIDs, or database-native sequences. For adversarial or tamper-resistant contexts, prefer cryptographic hashes (e.g., BLAKE3, SHA-256).

---

## Non‑fast / Non‑NCH Options we may adopt later

| Class    | Option           | Why we’d use it                                        | Status      |
| -------- | ---------------- | ------------------------------------------------------ | ----------- |
| Checksum | `crc32fast`      | Interop with PNG/gzip/protocols; quick error detection | Not planned |
| Crypto   | `blake3`         | High‑speed cryptographic integrity; parallelizable     | Not planned |
| Crypto   | `sha2` (SHA‑256) | Industry compatibility, legal/compliance contexts      | Not planned |

These aren’t needed for the rendering engine’s internal identity/dedup today, but the API leaves room to add them as separate, explicit functions.

---

## Testing & Validation

- Determinism tests across targets: native vs `wasm32-unknown-emscripten` (same bytes → same `u64`).
- Incremental vs one‑shot equivalence.
- Encoding round‑trips: `u64` ↔ `hex`/`base64url`.
- Throughput sanity checks on representative files (PNG, TTF/OTF).

---

## FAQ (from the WG discussion)

- **Does `wasm32` make a difference?** Not materially. Both SeaHash and xxHash compile to efficient `i64` ops; performance is largely memory‑bound.
- **Seed vs Salt?** NCHs use a **seed** (we keep it fixed). No per‑run randomness; outputs are stable across versions.
- **Why not xxHash if it’s popular?** Ecosystem parity matters only if we compute the same hash in external systems. We don’t. SeaHash gives us speed + portability with a smaller footprint.

---

## Extensibility

- Keep a stable `HashAlgo` enum and adapter layer so we can add `xxhash` or cryptographic options without breaking callers.
- Persisted values should be self‑describing when crossing system boundaries (e.g., `seahash:<hex>`).

---

## References

- crates: [seahash](https://crates.io/crates/seahash), [xxhash-rust](https://crates.io/crates/xxhash-rust), [rustc-hash](https://crates.io/crates/rustc-hash), [foldhash](https://crates.io/crates/foldhash), [murmur3](https://crates.io/crates/murmur3), [fasthash](https://crates.io/crates/fasthash), [crc32fast](https://crates.io/crates/crc32fast), [blake3](https://crates.io/crates/blake3), [sha2](https://crates.io/crates/sha2)
- Background: industry discussions comparing NCH functions, wasm32 notes, and performance considerations.
