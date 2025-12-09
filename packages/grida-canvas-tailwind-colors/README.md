# `@grida/tailwindcss-colors`

Tailwind CSS color data package for programmatic access.

This package provides Tailwind CSS color palettes in JSON format for applications that need to **programmatically access** Tailwind color values (e.g., building custom color pickers, canvas rendering, dynamic color manipulation). Colors are sourced directly from the official Tailwind CSS package.

> **When to use this package:** You need Tailwind color values in your JavaScript/TypeScript code (e.g., `colors.slate["500"]`).  
> **When NOT to use this package:** You only need Tailwind colors in CSS - use Tailwind CSS directly instead.

## Features

- **🌳 Tree-shakable** - Import only the format you need. Bundlers automatically exclude unused formats from your bundle.
- **📦 Lightweight** - ~96KB total (all formats). Individual JSON files are ~5.5-16KB each.
- **🎯 Modular exports** - Each format is a separate file with explicit `exports` mapping for optimal tree-shaking.
- **📊 Multiple formats** - RGB, RGBF, RGBA, HEX, and OKLCH formats for different use cases.
- **🔢 Numerically sorted** - Colors are sorted by shade (50, 100, 200...) for predictable iteration.
- **📝 TypeScript support** - Full TypeScript definitions included for all JSON formats.
- **🎨 Complete palette** - All 22 Tailwind CSS v4 color families with 11 shades each (242 colors total).

## Overview

This package contains the complete Tailwind CSS color system in multiple formats:

**JSON Files** (for programmatic access - **main purpose**):

| Format    | File              | Value Type     | Unit         | Description                                                    |
| --------- | ----------------- | -------------- | ------------ | -------------------------------------------------------------- |
| **RGB**   | `json/rgb.json`   | `[r, g, b]`    | RGB888       | RGB values as integers (0-255)                                 |
| **RGBF**  | `json/rgbf.json`  | `[r, g, b]`    | RGB32F       | RGB values as floats (0-1)                                     |
| **RGBA**  | `json/rgba.json`  | `[r, g, b, a]` | `RGB888A32F` | RGB values as integers (0-255), alpha as float (0-1, always 1) |
| **HEX**   | `json/hex.json`   | `string`       | -            | Hex color strings (e.g., `"#64748e"`)                          |
| **OKLCH** | `json/oklch.json` | `[l, c, h]`    | -            | OKLCH values: lightness (0-1), chroma (0+), hue (0-360)        |

**CSS Files** (not recommended - use Tailwind CSS directly):

- **RGB** (`css/rgb.css`) - Colors in `rgb()` format
- **RGBA** (`css/rgba.css`) - Colors in `rgba()` format
- **HEX** (`css/hex.css`) - Colors in hexadecimal format
- **OKLCH** (`css/oklch.css`) - Colors in OKLCH format

## Installation

```bash
npm install @grida/tailwindcss-colors
# or
pnpm add @grida/tailwindcss-colors
# or
yarn add @grida/tailwindcss-colors
```

## Usage

> **Note:** This package is designed for **programmatic access** to Tailwind color values. If you only need Tailwind colors in CSS, use Tailwind CSS directly - there's no reason to install this package.

### CSS Files (Not Recommended)

<details>
<summary>CSS files are provided for completeness, but are not the intended use case.</summary>

If you need Tailwind colors in CSS, use Tailwind CSS directly:

```css
/* Use Tailwind CSS instead */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Then use Tailwind classes */
.my-element {
  @apply bg-slate-500 text-gray-100;
}
```

The CSS files in this package are only provided for edge cases where you need CSS custom properties without Tailwind CSS:

```css
@import "@grida/tailwindcss-colors/css/rgba.css";
```

```css
.my-element {
  background-color: var(--slate-500);
  color: var(--gray-100);
}
```

</details>

### JSON Files (Recommended)

**Main Purpose:** This package is designed for applications that need to **programmatically access** Tailwind color values, such as:

- Building custom color pickers
- Dynamic color manipulation
- Canvas/graphics rendering
- Color analysis and processing
- Any use case where you need the actual color values in code

#### TypeScript Setup

To import JSON files in TypeScript, add `resolveJsonModule` to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "resolveJsonModule": true
  }
}
```

#### Importing Colors

Import JSON files for programmatic access. The package provides TypeScript types automatically:

```typescript
// RGB array [r, g, b] - nested by color family
import rgbColors from "@grida/tailwindcss-colors/json/rgb.json";
const slate500 = rgbColors.slate["500"]; // [98, 116, 142]

// RGBF array [r, g, b] - RGB values as floats (0-1)
import rgbfColors from "@grida/tailwindcss-colors/json/rgbf.json";
const slate500Rgbf = rgbfColors.slate["500"]; // [0.384, 0.455, 0.557]

// RGBA array [r, g, b, a] - RGB: 0-255, Alpha: 0-1 (always 1 for Tailwind colors)
import rgbaColors from "@grida/tailwindcss-colors/json/rgba.json";
const slate500Rgba = rgbaColors.slate["500"]; // [98, 116, 142, 1]

// Hex string
import hexColors from "@grida/tailwindcss-colors/json/hex.json";
const slate500Hex = hexColors.slate["500"]; // "#64748e"

// OKLCH array [l, c, h]
import oklchColors from "@grida/tailwindcss-colors/json/oklch.json";
const slate500Oklch = oklchColors.slate["500"]; // [0.384, 0.015, 255.59]

// Access all shades of a color family
const allSlateColors = rgbColors.slate; // { "50": [...], "100": [...], ... }

// Iterate over color families
Object.keys(rgbColors).forEach((family) => {
  console.log(`Color family: ${family}`);
  console.log(`Available shades:`, Object.keys(rgbColors[family]));
});
```

#### JavaScript (CommonJS)

```javascript
// Only import what you need - modular exports enable tree-shaking
const rgbColors = require("@grida/tailwindcss-colors/json/rgb.json");
const slate500 = rgbColors.slate["500"]; // [98, 116, 142]
```

#### Tree-shaking

This package is fully tree-shakable. When you import a specific format, bundlers (webpack, Rollup, Vite, etc.) will only include that file in your bundle:

```typescript
// ✅ Only rgb.json is included (~6.6KB)
import rgbColors from "@grida/tailwindcss-colors/json/rgb.json";

// ✅ Only hex.json is included (~5.5KB)
import hexColors from "@grida/tailwindcss-colors/json/hex.json";

// ❌ Unused formats are automatically excluded
// rgba.json, rgbf.json, oklch.json are NOT bundled
```

The `exports` field in `package.json` ensures that only explicitly imported files are included in your bundle.

#### Usage Examples

**React Component:**

```typescript
import hexColors from "@grida/tailwindcss-colors/json/hex.json";

function ColorSwatch({ family, shade }: { family: string; shade: string }) {
  const color = hexColors[family]?.[shade];
  return (
    <div style={{ backgroundColor: color }}>
      {family}-{shade}
    </div>
  );
}
```

**Canvas Rendering:**

```typescript
import rgbaColors from "@grida/tailwindcss-colors/json/rgba.json";

// RGBA: RGB values are 0-255, alpha is 0-1 (always 1 for Tailwind colors)
const [r, g, b, a] = rgbaColors.slate["500"]; // [98, 116, 142, 1]
ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`; // rgba(98, 116, 142, 1)
ctx.fillRect(0, 0, 100, 100);
```

**Dynamic Color Selection:**

```typescript
import rgbColors from "@grida/tailwindcss-colors/json/rgb.json";

function getColor(family: string, shade: string): [number, number, number] {
  return rgbColors[family]?.[shade] ?? [0, 0, 0];
}

const primaryColor = getColor("blue", "500"); // [43, 127, 255]
```

## Color Palette

The package includes all standard Tailwind v4 color families:

- Slate, Gray, Zinc, Neutral, Stone
- Red, Orange, Amber, Yellow, Lime, Green, Emerald, Teal, Cyan, Sky, Blue, Indigo, Violet, Purple, Fuchsia, Pink, Rose

Each color family includes shades from `50` to `950`.

## Format

### JSON Format

JSON files use a nested structure grouped by color family:

```json
{
  "slate": {
    "50": [248, 250, 252],
    "100": [241, 245, 249],
    ...
    "950": [2, 6, 23]
  },
  "blue": {
    ...
  }
}
```

### CSS Format

CSS files provide colors as CSS custom properties following the pattern:

```css
:root {
  --{color-name}-{shade}: {color-value};
}
```

For example:

- `--slate-50`: Lightest shade
- `--slate-500`: Middle shade
- `--slate-950`: Darkest shade

## Which one to use?

Choose the format that best fits your use case:

- **RGB** (`rgb.json`) - Use when you need integer RGB values (0-255). Most compact format. Unit: `RGB888`.
- **RGBF** (`rgbf.json`) - Use when you need floating-point RGB values (0-1) for WebGL, shaders, or graphics APIs. Slightly larger file size due to floating-point storage. Unit: `RGB32F`.
- **RGBA** (`rgba.json`) - Use when you need RGB with alpha channel. RGB values are integers (0-255), alpha is float (0-1). Unit: `RGB888A32F`.
- **HEX** (`hex.json`) - Use for web development, CSS, or when you need human-readable color strings.
- **OKLCH** (`oklch.json`) - Use for perceptual color operations, color mixing, or modern color spaces.

> **Note:** RGBF is slightly larger than RGB as it stores numbers in floating-point format. If you are very sensitive about bundle size, use `rgb.json` instead.

## Notes

- Colors are sourced directly from the official Tailwind CSS package (`tailwindcss/colors`)
- Package version matches Tailwind CSS version for consistency
- Alpha channel (`a`) is always `1` for all colors in Tailwind CSS v4 colors
- Use the format that best suits your rendering needs (RGBA for canvas, HEX for web, OKLCH for modern color spaces)
