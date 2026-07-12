---
title: Format & Import Mapping
description: Specifications for Grida's authored formats and trackers for importing external formats into the Grida IR.
format: md
tags:
  - internal
  - wg
  - format
---

# Format & Import Mapping

Tracking docs for the Grida IR schema and how external formats map into it.

## Specifications and RFDs

| Page                                                               | Description                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| [Grida IR](./grida)                                                | Canonical IR reference — node types, paint, layout           |
| [Grida XML](./grida-xml)                                           | Open RFD for the authored, inspectable `.grida.xml` source   |
| [Grida XML properties](./grida-xml-properties)                     | XML property names, applicability, and design placeholders   |
| [Grida XML modules](./grida-xml-modules)                           | Open linking/component RFD with a proving implementation     |
| [Grida XML component parameters](./grida-xml-component-parameters) | Open typed prop/arg RFD with a proving implementation        |
| [Grida XML component slots](./grida-xml-component-slots)           | Open named slot projection RFD with a proving implementation |
| [Grida XML animation](./grida-xml-animation)                       | Open day-one animation question set for `.grida.xml`         |

## Import mappings

| Page           | Description                                      |
| -------------- | ------------------------------------------------ |
| [CSS](./css)   | CSS → Grida IR property mapping and TODO tracker |
| [HTML](./html) | HTML element → Grida IR node mapping             |
| [SVG](./svg)   | SVG → usvg → Grida IR mapping and TODO tracker   |

## How to use these docs

The CSS, HTML, and SVG trackers use this status key: ✅ mapped | ⚠️ partial |
🔧 IR exists, not wired | ❌ IR missing | 🚫 out of scope. Their **IR Gaps**
sections identify schema changes that would unblock further progress.

For the on-disk `.grida` file format, see the [FlatBuffers
schema](https://github.com/gridaco/grida/blob/main/format/grida.fbs).

## Related

- **FlatBuffers schema:** [canonical on-disk format](https://github.com/gridaco/grida/blob/main/format/grida.fbs)
- **Rust runtime model:** [node schema](https://github.com/gridaco/grida/blob/main/crates/grida/src/node/schema.rs)
- **TypeScript model:** [canvas schema](https://github.com/gridaco/grida/blob/main/packages/grida-canvas-schema/grida.ts)
- **HTML import pipeline:** [HTML importer](https://github.com/gridaco/grida/tree/main/crates/grida/src/import/html)
- **SVG import pipeline:** [SVG importer](https://github.com/gridaco/grida/tree/main/crates/grida/src/import/svg)
