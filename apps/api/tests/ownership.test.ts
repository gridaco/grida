import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, test } from "vitest";

const app = fileURLToPath(new URL("../", import.meta.url));
const repository = path.resolve(app, "../..");

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      ["node_modules", "dist"].includes(entry.name) ||
      entry.name.startsWith(".")
    )
      return [];
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(filename);
    return /\.[cm]?tsx?$/.test(filename) && !filename.endsWith(".test.ts")
      ? [filename]
      : [];
  });
}

test("API and shared Forms imports keep implementation ownership enforceable", () => {
  const violations: string[] = [];
  for (const root of [app, path.join(repository, "packages/grida-forms")]) {
    const manifest = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8")
    );
    const dependencies = new Set(
      Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    );
    const directory =
      root === app ? path.join(root, "server") : path.join(root, "src");
    for (const filename of sources(directory)) {
      const imports = ts.preProcessFile(
        readFileSync(filename, "utf8"),
        true,
        true
      ).importedFiles;
      for (const { fileName: specifier } of imports) {
        if (specifier.startsWith(".")) {
          const relative = path.relative(
            root,
            path.resolve(path.dirname(filename), specifier)
          );
          if (relative.startsWith(".."))
            violations.push(`${filename}: escaping import ${specifier}`);
        } else if (isBuiltin(specifier)) {
          if (root !== app)
            violations.push(
              `${filename}: Node import ${specifier} in browser contracts`
            );
        } else {
          const name = specifier.startsWith("@")
            ? specifier.split("/").slice(0, 2).join("/")
            : specifier.split("/")[0];
          if (["next", "editor", "server-only"].includes(name))
            violations.push(`${filename}: forbidden ${specifier}`);
          if (!dependencies.has(name))
            violations.push(`${filename}: undeclared ${specifier}`);
        }
      }
    }
  }
  expect(violations).toEqual([]);
});

test("API route surface contains no internal completion or editor endpoint", () => {
  const routes = sources(path.join(app, "server/routes"))
    .map((filename) => path.relative(path.join(app, "server/routes"), filename))
    .sort();
  expect(routes).toEqual([
    "health.get.ts",
    "v1/[id].get.ts",
    "v1/[id]/session.get.ts",
    "v1/session/[session]/field/[field].patch.ts",
    "v1/session/[session]/field/[field]/challenge/email/start.post.ts",
    "v1/session/[session]/field/[field]/challenge/email/state.get.ts",
    "v1/session/[session]/field/[field]/challenge/email/verify.post.ts",
    "v1/session/[session]/field/[field]/file/preview/public-url.get.ts",
    "v1/session/[session]/field/[field]/file/upload/signed-url.post.ts",
    "v1/session/[session]/field/[field]/file/upload/signed-url.put.ts",
    "v1/session/[session]/field/[field]/search/meta.get.ts",
    "v1/submit/[id].get.ts",
    "v1/submit/[id].post.ts",
  ]);
});
