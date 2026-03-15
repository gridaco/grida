/**
 * Check if the WASM binary is available and valid (not a Git LFS pointer).
 * When LFS hasn't pulled the real binary, the file contains "version https://..."
 * instead of the WASM magic bytes (0x00 0x61 0x73 0x6d).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const WASM_MAGIC = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);

export function isWasmAvailable(): boolean {
  const wasmPath = resolve(process.cwd(), "lib/bin/grida_canvas_wasm.wasm");
  if (!existsSync(wasmPath)) return false;
  try {
    const buf = readFileSync(wasmPath);
    if (buf.length < 4) return false;
    return (
      buf[0] === WASM_MAGIC[0] &&
      buf[1] === WASM_MAGIC[1] &&
      buf[2] === WASM_MAGIC[2] &&
      buf[3] === WASM_MAGIC[3]
    );
  } catch {
    return false;
  }
}
