import { describe, expect, it } from "vitest";
import { externalizedWorkspaceImports } from "./vite.guards";

// GRIDA-DESKTOP-BUILD-GUARD — see desktop/vite.guards.ts.
// A bundle that leaves a @grida/* workspace package external will crash
// on launch with "Cannot find module". Lock that detection.
describe("externalizedWorkspaceImports", () => {
  it("flags an unbuilt @grida/* link dep (the 0.0.3 crash)", () => {
    expect(
      externalizedWorkspaceImports([
        "node:fs",
        "electron",
        "@anthropic-ai/sandbox-runtime",
        "@grida/desktop-bridge",
      ])
    ).toEqual(["@grida/desktop-bridge"]);
  });

  it("ignores internal chunks, builtins, and intentional npm externals", () => {
    expect(
      externalizedWorkspaceImports([
        "main.js",
        "chunk-abc.js",
        "fs",
        "node:path",
        "electron",
        "hono",
        "hono/jsx",
        "undici",
      ])
    ).toEqual([]);
  });

  it("dedupes repeated offenders", () => {
    expect(
      externalizedWorkspaceImports(["@grida/agent", "@grida/agent"])
    ).toEqual(["@grida/agent"]);
  });
});
