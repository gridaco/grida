# Resources

Lightweight in-memory store for fonts and images.

Built on the [Resources working group proposal](../../../../docs/wg/feat-resources/index.md) and the [Fast Hashing (NCH) spec](../../../../docs/wg/feat-hash-nch/index.md).

Resources are identified by logical RIDs (e.g. `res://logo.png`) and cached by content hash (`mem://{seahash}`).
This module exposes:

- **`ByteStore`** – content-addressed blob store using SeaHash.
- **`ResourceIndex`** – mapping between RIDs and blob hashes.

**Image registration** (Renderer API):

- `add_image(bytes)` → content-addressed; stores under `res://images/<hex16>` (SeaHash of bytes).
- `add_image_with_rid(bytes, rid)` → logical RID; caller specifies `rid`, which must start with `res://` or `system://`.

Suitable for WASM or embedded builds where reliable file systems are unavailable.
