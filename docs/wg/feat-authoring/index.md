---
title: Authoring (WG)
---

Authoring features are a collection of **authoring-time** behaviors in the editor: operations that **rewrite node parameters** to achieve an intended visual result, rather than relying on runtime transforms or renderer-specific tricks.

These features often rely on small mathematical models (geometry, parameter spaces, normalization), but their purpose is primarily **editing UX + consistency** across backends.

## Scope

- **In scope**: operations that _change authored data_ (node properties) so future edits behave as if the object was created that way.
- **Out of scope**: purely runtime rendering concerns (GPU effects, transforms that are only applied at render time).

## Documents

- [**Parameter-space scaling (K / Apply Scale)**](./parametric-scaling.md)

## Terminology

- **Authoring-time**: performed while editing; produces durable changes in the document model.
- **Runtime**: evaluated while rendering/playback; does not necessarily change the stored document.
