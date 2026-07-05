/**
 * Live integration against the REAL shipped bundled skills tree
 * (`<repo>/skills/`), not a temp fixture. Guards the end-to-end chain the
 * desktop/CLI agent relies on: the built-in skills resolve from disk, advertise
 * by name+description, and load+materialize with their real bodies. This is the
 * deterministic half of the deck-on-board regression oracle (the model half
 * needs a live provider key; see runtime.live.test.ts).
 */

import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverSkills } from "./discovery";
import { renderSkillIndex } from "./skill-tool";
import { createMaterializingSkillLoader } from "./materialize";

// <repo>/skills — four levels up from this file's dir (skills → src →
// grida-ai-agent → packages → repo root).
const BUNDLED_DIR = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../skills"
);

const isolate = {
  include_user_scoped: false as const,
  home_dir: "/nonexistent",
  bundled_dir: BUNDLED_DIR,
};

describe("shipped bundled skills (<repo>/skills)", () => {
  it("discovers svg, dotcanvas, and slides as built-in skills", async () => {
    const index = await discoverSkills(isolate);
    const names = index.skills.map((s) => s.name).sort();
    expect(names).toEqual(["dotcanvas", "slides", "svg"]);
    for (const n of names) {
      expect(index.by_name.get(n)?.source).toBe("bundled");
      expect(index.by_name.get(n)?.dir).toBe(path.join(BUNDLED_DIR, n));
    }
  });

  it("advertises the slides skill with a deck-matching description", async () => {
    const index = await discoverSkills(isolate);
    const block = renderSkillIndex(index);
    expect(block).toContain("<skills>");
    expect(block).toContain("- slides:");
    // the trigger keywords a deck task matches on
    expect(block.toLowerCase()).toContain("pitch deck");
    // and the nudge to load before acting
    expect(block).toContain("BEFORE you start");
  });

  it("dotcanvas routes decks to slides (the carve-out)", async () => {
    const index = await discoverSkills(isolate);
    expect(index.by_name.get("dotcanvas")?.description.toLowerCase()).toContain(
      "slides"
    );
  });

  it("materializes the real slides SKILL.md, teaching editor:slides + 16:9", async () => {
    const index = await discoverSkills(isolate);
    const slides = index.by_name.get("slides")!;
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "grida-live-"));
    try {
      const body = await createMaterializingSkillLoader(scratch)(slides);
      // the load-bearing convention the failing sessions violated
      expect(body).toContain('editor: "slides"');
      expect(body).toContain('viewBox="0 0 1920 1080"');
      // the real file is on disk under scratch, reachable by read_file
      const copied = path.join(scratch, "skills", "slides", "SKILL.md");
      expect((await fs.readFile(copied, "utf8")).length).toBeGreaterThan(0);
      // the base-dir note tells the model where its files live
      expect(body).toContain(path.join(scratch, "skills", "slides"));
    } finally {
      await fs.rm(scratch, { recursive: true, force: true });
    }
  });
});
