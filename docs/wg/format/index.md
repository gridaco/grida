---
title: Format & Import Mapping
format: md
tags:
  - internal
  - wg
  - format
---

# Format & Import Mapping

Tracking docs for the Grida IR schema and how external formats map into it.

## Pages

| Page                                           | Description                                                |
| ---------------------------------------------- | ---------------------------------------------------------- |
| [Grida IR](./grida)                            | Canonical IR reference — node types, paint, layout         |
| [Grida XML](./grida-xml)                       | Open RFD for the authored, inspectable `.grida.xml` source |
| [Grida XML properties](./grida-xml-properties) | XML property names, applicability, and design placeholders |
| [Grida XML animation](./grida-xml-animation)   | Open day-one animation question set for `.grida.xml`       |
| [CSS](./css)                                   | CSS → Grida IR property mapping and TODO tracker           |
| [HTML](./html)                                 | HTML element → Grida IR node mapping                       |
| [SVG](./svg)                                   | SVG → usvg → Grida IR mapping and TODO tracker             |

## How to use these docs

- **Status key:** ✅ mapped | ⚠️ partial | 🔧 IR exists, not wired | ❌ IR missing | 🚫 out of scope
- Each page tracks what is implemented, what is partially done, and what is blocked by missing IR fields.
- The **IR Gaps** section in each page identifies schema changes that would unblock further progress.
- For the on-disk `.grida` file format (FlatBuffers schema), see `format/grida.fbs`.

## Related

- **FlatBuffers schema:** `format/grida.fbs` — the canonical on-disk file format
- **Rust runtime model:** `crates/grida/src/node/schema.rs`
- **TypeScript model:** `packages/grida-canvas-schema/grida.ts`
- **HTML import pipeline:** `crates/grida/src/import/html/`
- **SVG import pipeline:** `crates/grida/src/import/svg/`
