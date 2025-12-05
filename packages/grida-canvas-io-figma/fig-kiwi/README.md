# fig-kiwi

Unopinionated parser for Figma's proprietary Kiwi format.

## Purpose

fig-kiwi is a low-level parser for Figma's binary file format (`.fig` files) and clipboard data. It decodes the Kiwi schema and provides raw access to Figma's internal data structures without interpretation or transformation.

## Philosophy

- **Agnostic**: Does not assume how the data will be used
- **Spec-centric**: Follows the Kiwi binary format specification as-is
- **Low maintenance**: Minimal abstraction layers
- **Concise**: As short as possible while remaining readable
- **Zero opinions**: No business logic, no transformations, just parsing

## Goals

- Parse `.fig` files (both raw and ZIP archives)
- Parse Figma HTML clipboard data
- Decode Kiwi binary schema
- Extract binary blobs (vector networks, commands)
- Provide utilities for working with ZIP archive structure
- Export raw Kiwi types for consumption

## Non-Goals

- Converting to other formats (handled by parent `@grida/io-figma` module)
- Image resolution or processing
- Node tree manipulation
- Layout computation
- Style interpretation
- Component instance resolution
- REST API integration

## Architecture

```
┌─────────────────────────────────────────┐
│  .fig File / HTML Clipboard             │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  fig-kiwi Parser                        │
│  - Archive handling                     │
│  - Schema decoding                      │
│  - Binary blob parsing                  │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Raw Kiwi Data Structures               │
│  - Message                              │
│  - NodeChange[]                         │
│  - Blobs                                │
└─────────────────────────────────────────┘
```

## Usage

### Parse .fig File

```typescript
import { readFigFile } from "@grida/io-figma/fig-kiwi";

const figData = readFigFile(fileBytes);

// Access raw structures
console.log(figData.header); // Header info
console.log(figData.schema); // Raw schema definitions
console.log(figData.message); // Parsed Kiwi message
console.log(figData.preview); // Preview image
console.log(figData.zip_files); // ZIP contents (if archive)
```

### Parse HTML Clipboard

```typescript
import { readHTMLMessage } from "@grida/io-figma/fig-kiwi";

const clipboardData = readHTMLMessage(htmlString);

console.log(clipboardData.meta); // File metadata
console.log(clipboardData.message); // Parsed Kiwi message
```

### Extract Binary Blobs

```typescript
import { getBlobBytes, parseVectorNetworkBlob } from "@grida/io-figma/fig-kiwi";

const vectorNode = figData.message.nodeChanges.find(
  (nc) => nc.type === "VECTOR"
);

if (vectorNode?.vectorData?.vectorNetworkBlob) {
  const blobBytes = getBlobBytes(
    vectorNode.vectorData.vectorNetworkBlob,
    figData.message
  );

  if (blobBytes) {
    const vectorNetwork = parseVectorNetworkBlob(blobBytes);
    // vectorNetwork: { vertices, segments, regions }
  }
}
```

### Work with ZIP Archives

```typescript
import {
  extractImages,
  imageHashToString,
  getThumbnail,
  getMeta,
} from "@grida/io-figma/fig-kiwi";

// Check if .fig file is a ZIP archive
if (figData.zip_files) {
  // Extract all images from images/ directory
  const images = extractImages(figData.zip_files);

  // Get thumbnail.png
  const thumbnail = getThumbnail(figData.zip_files);

  // Parse meta.json
  const meta = getMeta(figData.zip_files);

  // Convert image hash to lookup key
  const hash = imageHashToString(node.fillPaints[0].image.hash);
  const imageBytes = images.get(hash);
}
```

## Data Structures

### ParsedFigmaArchive

```typescript
interface ParsedFigmaArchive {
  header: { prelude: string; version: number };
  schema: any; // Raw schema definitions
  message: Message; // Parsed Kiwi message
  preview: Uint8Array; // Preview image
  zip_files?: { [key: string]: Uint8Array }; // ZIP contents
}
```

### Message

Contains all Figma document data:

- `nodeChanges`: Array of node modifications
- `blobs`: Binary data (vector networks, commands)
- `blobBaseIndex`: Offset for blob resolution

### NodeChange

Represents a single Figma node with properties like:

- `type`: Node type (FRAME, RECTANGLE, TEXT, etc.)
- `guid`: Node identifier
- `name`, `visible`, `locked`, etc.
- `transform`, `size`, `opacity`, etc.
- `fillPaints`, `strokePaints`, `effects`
- Type-specific data (textData, vectorData, arcData, etc.)

## ZIP Archive Structure

When a `.fig` file is a ZIP archive, it contains:

- `canvas.fig` - Main Kiwi binary (auto-extracted by parser)
- `images/{sha1-hash}` - Image files named by SHA-1 hash
- `thumbnail.png` - File thumbnail
- `meta.json` - File metadata

All files available in `zip_files` for custom processing.

## Testing

```bash
# Run all tests
pnpm test

# Run specific test suite
pnpm test fig-kiwi/__tests__/archive.test.ts
```

## API Reference

### File Parsers

- `readFigFile(data: Uint8Array): ParsedFigmaArchive`
- `writeFigFile(settings): Uint8Array`
- `readHTMLMessage(html: string): ParsedFigmaHTML`
- `writeHTMLMessage(message): string`

### Archive Utilities

- `extractImages(zipFiles): Map<string, Uint8Array>`
- `imageHashToString(hash: Uint8Array): string`
- `getThumbnail(zipFiles): Uint8Array | undefined`
- `getMeta(zipFiles): any | undefined`

### Blob Parsers

- `getBlobBytes(blobId: number, message: Message): Uint8Array | null`
- `parseVectorNetworkBlob(bytes: Uint8Array): VectorNetwork`
- `parseCommandsBlob(bytes: Uint8Array): (string | number)[]`

### Types

Exports all Kiwi schema types:

- `Message`, `NodeChange`, `Paint`, `Effect`
- `Color`, `Matrix`, `Vector`
- `BlendMode`, `StrokeAlign`, `StrokeCap`, `StrokeJoin`

## License

See parent package `@grida/io-figma`.
