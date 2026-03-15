/**
 * Check if .fig fixtures are available (not Git LFS pointers).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const LFS_POINTER_PREFIX = "version ";

export function isFigFixtureAvailable(): boolean {
  const blankPath = resolve(
    __dirname,
    "../../../fixtures/test-fig/L0/blank.fig"
  );
  if (!existsSync(blankPath)) return false;
  try {
    const buf = readFileSync(blankPath);
    const prelude = buf.slice(0, LFS_POINTER_PREFIX.length).toString("ascii");
    return prelude !== LFS_POINTER_PREFIX;
  } catch {
    return false;
  }
}
