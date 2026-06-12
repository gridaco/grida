# `@grida/color`

Zero-cost\* type-safe color authoring and parsing library.

```ts
// We recommend using "kolor" instead of "color" to avoid name conflicts
import kolor from "@grida/color";
```

## Features

- **Zero-cost**: No runtime validation, pure TypeScript types
- **Type-safe**: Branded types prevent mixing incompatible color formats
- **Convenient**: Helper functions for common operations (`fromHEX`, `newRGB888A32F`, etc.)
- **Color parsing**: Parse hex, rgb, hsl, named colors, and more
- **Color resolution**: Resolve CSS color strings to canonical sRGB — no DOM or canvas required; out-of-scope inputs (`currentColor`, `lab()`/`oklch()`, malformed) return `null`, never a guess
- **Color names**: Access to CSS color names mapping
- **Zero-dependency**: No external dependencies

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

## Color Parsing

Parse various color formats (hex, rgb, hsl, named colors, etc.):

```ts
import kolor from "@grida/color";

// Parse any color string
const parsed = kolor.parse("#ff0000");
// { space: "rgb", values: [255, 0, 0], alpha: 1 }

kolor.parse("rgb(255, 0, 0)");
kolor.parse("hsl(0, 100%, 50%)");
kolor.parse("blue");
```

## Color Resolution

Resolve a CSS `<color>` string to its canonical sRGB form — pure TypeScript, works in headless environments (no DOM, no canvas):

```ts
import kolor from "@grida/color";

// resolve to a branded RGB888A32F struct (r/g/b 0-255 ints, a 0-1)
kolor.resolve("hsl(217 91% 60%)");
// { r: 60, g: 131, b: 246, a: 1 }

kolor.resolve("rgba(255, 0, 0, 0.5)");
// { r: 255, g: 0, b: 0, a: 0.5 }

// resolve straight to a lowercase hex string
kolor.resolveHEX("red"); // "#ff0000"  (#rrggbb when the quantized alpha byte is 0xff)
kolor.resolveHEX("rgba(255, 0, 0, 0.5)"); // "#ff000080"  (#rrggbbaa otherwise)
```

**Resolvable**: named colors, `transparent` (→ `rgba(0, 0, 0, 0)` per CSS), 3/4/6/8-digit hex, `rgb()`/`rgba()`, `hsl()`/`hsla()` (CSS Color 4 §7), `hwb()` (CSS Color 4 §8), and integers in `[0x000000, 0xFFFFFF]` read as `0xRRGGBB`.

**Not resolvable** — returns `null`, never a guess: `currentColor` (context-dependent), `lab()`/`lch()`/`oklab()`/`oklch()`/`color()` (gamut mapping out of scope), non-CSS spaces, and malformed input. `resolve` never throws.

**Strict input gate.** `resolve` enforces null-never-guess up front; the underlying permissive `parse` is left untouched (it still coerces and guesses — strictness is `resolve`'s contract, not `parse`'s). Rejected at the gate:

- malformed hex — wrong digit count or non-hex digits: `"#zzz"`, `"###"`, `"#12345"`, `"#1234567"` → `null`
- bare channel lists — not CSS colors: `"1 2 3"`, `"255, 0, 0"` → `null`
- unclosed or malformed function syntax: `"rgb(255,0,0"` → `null` (the `(` must directly follow the function name and the `)` must close it, per CSS)
- percentage hue in `hsl()`/`hsla()`/`hwb()` — invalid CSS that the permissive parser would misread as a 0–100 hue: `"hsl(50% 100% 50%)"` → `null`
- numbers outside the integer `[0x000000, 0xFFFFFF]` range — negative, fractional, `NaN`, or too large: `-1`, `0.5`, `0x1FFFFFF` → `null` (never wrapped or truncated)

Inside an accepted function form, channel arity and numericity are still validated after parsing (`"rgb(1, 2)"`, `"hsl(foo, 10%, 10%)"` → `null`); the semantics of valid channels defer to `parse`.

Edge semantics match browsers: input is trimmed and case-insensitive, hue wraps mod 360, saturation/lightness/whiteness/blackness clamp to `[0, 100]`, rgb channels clamp to `[0, 255]` and round to integers, alpha clamps to `[0, 1]`.

`resolveHEX` emits one canonical spelling per quantized color: alpha is quantized to 8 bits, and `#rrggbb` is chosen whenever the quantized alpha byte is `0xff` — so `resolveHEX("rgba(255, 0, 0, 0.999)")` is `"#ff0000"`, not `"#ff0000ff"`.

The result is a branded `colorformats.RGB888A32F`, so all struct conversions compose:

```ts
const c = kolor.resolve("hsl(217 91% 60%)");
if (c) kolor.colorformats.RGB888A32F.intoRGBA32F(c); // 0-1 float struct
```

## Color Names

Access CSS color names mapping:

```ts
import kolor from "@grida/color";

kolor.names["red"]; // [255, 0, 0]
kolor.names["blue"]; // [0, 0, 255]
kolor.names["lime"]; // [0, 255, 0]
```

\* Zero-cost at runtime. Type checking happens at compile time.
