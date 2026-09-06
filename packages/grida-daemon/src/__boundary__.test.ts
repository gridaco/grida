/**
 * The #927 invariant, enforced: `@grida/daemon` depends on NOTHING
 * AI-specific. The daemon is the host layer; AI (the agent runtime,
 * model catalogs, provider SDKs) is a tenant that depends on this
 * package — never the reverse.
 *
 * Two probes:
 *   1. package.json dependencies contain no AI packages.
 *   2. no source file imports one (catches a dep that sneaks in through
 *      a hoisted node_modules without a manifest entry).
 *
 * If this test is in your way, the change is in the wrong package —
 * put the AI-flavored code in `@grida/ai` or an agent tenant and hand
 * it what it needs through `DaemonServices` / tenant options.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const AI_DEP_PATTERN =
  /^(?:ai(?:\/|$)|@ai-sdk\/|@grida\/(?:ai(?:[-/]|$)|agent(?:\/|$))|@anthropic-ai\/|@agentclientprotocol\/|openai(?:\/|$)|@openrouter\/)/;

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function imports(source: string): string[] {
  return ts
    .preProcessFile(source, true, true)
    .importedFiles.map((file) => file.fileName);
}

describe("@grida/daemon is AI-free (#927)", () => {
  it("declares no AI dependency", async () => {
    const pkg = JSON.parse(
      await fs.readFile(path.join(pkgDir, "package.json"), "utf8")
    ) as Record<string, Record<string, string> | undefined>;
    const offenders = [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
      "devDependencies",
    ].flatMap((field) =>
      Object.keys(pkg[field] ?? {})
        .filter((name) => AI_DEP_PATTERN.test(name))
        .map((name) => `${field}: ${name}`)
    );
    expect(offenders).toEqual([]);
  });

  it("imports no AI module (and never its own tenant) from src", async () => {
    const offenders: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (/\.[cm]?tsx?$/.test(entry.name)) {
          const source = await fs.readFile(full, "utf8");
          for (const specifier of imports(source)) {
            if (AI_DEP_PATTERN.test(specifier)) {
              offenders.push(`${full}: ${specifier}`);
            }
          }
        }
      }
    };
    await walk(path.join(pkgDir, "src"));
    expect(offenders).toEqual([]);
  });

  it.each([
    'import { image } from "@grida/ai";',
    'import type { Image } from "@grida/ai/image";',
    'import "@grida/ai";',
    'export { image } from "@grida/ai";',
    'export * from "@grida/ai/image";',
    'const ai = await import("@grida/ai");',
    'const ai = require("@grida/ai");',
    'import ai = require("@grida/ai");',
    'type Image = import("@grida/ai").Image;',
    'import { models } from "@grida/ai-models";',
    'import { createAgent } from "@grida/agent";',
  ])("detects an AI dependency in %s", (source) => {
    expect(imports(source).some((name) => AI_DEP_PATTERN.test(name))).toBe(
      true
    );
  });

  it("does not classify prose, package names with a different boundary, or host capabilities as AI imports", () => {
    const source = `
      // import { image } from "@grida/ai";
      const example = 'import { image } from "@grida/ai"';
      import { Home } from "@grida/home";
      import { Daemon } from "@grida/daemon/server";
      import { identifier } from "air";
    `;
    expect(imports(source).filter((name) => AI_DEP_PATTERN.test(name))).toEqual(
      []
    );
  });
});
