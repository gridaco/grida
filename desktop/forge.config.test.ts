import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import config from "./forge.config";

const ignore = config.packagerConfig?.ignore;
if (typeof ignore !== "function") {
  throw new Error("Desktop packaging must expose its file filter");
}

const manifest = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "package.json"),
    "utf8"
  )
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("Desktop package file filter", () => {
  it("excludes every linked workspace package before creating the archive", () => {
    const linked = Object.entries({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).filter(([, specifier]) => specifier.startsWith("link:../packages/"));

    expect(linked.map(([name]) => name)).toContain("@grida/ai-models");
    for (const [name] of linked) {
      expect(ignore(`/node_modules/${name}`)).toBe(true);
      expect(ignore(`/node_modules/${name}/dist/index.js`)).toBe(true);
    }
  });

  it("excludes only the exact bundled workspace scope", () => {
    expect(ignore("/node_modules/@grida")).toBe(true);
    for (const file of [
      "/node_modules/@app/vendor/index.js",
      "/node_modules/@gridaco/vendor/index.js",
      "/node_modules/@hono/node-server/index.js",
      "/node_modules/hono/index.js",
      "/.vite/build/main.js",
      "/package.json",
    ]) {
      expect(ignore(file)).toBe(false);
    }
  });
});
