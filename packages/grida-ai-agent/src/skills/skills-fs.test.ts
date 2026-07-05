import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  InvalidFrontmatterError,
  MissingFrontmatterError,
  parseSkillManifest,
} from "./frontmatter";
import { discoverSkills } from "./discovery";

// ---------------------------------------------------------------------------
// Strict agentskills.io manifest parsing.
// ---------------------------------------------------------------------------

describe("parseSkillManifest", () => {
  it("parses required fields, allowed-tools, and verbatim metadata", () => {
    const { manifest, body } = parseSkillManifest(
      [
        "---",
        "name: slides",
        "description: Build a deck.",
        "license: MIT",
        "allowed-tools:",
        "  - read_file",
        "  - write_file",
        "metadata:",
        "  also_in_load:",
        "    - styles/STYLE.md",
        "---",
        "",
        "# Body",
      ].join("\n")
    );
    expect(manifest.name).toBe("slides");
    expect(manifest.description).toBe("Build a deck.");
    expect(manifest.license).toBe("MIT");
    expect(manifest.allowedTools).toEqual(["read_file", "write_file"]);
    expect(manifest.metadata?.also_in_load).toEqual(["styles/STYLE.md"]);
    expect(body).toContain("# Body");
  });

  it("throws MissingFrontmatterError without a --- block", () => {
    expect(() => parseSkillManifest("# just a body")).toThrow(
      MissingFrontmatterError
    );
  });

  it("rejects a missing name and a non-kebab name", () => {
    expect(() => parseSkillManifest("---\ndescription: x\n---\n")).toThrow(
      InvalidFrontmatterError
    );
    expect(() =>
      parseSkillManifest("---\nname: Slides\ndescription: x\n---\n")
    ).toThrow(InvalidFrontmatterError);
  });

  it("rejects an empty description and a non-mapping metadata", () => {
    expect(() =>
      parseSkillManifest("---\nname: a\ndescription: '  '\n---\n")
    ).toThrow(InvalidFrontmatterError);
    expect(() =>
      parseSkillManifest("---\nname: a\ndescription: x\nmetadata: [1,2]\n---\n")
    ).toThrow(InvalidFrontmatterError);
  });
});

// ---------------------------------------------------------------------------
// Layered discovery: bundled dir + shadowing + hardening.
// ---------------------------------------------------------------------------

let bundled: string;
let workspace: string;

async function writeManifest(
  root: string,
  name: string,
  fm: string
): Promise<string> {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "SKILL.md"), `---\n${fm}\n---\n\nBody\n`);
  return dir;
}

beforeEach(async () => {
  bundled = await fs.mkdtemp(path.join(os.tmpdir(), "grida-bundled-"));
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "grida-ws-"));
});

afterEach(async () => {
  await fs.rm(bundled, { recursive: true, force: true });
  await fs.rm(workspace, { recursive: true, force: true });
});

const isolate = {
  include_user_scoped: false as const,
  home_dir: "/nonexistent",
};

describe("discoverSkills — bundled layer", () => {
  it("discovers a bundled skill with its dir + also_in_load", async () => {
    await writeManifest(
      bundled,
      "slides",
      "name: slides\ndescription: Build a deck.\nmetadata:\n  also_in_load:\n    - notes.md"
    );
    const index = await discoverSkills({ ...isolate, bundled_dir: bundled });
    const slides = index.by_name.get("slides");
    expect(slides?.source).toBe("bundled");
    expect(slides?.dir).toBe(path.join(bundled, "slides"));
    expect(slides?.also_in_load).toEqual(["notes.md"]);
  });

  it("lets a workspace skill shadow the bundled one of the same name", async () => {
    await writeManifest(
      bundled,
      "slides",
      "name: slides\ndescription: bundled"
    );
    await writeManifest(
      path.join(workspace, ".claude/skills"),
      "slides",
      "name: slides\ndescription: workspace"
    );
    const index = await discoverSkills({
      ...isolate,
      workspace_root: workspace,
      stop_at: workspace,
      bundled_dir: bundled,
    });
    const slides = index.by_name.get("slides");
    expect(slides?.source).toBe("project");
    expect(slides?.description).toBe("workspace");
    // exactly one `slides` in the list (shadow, not duplicate)
    expect(index.skills.filter((s) => s.name === "slides")).toHaveLength(1);
  });

  it("skips non-kebab dir names and malformed manifests without throwing", async () => {
    await writeManifest(
      bundled,
      "ok-skill",
      "name: ok-skill\ndescription: fine"
    );
    await writeManifest(bundled, "BadName", "name: whatever\ndescription: x");
    // malformed: missing description
    await writeManifest(bundled, "broken", "name: broken");
    const index = await discoverSkills({ ...isolate, bundled_dir: bundled });
    expect(index.by_name.has("ok-skill")).toBe(true);
    expect(index.by_name.has("BadName")).toBe(false);
    expect(index.by_name.has("broken")).toBe(false);
    expect(index.skills).toHaveLength(1);
  });

  // GRIDA-SEC-007: rules 1–2 — name validation + realpath containment.
  it("does NOT discover home-dir skills via the project walk-up (find-skills regression)", async () => {
    // Simulate the desktop layout: a workspace nested under the user's home,
    // and a global `find-skills` in `~/.agents/skills`. With user-scoped OFF,
    // the project walk-up must NOT re-discover it by climbing through home.
    const fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), "grida-home-"));
    try {
      await writeManifest(
        path.join(fakeHome, ".agents/skills"),
        "find-skills",
        "name: find-skills\ndescription: meta finder"
      );
      const project = path.join(fakeHome, "Documents", "Grida", "deck-proj");
      await fs.mkdir(project, { recursive: true });
      await writeManifest(bundled, "slides", "name: slides\ndescription: deck");

      const index = await discoverSkills({
        workspace_root: project,
        home_dir: fakeHome,
        include_user_scoped: false,
        bundled_dir: bundled,
      });
      expect(index.by_name.has("find-skills")).toBe(false);
      expect(index.by_name.has("slides")).toBe(true);
    } finally {
      await fs.rm(fakeHome, { recursive: true, force: true });
    }
  });

  // GRIDA-SEC-007: rules 1–2 — name validation + realpath containment.
  it("drops a symlinked skill dir that escapes the layer root", async () => {
    // A real skill outside the bundled root...
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "grida-outside-"));
    await writeManifest(outside, "evil", "name: evil\ndescription: escapes");
    // ...symlinked into the bundled dir as `escaped`.
    await fs.symlink(
      path.join(outside, "evil"),
      path.join(bundled, "escaped"),
      "dir"
    );
    try {
      const index = await discoverSkills({ ...isolate, bundled_dir: bundled });
      expect(index.by_name.has("evil")).toBe(false);
      expect(index.skills).toHaveLength(0);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});
