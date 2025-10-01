---
title: Grida Object (Node) ID Model (for CRDT) - Working Group Draft
description: A working group draft describing the Grida ID Model (for CRDT) feature for the core engine.
---

# Grida ID Model (for CRDT)

| feature id       | status | description                                                                             | PRs                                               |
| ---------------- | ------ | --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `crdt-object-id` | draft  | Grida ID Model (for CRDT) for engines that run in browsers (WASM) and embedded systems. | [#431](https://github.com/gridaco/grida/pull/431) |

This document proposes a lightweight, stable, and portable identity scheme for **canvas objects and nodes** in Grida's CRDT-enabled engines that run in browsers (WASM) and embedded systems.

---

## Considerations

- Collaboration/CRDT requires unique and compact identifiers to efficiently merge changes from multiple actors.
- Offline use demands that IDs can be generated locally without conflicts, necessitating a space for actor identifiers.
- DB compatibility favors integer types that are widely supported and performant, such as 32-bit integers.
- JS number safety limits integer precision to 53 bits, but 32-bit integers are safely represented without loss.
- Memory and storage tradeoffs balance between larger IDs for scalability and smaller IDs for performance and simplicity.

## Options `i32 / i64 / i128`

| Type | Bit Budget | JS Safety | DB Alignment         | Overhead           | actor budget      | object budget              | notes                  | collision (per document)   |
| ---- | ---------- | --------- | -------------------- | ------------------ | ----------------- | -------------------------- | ---------------------- | -------------------------- |
| i32  | 32 bits    | Safe      | INT                  | Low (4 bytes)      | 2^8-1 (255)\*     | 2^24 (16,777,216)          | reasonable             | 4,294,967,296              |
| i64  | 64 bits    | Unsafe\*  | BIGINT               | Moderate (8 bytes) | 2^16-1 (65,535)\* | 2^64 (281,474,976,710,656) | maximum                | 18,446,744,073,709,551,616 |
| i128 | 128 bits   | Unsafe\*  | Not widely supported | High (16 bytes)    | -                 | -                          | use uuid at this point | ♾️                         |

\*JS does not safely represent all 64-bit integers without precision loss.
\*\*Actor ID 0 is reserved for offline-local work, reducing online actor capacity by 1.

## Why i32 ?

`i32` is chosen because it is safe to use within JavaScript without precision loss, compact enough to minimize storage and memory overhead, and well-supported by common databases as the `INT` type. The 32-bit space is sufficient to encode a 24-bit node counter combined with an 8-bit actor ID, balancing scalability and simplicity.

### Layout

The 32-bit ID is packed as follows:

- `actor:8` bits — identifies the actor (up to 255 online actors per document, actor 0 is reserved for offline-local)
- `node:24` bits — a counter unique per actor (up to ~16.8 million nodes per actor)

This ID is unique per document and can be exposed as a string in the format `actor:node` when needed for readability or interoperability.

## Limitations & Future Migration Strategy

- The online actor ID is capped at 255 (actor 0 is reserved for offline-local), and the node counter is capped at approximately 16 million per actor.
- If application needs exceed these limits, migration to a 64-bit (`i64`) ID is possible with negligible performance impact.
- The primary reason for preferring `i32` currently is to avoid JSON and JavaScript friction caused by larger integer types and to maintain compatibility and simplicity.

## Current Implementation (Not fully offline compatible)

Currently, actor IDs are assigned per session by the server, forcing actors to connect to obtain their actor ID. However, the long-term design aims to support offline-generated actor IDs with local persistence and server-issued aliases to provide compact forms and maintain consistency across sessions.

### Actor ID Assignment Strategy

When the server assigns an actor ID, it should select the **least-used actor ID** rather than simply incrementing based on the current room count. A naive incremental approach (e.g., `actors_in_room + 1`) could lead to actor ID 1 being consistently reused as actors join and leave, gradually exhausting its 16M node budget while higher actor IDs remain unused. By tracking usage per actor ID and assigning the least-used one, the server ensures balanced distribution across the 255 online actor slots (1-255) and maximizes the effective capacity of the document.

### Offline-First, Sync-Later Strategy

For offline scenarios, a simplified approach allows clients to create and edit documents without prior server coordination:

1. **Offline Creation**: When working offline, the client uses actor ID `0` (reserved for offline-local work)
2. **Local ID Generation**: All nodes created offline use actor 0 combined with a local counter
3. **Connect & Reassign**: Upon connecting, the server assigns a real actor ID (1-255) based on the least-used strategy
4. **ID Rewriting**: The client rewrites all locally-created IDs by replacing actor 0 with the server-assigned actor ID
5. **Sync**: The rewritten IDs are then synced to the server

This approach trades the need for deterministic offline actor IDs for simplicity, at the cost of requiring a local rewrite phase before the first sync. The rewrite is O(n) in the number of locally-created nodes but avoids the complexity of coordinating persistent offline actor identities across devices. Actor ID 0 serves as a clear marker for "not yet synced" content.

## Resource IDs (Out of Scope)

This ID model applies to **canvas objects and nodes only**. Resource identity (images, fonts, and other binary blobs) is handled separately through a content-addressable hash-based mechanism documented in [feat-hash-nch](../feat-hash-nch/index.md). Resource IDs are derived from content hashing and do not require actor-specific allocation, making them inherently collision-free and suitable for offline-first workflows without coordination.
