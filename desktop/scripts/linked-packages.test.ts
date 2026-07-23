import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8")
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts: Record<string, string>;
};

const linkedPackageNames = Object.entries({
  ...manifest.dependencies,
  ...manifest.devDependencies,
})
  .filter(([, specifier]) => specifier.startsWith("link:../packages/"))
  .map(([name]) => name)
  .sort();

describe("Desktop linked package build", () => {
  it("builds every linked root package through Turbo", () => {
    const command = manifest.scripts["build:linked-packages"];
    const filters = Array.from(
      command.matchAll(/--filter=([^\s]+)/g),
      (match) => match[1]
    ).sort();

    expect(command).toMatch(/^pnpm --dir \.\. exec turbo run build /);
    expect(filters).toEqual(linkedPackageNames);
  });

  it.each([
    "dev",
    "dev:insiders",
    "make",
    "package",
    "test",
    "test:watch",
    "typecheck",
  ])("builds linked packages before %s", (script) => {
    expect(manifest.scripts[script]).toMatch(
      /^pnpm run build:linked-packages && /
    );
  });
});
