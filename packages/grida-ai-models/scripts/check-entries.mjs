import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

function relativePath(path) {
  return relative(packageRoot, path).replaceAll("\\", "/");
}

// Walk actual module edges, including the emitted shared chunks. A root import
// must never acquire service policy through a barrel or a shared dependency.
function dependencies(entry) {
  const visited = new Set();
  function visit(path) {
    if (visited.has(path)) return;
    visited.add(path);
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true
    );
    function walk(node) {
      const specifier =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isCallExpression(node) &&
              (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                (ts.isIdentifier(node.expression) &&
                  node.expression.text === "require"))
            ? node.arguments[0]
            : undefined;
      if (specifier) {
        assert.ok(ts.isStringLiteral(specifier), "root imports are static");
        assert.ok(
          specifier.text.startsWith("."),
          "root has no external dependency"
        );
        const base = resolve(dirname(path), specifier.text);
        const target = [base, `${base}.ts`].find(existsSync);
        assert.ok(target, `unresolved root dependency: ${specifier.text}`);
        visit(target);
      }
      ts.forEachChild(node, walk);
    }
    walk(source);
  }
  visit(resolve(packageRoot, entry));
  return [...visited].map(relativePath);
}

test("dependency paths use forward slashes on every platform", () => {
  for (const separator of ["/", "\\"]) {
    const path = resolve(
      packageRoot,
      ["src", "grida", "catalog.ts"].join(separator)
    );
    assert.equal(relativePath(path), "src/grida/catalog.ts");
  }
});

for (const entry of ["src/index.ts", "dist/index.js", "dist/index.mjs"]) {
  test(`${entry} dependency graph excludes Grida service policy`, () => {
    const graph = dependencies(entry);
    assert.ok(graph.length > 1, "check the factual dependency closure");
    for (const path of graph) {
      assert.doesNotMatch(path, /(?:^|\/)grida(?:\.|\/)/);
      assert.doesNotMatch(
        path,
        /(?:^|\/)(?:catalog|preferences|tiers)(?:\.|\/)/
      );
    }
  });
}

test("built root exports keep service policy behind the explicit subpath", async () => {
  const cjs = createRequire(import.meta.url)("@grida/ai-models");
  const esm = await import("@grida/ai-models");
  for (const root of [cjs, esm]) {
    assert.equal(root.default, root.models);
    assert.equal("catalog" in root, false);
    assert.equal("TIER_MODEL_IDS" in root, false);
    assert.equal("snapshot" in root.models, false);
    assert.equal("byTier" in root.models.text, false);
  }
});
