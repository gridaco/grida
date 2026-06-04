import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url).pathname;
const SCOPES = [
  join(ROOT, "app/desktop"),
  join(ROOT, "lib/desktop"),
  join(ROOT, "scaffolds/desktop"),
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const ALLOWED_WINDOW_GRIDA = new Set(["lib/desktop/bridge.ts"]);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...files(path));
      continue;
    }
    if ([...SOURCE_EXTENSIONS].some((ext) => path.endsWith(ext))) {
      out.push(path);
    }
  }
  return out;
}

function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function sourceFiles(): Array<{ path: string; rel: string; text: string }> {
  return SCOPES.flatMap(files)
    .map((path) => ({
      path,
      rel: relative(ROOT, path),
      text: withoutComments(readFileSync(path, "utf8")),
    }))
    .filter((file) => file.rel !== "lib/desktop/bridge-boundary.test.ts");
}

describe("/desktop bridge boundary", () => {
  it("keeps raw window.grida access behind the typed bridge client", () => {
    const offenders = sourceFiles()
      .filter((file) => !ALLOWED_WINDOW_GRIDA.has(file.rel))
      .filter((file) => file.text.includes("window.grida"))
      .map((file) => file.rel);

    expect(offenders).toEqual([]);
  });

  it("keeps AgentHost route strings out of editor desktop code", () => {
    const routes = [
      "/agent/run",
      "/agent/stream/",
      "/agent/abort",
      "/secrets/has",
      "/secrets/set",
      "/secrets/delete",
      "/sessions",
      "/workspaces",
      "/files/",
      "/recent/",
    ];
    const offenders = sourceFiles()
      .flatMap((file) =>
        routes
          .filter((route) => file.text.includes(route))
          .map((route) => `${file.rel}: ${route}`)
      )
      .sort();

    expect(offenders).toEqual([]);
  });

  it("does not import Desktop app source into the URL-loaded editor", () => {
    const offenders = sourceFiles()
      .filter((file) => file.text.includes("../../../desktop/src"))
      .map((file) => file.rel);

    expect(offenders).toEqual([]);
  });
});
