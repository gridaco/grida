---
title: SVG
description: Contracts and findings for SVG ingestion, rendering, and conformance.
tags:
  - internal
  - wg
  - canvas
  - svg
format: md
---

# SVG

This cluster collects SVG source contracts, domain findings, and conformance
methods. Each page states whether it is a normative profile, findings note, or
test methodology.

| Page                                         | Scope                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| [Animation Profile 0](./animation)           | The first strict, explicitly sampled SVG animation subset                 |
| [Animation Profile 1](./animation-keyframes) | Keyframe lists, authored key times, and deterministic cubic Bézier easing |
| [Patterns](./pattern)                        | Pattern paint-server findings                                             |
| [Testing](./testing)                         | Static and animated-profile conformance methodology                       |
| [Text import](./text-import)                 | SVG text structure and layout findings                                    |

The [SVG import mapping](../format/svg) tracks the current static projection
into the scene model. The [Chromium SVG research](../research/chromium/svg/)
records browser precedent; it is evidence, not this feature contract.
