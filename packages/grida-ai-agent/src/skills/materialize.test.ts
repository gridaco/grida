import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMaterializingSkillLoader } from "./materialize";
import { SkillPathEscapeError } from "./discovery";
import type { DiscoveredSkill } from "./types";

let srcRoot: string;
let scratch: string;

beforeEach(async () => {
  srcRoot = await fs.mkdtemp(path.join(os.tmpdir(), "grida-skill-src-"));
  scratch = await fs.mkdtemp(path.join(os.tmpdir(), "grida-scratch-"));
});

afterEach(async () => {
  await fs.rm(srcRoot, { recursive: true, force: true });
  await fs.rm(scratch, { recursive: true, force: true });
});

async function writeSkill(
  name: string,
  body: string,
  files: Record<string, string> = {}
): Promise<DiscoveredSkill> {
  const dir = path.join(srcRoot, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: test\n---\n\n${body}\n`
  );
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content);
  }
  return {
    name,
    description: "test",
    path: path.join(dir, "SKILL.md"),
    dir,
    source: "bundled",
  };
}

describe("createMaterializingSkillLoader", () => {
  it("copies the skill tree into scratch and returns body + base dir", async () => {
    const skill = await writeSkill("slides", "Deck body.", {
      "scripts/run.sh": "echo hi\n",
      "references/style.md": "# Style",
    });
    const load = createMaterializingSkillLoader(scratch);
    const out = await load(skill);

    const dest = path.join(scratch, "skills", "slides");
    expect(out).toContain("Deck body.");
    expect(out).toContain(dest); // reports the absolute base dir
    // files are real on disk under scratch
    expect(await fs.readFile(path.join(dest, "scripts/run.sh"), "utf8")).toBe(
      "echo hi\n"
    );
    expect(
      await fs.readFile(path.join(dest, "references/style.md"), "utf8")
    ).toBe("# Style");
  });

  it("inlines metadata.also_in_load companions after the body", async () => {
    const skill = await writeSkill("slides", "Body.", {
      "STYLE.md": "brand rules",
    });
    skill.also_in_load = ["STYLE.md"];
    const out = await createMaterializingSkillLoader(scratch)(skill);
    expect(out).toContain("# Inlined: STYLE.md");
    expect(out).toContain("brand rules");
  });

  it("returns body-only for a flat (dir-less) skill", async () => {
    const flat: DiscoveredSkill = {
      name: "note",
      description: "test",
      path: path.join(srcRoot, "note.md"),
      source: "user",
      // no dir
    };
    await fs.writeFile(
      flat.path,
      "---\nname: note\ndescription: t\n---\n\nHi\n"
    );
    const out = await createMaterializingSkillLoader(scratch)(flat);
    expect(out).toBe("Hi");
    // nothing materialized
    await expect(fs.stat(path.join(scratch, "skills", "note"))).rejects.toThrow(
      /ENOENT/
    );
  });

  // GRIDA-SEC-007: rule 3 — copyTree never follows a symlink out of the tree.
  it("skips a symlink entry rather than following it out of the tree", async () => {
    const skill = await writeSkill("evil", "Body.");
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "grida-out-"));
    await fs.writeFile(path.join(outside, "secret.txt"), "top secret");
    await fs.symlink(
      path.join(outside, "secret.txt"),
      path.join(skill.dir!, "link.txt")
    );
    try {
      await createMaterializingSkillLoader(scratch)(skill);
      // the symlink was NOT copied into scratch
      await expect(
        fs.stat(path.join(scratch, "skills", "evil", "link.txt"))
      ).rejects.toThrow(/ENOENT/);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  // GRIDA-SEC-007: rule 5 — the discovery→load TOCTOU. A discovered skill dir
  // is swapped for a symlink pointing OUT of its layer AFTER discovery accepted
  // it; the load must re-validate on disk and refuse, not follow the link.
  it("refuses a skill dir swapped for an escaping symlink after discovery", async () => {
    const skill = await writeSkill("swapme", "Body.");
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "grida-evil-"));
    await fs.writeFile(
      path.join(outside, "SKILL.md"),
      "---\nname: x\ndescription: y\n---\n\nsecret\n"
    );
    // Replace the accepted dir with a symlink to the outside tree.
    await fs.rm(skill.dir!, { recursive: true, force: true });
    await fs.symlink(outside, skill.dir!, "dir");
    try {
      await expect(
        createMaterializingSkillLoader(scratch)(skill)
      ).rejects.toThrow(SkillPathEscapeError);
      // nothing materialized into scratch
      await expect(
        fs.stat(path.join(scratch, "skills", "swapme"))
      ).rejects.toThrow(/ENOENT/);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});
