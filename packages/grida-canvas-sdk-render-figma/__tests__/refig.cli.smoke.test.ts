/**
 * Publish smoke test: packed tarball must run when installed in isolation.
 *
 * Ensures the package works for npm consumers (no workspace deps at runtime).
 * Run via: pnpm test (or vitest run)
 */
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Minimal Figma REST API document JSON (one frame with a solid fill). */
const MINIMAL_REST_FIXTURE = {
  document: {
    id: "0:0",
    type: "DOCUMENT",
    name: "Smoke Test Doc",
    children: [
      {
        id: "0:1",
        type: "CANVAS",
        name: "Page 1",
        children: [
          {
            id: "1:1",
            type: "FRAME",
            name: "Frame 1",
            absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
            absoluteRenderBounds: { x: 0, y: 0, width: 100, height: 100 },
            relativeTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
            size: { x: 100, y: 100 },
            clipsContent: false,
            fills: [{ type: "SOLID", color: { r: 0.8, g: 0.2, b: 0.2, a: 1 } }],
            strokes: [],
            strokeWeight: 0,
            effects: [],
            children: [],
          },
        ],
      },
    ],
  },
};

describe("refig publish smoke", () => {
  it("packed tarball runs when installed in isolation", () => {
    const pkgDir = process.cwd();
    execSync("pnpm build", { cwd: pkgDir, stdio: "pipe" });

    const tmp = mkdtempSync(join(tmpdir(), "refig-pack-"));
    try {
      execSync(`npm pack --pack-destination "${tmp}"`, {
        cwd: pkgDir,
        stdio: "pipe",
      });
      const tgz = readdirSync(tmp).find((f) => f.endsWith(".tgz"));
      if (!tgz) throw new Error("npm pack produced no tarball");

      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({
          name: "refig-smoke-verify",
          private: true,
          packageManager: "pnpm@10.24.0",
        })
      );
      execSync(`pnpm add "./${tgz}"`, { cwd: tmp, stdio: "pipe" });

      execSync("npx refig --help", { cwd: tmp, stdio: "pipe" });

      const fixturePath = join(tmp, "fixture.json");
      writeFileSync(fixturePath, JSON.stringify(MINIMAL_REST_FIXTURE));
      const outPath = join(tmp, "smoke-out.png");
      const refigCli = join(tmp, "node_modules", "@grida", "refig", "dist", "cli.mjs");
      execSync(
        `"${process.execPath}" "${refigCli}" fixture.json --node 1:1 --out smoke-out.png --format png`,
        { cwd: tmp, stdio: "pipe", timeout: 60_000 }
      );

      expect(existsSync(outPath)).toBe(true);
      const bytes = readFileSync(outPath);
      expect(bytes[0]).toBe(0x89);
      expect(bytes[1]).toBe(0x50);
      expect(bytes[2]).toBe(0x4e);
      expect(bytes[3]).toBe(0x47);
      expect(bytes.byteLength).toBeGreaterThan(100);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 120_000);
});
