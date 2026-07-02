/**
 * The #927 invariant, enforced: `@grida/daemon` depends on NOTHING
 * AI-specific. The daemon is the host layer; AI (the agent runtime,
 * model catalogs, provider SDKs) is a tenant that depends on this
 * package — never the reverse.
 *
 * Two cheap, honest probes:
 *   1. package.json dependencies contain no AI packages.
 *   2. no source file imports one (catches a dep that sneaks in through
 *      a hoisted node_modules without a manifest entry).
 *
 * If this test is in your way, the change is in the wrong package —
 * put the AI-flavored code in `@grida/agent` (or a new tenant) and hand
 * it what it needs through `DaemonServices` / tenant options.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AI_DEP_PATTERN =
  /^(ai|@ai-sdk\/.*|@grida\/ai-models|@anthropic-ai\/.*|@agentclientprotocol\/.*|openai|@openrouter\/.*)$/;

const AI_IMPORT_PATTERN =
  /from\s+["'](ai|@ai-sdk\/|@grida\/ai-models|@anthropic-ai\/|@agentclientprotocol\/|@grida\/agent)/;

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("@grida/daemon is AI-free (#927)", () => {
  it("declares no AI dependency", async () => {
    const pkg = JSON.parse(
      await fs.readFile(path.join(pkgDir, "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> };
    const offenders = Object.keys(pkg.dependencies ?? {}).filter((name) =>
      AI_DEP_PATTERN.test(name)
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
        } else if (entry.name.endsWith(".ts")) {
          const source = await fs.readFile(full, "utf8");
          if (AI_IMPORT_PATTERN.test(source)) offenders.push(full);
        }
      }
    };
    await walk(path.join(pkgDir, "src"));
    expect(offenders).toEqual([]);
  });
});
