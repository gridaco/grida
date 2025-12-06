/**
 * Blob parsers for Kiwi binary data formats.
 *
 * This module provides unopinionated parsers for Figma's binary blob formats:
 * - Path commands (commandsBlob)
 * - Vector networks (vectorNetworkBlob)
 *
 * Based on the Kiwi message protocol specification.
 * Reference implementation: .ref/local/fig2json/parser.rs
 */

/**
 * Parse binary path commands into array format.
 *
 * Converts binary path command data into a flat array:
 * `["M", x, y, "L", x, y, "Q", cx, cy, x, y, "C", cx1, cy1, cx2, cy2, x, y, "Z"]`
 *
 * **Binary format (little-endian):**
 * - Command type (u8):
 *   - 0: Z (close path, no coordinates)
 *   - 1: M (move to, 2 f32: x, y)
 *   - 2: L (line to, 2 f32: x, y)
 *   - 3: Q (quadratic curve, 4 f32: cx, cy, x, y)
 *   - 4: C (cubic curve, 6 f32: cx1, cy1, cx2, cy2, x, y)
 * - Coordinates are stored as little-endian f32 values
 *
 * @param bytes - Binary command data from commandsBlob
 * @returns Array of command strings and coordinates, or null if invalid
 *
 * @example
 * ```typescript
 * const blobBytes = getBlobBytes(path.commandsBlob, message);
 * const commands = parseCommandsBlob(blobBytes);
 * // ["M", 10, 20, "L", 30, 40, "Z"]
 * ```
 */
export function parseCommandsBlob(
  bytes: Uint8Array
): Array<string | number> | null {
  const commands: Array<string | number> = [];
  let offset = 0;

  while (offset < bytes.length) {
    const cmdType = bytes[offset];
    offset += 1;

    switch (cmdType) {
      case 0: {
        // Z - close path
        commands.push("Z");
        break;
      }
      case 1: {
        // M - move to (x, y)
        if (offset + 8 > bytes.length) return null;

        const x = readF32LE(bytes, offset);
        const y = readF32LE(bytes, offset + 4);
        offset += 8;

        commands.push("M", x, y);
        break;
      }
      case 2: {
        // L - line to (x, y)
        if (offset + 8 > bytes.length) return null;

        const x = readF32LE(bytes, offset);
        const y = readF32LE(bytes, offset + 4);
        offset += 8;

        commands.push("L", x, y);
        break;
      }
      case 3: {
        // Q - quadratic curve (cx, cy, x, y)
        if (offset + 16 > bytes.length) return null;

        const cx = readF32LE(bytes, offset);
        const cy = readF32LE(bytes, offset + 4);
        const x = readF32LE(bytes, offset + 8);
        const y = readF32LE(bytes, offset + 12);
        offset += 16;

        commands.push("Q", cx, cy, x, y);
        break;
      }
      case 4: {
        // C - cubic curve (cx1, cy1, cx2, cy2, x, y)
        if (offset + 24 > bytes.length) return null;

        const cx1 = readF32LE(bytes, offset);
        const cy1 = readF32LE(bytes, offset + 4);
        const cx2 = readF32LE(bytes, offset + 8);
        const cy2 = readF32LE(bytes, offset + 12);
        const x = readF32LE(bytes, offset + 16);
        const y = readF32LE(bytes, offset + 20);
        offset += 24;

        commands.push("C", cx1, cy1, cx2, cy2, x, y);
        break;
      }
      default:
        // Unknown command type
        return null;
    }
  }

  return commands;
}

/**
 * Vector network structure (vertices, segments, regions)
 */
export interface VectorNetwork {
  vertices: Array<{ styleID: number; x: number; y: number }>;
  segments: Array<{
    styleID: number;
    start: { vertex: number; dx: number; dy: number };
    end: { vertex: number; dx: number; dy: number };
  }>;
  regions: Array<{
    styleID: number;
    windingRule: "NONZERO" | "ODD";
    loops: Array<{ segments: number[] }>;
  }>;
}

/**
 * Parse binary vector network into structured object.
 *
 * **Binary format (little-endian):**
 * - Header: vertexCount (u32), segmentCount (u32), regionCount (u32)
 * - Vertices: [styleID (u32), x (f32), y (f32)] × vertexCount
 * - Segments: [styleID (u32), startVertex (u32), start.dx (f32), start.dy (f32),
 *              endVertex (u32), end.dx (f32), end.dy (f32)] × segmentCount
 * - Regions: [styleID+windingRule (u32), loopCount (u32),
 *             loops: [indexCount (u32), indices (u32[])]] × regionCount
 *
 * @param bytes - Binary vector network data from vectorNetworkBlob
 * @returns Parsed vector network, or null if invalid
 *
 * @example
 * ```typescript
 * const blobBytes = getBlobBytes(vectorData.vectorNetworkBlob, message);
 * const network = parseVectorNetworkBlob(blobBytes);
 * // { vertices: [...], segments: [...], regions: [...] }
 * ```
 */
export function parseVectorNetworkBlob(
  bytes: Uint8Array
): VectorNetwork | null {
  if (bytes.length < 12) return null;

  // Read header
  const vertexCount = readU32LE(bytes, 0);
  const segmentCount = readU32LE(bytes, 4);
  const regionCount = readU32LE(bytes, 8);

  let offset = 12;

  // Parse vertices
  const vertices: VectorNetwork["vertices"] = [];
  for (let i = 0; i < vertexCount; i++) {
    if (offset + 12 > bytes.length) return null;

    const styleID = readU32LE(bytes, offset);
    const x = readF32LE(bytes, offset + 4);
    const y = readF32LE(bytes, offset + 8);
    offset += 12;

    vertices.push({ styleID, x, y });
  }

  // Parse segments
  const segments: VectorNetwork["segments"] = [];
  for (let i = 0; i < segmentCount; i++) {
    if (offset + 28 > bytes.length) return null;

    const styleID = readU32LE(bytes, offset);
    const startVertex = readU32LE(bytes, offset + 4);
    const startDx = readF32LE(bytes, offset + 8);
    const startDy = readF32LE(bytes, offset + 12);
    const endVertex = readU32LE(bytes, offset + 16);
    const endDx = readF32LE(bytes, offset + 20);
    const endDy = readF32LE(bytes, offset + 24);
    offset += 28;

    // Validate vertex indices
    if (startVertex >= vertexCount || endVertex >= vertexCount) {
      return null;
    }

    segments.push({
      styleID,
      start: { vertex: startVertex, dx: startDx, dy: startDy },
      end: { vertex: endVertex, dx: endDx, dy: endDy },
    });
  }

  // Parse regions
  const regions: VectorNetwork["regions"] = [];
  for (let i = 0; i < regionCount; i++) {
    if (offset + 8 > bytes.length) return null;

    // styleID and winding rule are packed into one u32
    const styleAndRule = readU32LE(bytes, offset);
    const windingRule = (styleAndRule & 1) !== 0 ? "NONZERO" : "ODD";
    const styleID = styleAndRule >> 1;

    const loopCount = readU32LE(bytes, offset + 4);
    offset += 8;

    const loops: Array<{ segments: number[] }> = [];
    for (let j = 0; j < loopCount; j++) {
      if (offset + 4 > bytes.length) return null;

      const indexCount = readU32LE(bytes, offset);
      offset += 4;

      if (offset + indexCount * 4 > bytes.length) return null;

      const segments: number[] = [];
      for (let k = 0; k < indexCount; k++) {
        const segmentIndex = readU32LE(bytes, offset);
        offset += 4;

        // Validate segment index
        if (segmentIndex >= segmentCount) {
          return null;
        }

        segments.push(segmentIndex);
      }

      loops.push({ segments });
    }

    regions.push({ styleID, windingRule, loops });
  }

  return { vertices, segments, regions };
}

// --- Helper functions for reading binary data ---

/**
 * Read u32 (little-endian) from buffer at offset
 */
function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  ); // >>> 0 ensures unsigned
}

/**
 * Read f32 (little-endian) from buffer at offset
 */
function readF32LE(bytes: Uint8Array, offset: number): number {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint8(0, bytes[offset]);
  view.setUint8(1, bytes[offset + 1]);
  view.setUint8(2, bytes[offset + 2]);
  view.setUint8(3, bytes[offset + 3]);
  return view.getFloat32(0, true); // true = little-endian
}
