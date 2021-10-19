---
title: "Figma Constraints - SCALE"
version: 0.1.0
revision: 1
---

# Figma Constraints - `SCALE`

Before we start, we recommand you to read [Figma Constraint docs](https://www.figma.com/plugin-docs/api/Constraints/). in this document, we only handle `STRETCH`

## TL;DR - Not supported, fallbacks to STRETCH

Scale is not a valid resizing strategy in the battleground of development. It is valid, but only with a scale factor. Linearly scaling values when screen resize, is not a valid scenario and we do not recommand using scale. And also there are no standard way to process this behaviour using plain style markups, we cannot support (technically there is, but not so standard.)

## Unless - it was detected as an artwork.

In design, the most likely scenario designers using scale for resize strategy will be for artworks. e.g. an text inside illustration that is not in as a png but as a inlined figma artwork.

So in most cases, the artwork will be detected as a artwork and will be represented as a vector or image graphics.

Please suggest us if there is other common and valid usecases using scale as a resize strategy for general ui design.

**Would you like to report a case?**
[Report here](https://github.com/gridaco/designto-code/issues/new/choose)
