---
title: "Figma Import & Translation (io-figma)"
description: Implementation details behind importing .fig files into Grida.
---

# .fig Format - `io-figma`

| feature id | status | description                                          | PRs                                               |
| ---------- | ------ | ---------------------------------------------------- | ------------------------------------------------- |
| `io-figma` | draft  | Figma import and translation capabilities for Grida. | [#457](https://github.com/gridaco/grida/pull/457) |

This document covers the implementation and design of Figma import and translation capabilities in Grida.

## Overview

The `io-figma` feature handles importing and translating design data from Figma into Grida's canvas format. This includes:

- Importing from `.fig` files (Figma's proprietary Kiwi-based binary format)
- Translating data from Figma's REST API
- Handling Figma clipboard payloads for copy-paste workflows
- Supporting the broader Figma ecosystem integration

## Support Status

**This is an unofficial feature.** While Figma import is a widely adopted and useful capability, we do not claim official support for it. The `.fig` file format is non-standard and proprietary, with no public specification. Figma may change the format at any time without notice, which could break compatibility.

Despite this limitation, Figma import remains a valuable feature for users migrating from or working alongside Figma.

## Goals

The following capabilities are in scope for this feature:

- **Importing from `.fig` files** - Parse and translate Figma's binary file format into Grida's document model
- **Copy-pasting Figma clipboard payload into Grida** - Enable users to copy elements from Figma and paste them directly into Grida
- **Authoring Figma clipboard payload from Grida** - Allow users to copy elements from Grida and paste them into Figma

## Non-Goals

The following capabilities are explicitly **not** in scope:

- **Authoring `.fig` files** - We will not generate native Figma files
- **Exporting to Figma** - Direct export to Figma is not supported (though clipboard compatibility serves as a partial alternative)

## .fig Format Architecture

### File Structure

The `.fig` file format uses the Kiwi binary encoding protocol. A typical `.fig` file consists of:

1. **Header** - File prelude (`"fig-kiwi"` or `"fig-jam."`) and version number
2. **Chunk 1** - Compressed Kiwi schema definition
3. **Chunk 2+** - Compressed scene data encoded using the schema

### Key Findings

#### Self-Describing Format

**`.fig` files are self-describing** - Each file contains its own schema definition in chunk 1. This means:

- The schema can evolve between versions
- Files can be parsed without external schema files
- The parser reads the schema first, then uses it to decode subsequent chunks

#### Clipboard Payload Challenge

**Clipboard payloads do NOT include schema** - This is a critical difference from `.fig` files:

- When copying from Figma, only the encoded data is placed on the clipboard
- No schema definition is included
- **To support clipboard paste, we must maintain a pre-defined schema**

This is why we maintain the [fig.kiwi schema file](https://github.com/gridaco/grida/blob/ec18e4b716790e095c34b2f2535b58f62a8c7ca6/.ref/figma/fig.kiwi) extracted from recent `.fig` files. The clipboard implementation must use this pre-defined schema to decode clipboard payloads.

### Implementation Strategy

1. **For `.fig` file import:**

   - Read schema from chunk 1
   - Use embedded schema to decode remaining chunks
   - More robust to schema changes

2. **For clipboard paste:**
   - Use pre-defined schema from our repository
   - Requires periodic updates as Figma evolves
   - Schema version mismatch may cause decode failures

### Schema Reference

See [Kiwi Schema Glossary](./glossary/fig.kiwi.md) for detailed schema documentation and the complete schema definition.

## References & Findings

- [Figma .fig file format parser online by Evan Wallace](https://madebyevan.com/figma/fig-file-parser/)
- [kiwi@GitHub](https://github.com/evanw/kiwi)
- [fig-kiwi@npm](https://www.npmjs.com/package/fig-kiwi)
  - [figma-format-parse@GitHub](https://github.com/darknoon/figma-format-parse)
  - [demo](https://fig-kiwi-debug.vercel.app/)
- [fig2sketch@GitHub / python](https://github.com/sketch-hq/fig2sketch)
  - [fig-kiwi@PyPI](https://pypi.org/project/fig-kiwi/)
- [Figma Inside — .fig file analysis by easylogic](https://easylogic.medium.com/7252bef141da)
- [fig2json@GitHub / rust](https://github.com/kreako/fig2json)

## See Also

- [WG:SVG](../feat-svg)
- [WG:Vector Network](../feat-vector-network)
- [WG:CSS](../feat-css)
