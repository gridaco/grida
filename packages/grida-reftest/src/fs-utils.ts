import * as fs from "node:fs";
import * as path from "node:path";

/** Recursively create a directory (mkdir -p). No-op if it exists. */
export function mkdirp(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Remove a directory and all its contents. No-op if missing. */
export function rmrf(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Sanitize a string for use as a directory name — matches the Rust
 * runner's `sanitize_dir_name`: anything not [A-Za-z0-9_-] becomes `_`.
 */
export function sanitizeDirName(name: string): string {
  let out = "";
  for (const ch of name) {
    const code = ch.charCodeAt(0);
    const ok =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      ch === "-" ||
      ch === "_";
    out += ok ? ch : "_";
  }
  return out;
}

/** Write a JSON file with pretty formatting and a trailing newline. */
export function writeJsonFile(filePath: string, data: unknown): void {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}
