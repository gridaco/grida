# Grida Fonts

A unified font management system that mimics Skia's font collection/font manager approach. Designed for high-performance graphics applications that need to load and manage fonts across different rendering backends.

## What it does

- **Google Fonts Support**: Loads fonts directly from Google Fonts with full metadata support
- **Skia-like Font Management**: Mimics Skia's font collection/font manager pattern for consistent font handling
- **Family-based Loading**: Load fonts by family name, automatically creating the required FontFace/Typeface sets per family
- **CSS2 API Compatibility**: Generates font configurations that match Google Fonts CSS2 API output
- **In-Memory Management**: Manages fonts in memory for passing to WASM modules

## When to use it

- **Canvas/Skia Applications**: When you need font management similar to Skia's approach
- **WASM Graphics**: When passing fonts to WASM modules for rendering
- **Google Fonts Integration**: When you need programmatic access to Google Fonts
- **Cross-Platform Font Handling**: When you need consistent font management across DOM and WASM backends

## Quick Start

### Basic Usage

```typescript
import { FontFaceManager } from "@grida/fonts";

// Load a Google Font family
const manager = new FontFaceManager();
await manager.loadGoogleFont({
  family: "Roboto",
  variants: ["regular", "italic", "700"],
  files: {
    regular: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.ttf",
    italic:
      "https://fonts.gstatic.com/s/roboto/v30/KFOkCnqEu92Fr1Mu51xIIzI.ttf",
    "700":
      "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc9.ttf",
  },
  // ... other metadata
});
```

### WASM Integration

```typescript
import { UnifiedFontManager } from "@grida/fonts";

// Create custom adapter for your WASM graphics system
class WasmFontAdapter {
  async register(bytes: ArrayBuffer, variant) {
    // Register with your WASM font system
    const fontId = await yourWasmSystem.loadFont(bytes, variant);
    return { id: fontId };
  }

  unregister(handle, variant) {
    yourWasmSystem.unloadFont(handle.id);
  }
}

const manager = new UnifiedFontManager(new WasmFontAdapter());
await manager.loadGoogleFont(googleFontData);
```

### Google Fonts Integration

```typescript
import { FontFaceManager } from "@grida/fonts";

// Load Google Fonts data
const response = await fetch("https://fonts.grida.co/webfonts.json");
const googleFonts = await response.json();

const manager = new FontFaceManager();

// Find and load a font family
const roboto = googleFonts.items.find((font) => font.family === "Roboto");
if (roboto) {
  await manager.loadGoogleFont(roboto);
}
```

## Key Features

- **Variable Font Support**: Full support for variable font axes (weight, width, slant)
- **Reference Counting**: Automatic font lifecycle management
- **Memory Efficient**: LRU caching with configurable capacity
- **Type Safe**: Full TypeScript support
- **Backend Agnostic**: Works with DOM, WASM, or custom rendering systems

## Architecture

The system provides a unified interface that works across different backends:

- **DOM Backend**: Uses browser's FontFace API
- **WASM Backend**: Designed for Canvas/Skia rendering
- **Custom Backends**: Pluggable adapter system

## API Overview

### Core Classes

- `FontFaceManager`: DOM-specific manager (easiest to use)
- `UnifiedFontManager`: Core manager with adapter pattern
- `DomFontAdapter`: DOM backend adapter
- `FontAdapter`: Interface for custom backends

### Main Methods

- `loadGoogleFont(font)`: Load a Google Font family
- `loadGoogleFonts(fonts)`: Load multiple font families
- `acquire(source, variant)`: Load specific font variant
- `release(variant)`: Release font reference

## Browser Support

- **DOM Adapter**: Requires FontFace API (Chrome 35+, Firefox 41+, Safari 10+)
- **Core Manager**: Works in any JavaScript environment
- **WASM Adapter**: Depends on your WASM graphics system

## License

MIT
