# `@grida/color`

Zero-cost\* type-safe color authoring and parsing library.

```ts
// We recommend using "kolor" instead of "color" to avoid name conflicts
import kolor from "@grida/color";
```

## Problem

TypeScript can't distinguish between color formats with different component ranges when they share the same structure:

```ts
👎 Without branded types

type RGBA32F = { r: number; g: number; b: number; a: number };
type RGB888A32F = { r: number; g: number; b: number; a: number };

const color1: RGBA32F = { r: 1, g: 1, b: 1, a: 1 };        // white (0-1 range)
const color2: RGB888A32F = { r: 255, g: 255, b: 255, a: 1 }; // white (0-255 range)

function processColor(color: RGBA32F) {
  // Designed for RGBA32F, not RGB888A32F
}

processColor(color1); // ✅ Works
processColor(color2); // ❌ Also works, but shouldn't!
```

## Solution

Branded types ensure type safety without runtime overhead:

```ts
👍 With branded types

import kolor from "@grida/color";

const color1 = kolor.colorformats.newRGBA32F(1, 1, 1, 1);
const color2 = kolor.colorformats.RGB888A32F.fromHEX("#ffffff");

function processColor(color: kolor.colorformats.RGBA32F) {
  // Only accepts RGBA32F
}

processColor(color1); // ✅ Works
processColor(color2); // ❌ TypeScript error!
```

## Features

- **Zero-cost**: No runtime validation, pure TypeScript types
- **Type-safe**: Branded types prevent mixing incompatible color formats
- **Convenient**: Helper functions for common operations (`fromHEX`, `newRGB888A32F`, etc.)

\* Zero-cost at runtime. Type checking happens at compile time.
