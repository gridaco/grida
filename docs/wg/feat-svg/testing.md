---
title: SVG Testing
description: "Static SVG reftest corpora, pixel-diff methodology, and explicit-time animation conformance."
keywords:
  - svg testing
  - reftest
  - pixel diff
  - animation conformance
format: md
tags:
  - internal
  - wg
  - canvas
  - svg
  - testing
---

# SVG Testing

This document describes a test methodology for evaluating SVG rendering
accuracy.

## Test Suites

We use standardized test suites to evaluate SVG rendering quality. These test suites should be downloaded separately and are not included in the repository.

### W3C SVG 1.1 Test Suite

**Source:** [W3C SVG Test Suite](https://github.com/w3c/svgwg/wiki/Testing) [download](https://www.w3.org/Graphics/SVG/Test/20110816/)

The official W3C SVG 1.1 Test Suite provides comprehensive coverage of SVG features including:

- **Shapes:** Basic shapes (rect, circle, ellipse, line, polyline, polygon, path)
- **Text:** Text rendering, fonts, text paths, text decoration
- **Paint:** Fills, strokes, gradients (linear, radial), patterns
- **Clipping and Masking:** Clip paths, masks
- **Filters:** All SVG filter primitives (blur, color matrix, lighting, etc.)
- **Interactivity:** Animation, scripting (evaluated statically)
- **Structure:** Groups, use elements, symbols, defs

**Structure:**

- `svg/` - SVG test files (526 files)
- `png/` - Reference PNG images (544 files)
- `resources/` - Fonts and other resources used by tests

**Configuration:** Uses `reftest.toml` with glob pattern `svg/**/*.svg` to discover all test files recursively.

### resvg Test Suite

**Source:** [resvg-test-suite](https://github.com/linebender/resvg-test-suite)

A comprehensive feature-focused SVG test suite with over 1,500 SVG tests, each authored and categorized by specific SVG features. Tests are organized by feature category (filters, masking, paint-servers, painting, shapes, structure, text) with reference PNGs co-located alongside SVG files.

### Oxygen Icons

**Source:** [KDE Oxygen Icons](https://github.com/KDE/oxygen-icons5)

The Oxygen icon set provides real-world SVG icon testing with:

- **Icon variety:** Over 4,000 icons across multiple categories (actions, apps, devices, mimetypes, places, etc.)
- **Nested structure:** Icons organized in subdirectories
- **Production quality:** Real-world SVG files used in KDE desktop environment
- **Consistent sizing:** All icons rendered at 256x256 pixels

**Structure:**

- `scalable/` - SVG source files organized by category (actions, apps, devices, etc.)
- `256x256/` - Reference PNG images at 256x256 resolution, mirroring the scalable directory structure

**Configuration:** Uses `reftest.toml` with glob pattern `scalable/**/*.svg` to match nested SVG files.

## Animated-profile conformance

The static corpora above continue to evaluate animation-bearing files as base
scenes. That is separate from conformance to [SVG Animation Profile
0](./animation) and its cumulative [Profile 1 keyframe/easing
extension](./animation-keyframes), which sample an explicit document time.

Animated-profile conformance runs must use value assertions first, then
scene/query assertions, then pixel comparison against an explicitly sought
browser frame and the applicable web-platform-tests. Wall-clock screenshot
timing is not an oracle. A compatibility result must record the profile
revision, fixture/corpus revision, browser build, exact sample time, and static
materializer revision. The profile defines the required boundary, failure,
source-preservation, and seek-independence test laws; this page does not
duplicate that matrix.

## Measuring Method: Pixel Diffing

We use pixel-by-pixel comparison to measure rendering accuracy against reference images.

### Comparison Process

1. **Rendering:** SVG files are rendered to PNG at the exact size of the reference image using camera zoom scaling
2. **Compositing:** Both rendered and reference images are composited over a solid background (white or black) to eliminate transparency-related false positives
3. **Pixel Comparison:** The `dify` crate performs pixel-by-pixel comparison in YIQ color space
4. **Difference Calculation:** Differences are counted and converted to similarity scores

### Similarity Scoring

- **Similarity Score:** 0.0 (completely different) to 1.0 (identical)
- **Difference Percentage:** Percentage of pixels that differ (0.0-100.0%)
- **Alpha Masking:** By default, SVG tests use alpha masking, which excludes fully-transparent pixels from score calculation. This prevents large transparent regions from skewing the mismatch ratio and makes small visible errors more significant relative to the visible content.
