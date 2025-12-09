# Contributing to `@grida/tailwindcss-colors`

This document is for contributors and maintainers of this package.

## Generating Color Files

The color data files (CSS and JSON) are generated programmatically from the official Tailwind CSS color data. **Do not edit these files manually** - they will be overwritten when regenerated.

### Running the Generation Script

The generation script uses Deno to fetch colors from `tailwindcss/colors` and generate all format files:

```bash
pnpm generate
# or
deno run --allow-read --allow-write --allow-net scripts/generate.ts
```

### What Gets Generated

The script generates:

**CSS Files:**

- `css/rgb.css` - Colors in `rgb()` format
- `css/rgba.css` - Colors in `rgba()` format
- `css/hex.css` - Colors in hexadecimal format
- `css/oklch.css` - Colors in OKLCH format

**JSON Files:**

- `json/rgb.json` - Colors as `[r, g, b]` arrays (0-255, nested by color family)
- `json/rgbf.json` - Colors as `[r, g, b]` arrays (0-1 floats, nested by color family)
- `json/rgba.json` - Colors as `[r, g, b, a]` arrays (RGB: 0-255, alpha: 0-1, nested by color family)
- `json/hex.json` - Colors as hex strings (nested by color family)
- `json/oklch.json` - Colors as `[l, c, h]` arrays (nested by color family)

**TypeScript Declaration Files:**

- `json/*.json.d.ts` - Type definitions for each JSON file

### How It Works

1. The script imports colors from `npm:tailwindcss@^4/colors`
2. It flattens the nested color structure and processes each color
3. Uses `colorjs.io` for color space conversions (RGB → OKLCH, RGB → RGBF)
4. Generates CSS files with CSS custom properties
5. Generates JSON files with nested structure: `{ [family]: { [shade]: value } }`
6. TypeScript declaration files are manually maintained (update when color families change)

### Updating Package Version

When Tailwind CSS releases a new version:

1. Update the `version` field in `package.json` to match the Tailwind CSS version
2. Regenerate the color files using the script above
3. Verify that the generated files are correct

### Deprecated Colors

The script automatically ignores deprecated/renamed colors from Tailwind v3:

- `lightBlue` → `sky`
- `trueGray` → `neutral`
- `coolGray` → `gray`
- `warmGray` → `stone`
- `blueGray` → `slate`

These are defined in the `ignore` array in `scripts/generate.ts`.
