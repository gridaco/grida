// Helpers for creating test PNG fixtures in-memory. The fixtures used by
// __tests__ are generated on demand rather than checked in — they are
// small solid colors and easy to regenerate deterministically.

import { PNG } from "pngjs";
import * as fs from "node:fs";
import * as path from "node:path";

export function makeSolidPng(
  width: number,
  height: number,
  rgba: [number, number, number, number]
): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgba[0];
    png.data[i + 1] = rgba[1];
    png.data[i + 2] = rgba[2];
    png.data[i + 3] = rgba[3];
  }
  return PNG.sync.write(png);
}

export function makeGridPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number]
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const i = (y * width + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

export function writeFixture(dir: string, name: string, buf: Buffer): string {
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, name);
  fs.writeFileSync(full, buf);
  return full;
}
