# Typr - TypeScript Font Parser

This is Grida's TypeScript implementation of a font parser, based on the original [Typr.js](https://github.com/photopea/Typr.js) library.

## Overview

This implementation provides comprehensive font parsing capabilities with strong TypeScript typing. It supports parsing various font formats including TTF, OTF, WOFF, and variable fonts.

## Features

- **Strong TypeScript Typing**: Comprehensive type definitions for all font tables and structures
- **Multiple Font Formats**: Support for TTF, OTF, WOFF, and variable fonts
- **Complete Font Table Support**: Parsing of all major OpenType tables
- **Variable Font Support**: Full support for variable font axes and instances
- **Null Safety**: Optional chaining and proper null checking throughout
- **Backward Compatibility**: All existing code continues to work without modification

## Supported Font Tables

- **Core Tables**: CMAP, HEAD, HHEA, MAXP, HMTX, NAME, OS/2, POST, LOCA, KERN, GLYF
- **Advanced Features**: CFF, GSUB, CBLC, CBDT, SVG, COLR, CPAL, SBIX
- **Variable Fonts**: FVAR, GVAR, AVAR, HVAR

## Usage

```typescript
import { Typr } from "@grida/fonts/typr";

// Parse a font file
const fontData = Typr.parse(fontBuffer);
const font = fontData[0];

// Access font properties safely
const weight = font["OS/2"]?.usWeightClass;
const family = font.name?.fontFamily;
const axes = font.fvar?.[0]?.map((a: any) => a[0]) || [];
```

## Type Safety

All font table properties are properly typed and marked as optional for safe access:

```typescript
// Safe property access with optional chaining
const weight = font["OS/2"]?.usWeightClass;
const name = font.name?.fontFamily;

// Type-safe table access
const nameTable: NameTable | undefined = font.name;
```

## Original Library

This implementation is based on the original [Typr.js](https://github.com/photopea/Typr.js) library by Photopea, which is licensed under MIT.

## License

MIT License
