import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { discoverSkills, nodeSkillBodyLoader } from "./discovery";
import { discoverProjectInstructions } from "./project-instructions";
import {
  createSkillTool,
  renderSkillIndex,
  wrapSkillContent,
} from "./skill-tool";

let root: string;

async function writeSkill(
  base: string,
  dirName: string,
  frontmatter: string,
  body: string
): Promise<void> {
  const dir = path.join(base, ".agents/skills", dirName);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "SKILL.md"),
    `---\n${frontmatter}\n---\n\n${body}\n`,
    "utf8"
  );
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grida-skills-test-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("parseFrontmatter", () => {
  it("reads plain, quoted, and folded block scalars", () => {
    const { fields, body } = parseFrontmatter(
      [
        "---",
        "name: my-skill",
        'title: "Quoted Title"',
        "description: >-",
        "  A multi-line folded description that",
        "  spans several lines and should",
        "  collapse into one.",
        "keywords: [a, b, c]",
        "metadata:",
        "  type: user",
        "---",
        "",
        "# Body starts here",
        "content",
      ].join("\n")
    );
    expect(fields.name).toBe("my-skill");
    expect(fields.title).toBe("Quoted Title");
    expect(fields.description).toBe(
      "A multi-line folded description that spans several lines and should collapse into one."
    );
    expect(body).toContain("# Body starts here");
    // Nested metadata keys are not surfaced as top-level fields.
    expect(fields.type).toBeUndefined();
  });

  it("returns whole input as body when no frontmatter", () => {
    const { fields, body } = parseFrontmatter("no frontmatter here");
    expect(fields).toEqual({});
    expect(body).toBe("no frontmatter here");
  });
});

describe("discoverSkills", () => {
  it("discovers project skills with parsed name + description", async () => {
    await writeSkill(
      root,
      "alpha",
      "name: alpha\ndescription: The alpha skill.",
      "alpha body"
    );
    await writeSkill(
      root,
      "beta",
      "name: beta\ndescription: >-\n  The beta skill, folded.",
      "beta body"
    );
    const index = await discoverSkills({
      workspace_root: root,
      stop_at: root,
      include_user_scoped: false,
    });
    expect(index.skills.map((s) => s.name).sort()).toEqual(["alpha", "beta"]);
    expect(index.by_name.get("beta")!.description).toBe(
      "The beta skill, folded."
    );
    expect(index.by_name.get("alpha")!.source).toBe("project");
  });

  it("nearest-wins: a child skill shadows an ancestor with the same name", async () => {
    const child = path.join(root, "project");
    await fs.mkdir(child, { recursive: true });
    // ancestor (root) and child both define "shared"; child is nearer.
    await writeSkill(
      root,
      "shared",
      "name: shared\ndescription: ancestor.",
      "x"
    );
    await writeSkill(
      child,
      "shared",
      "name: shared\ndescription: nearest.",
      "y"
    );
    const onWarn: string[] = [];
    const index = await discoverSkills({
      workspace_root: child,
      stop_at: root,
      include_user_scoped: false,
      on_warn: (m) => onWarn.push(m),
    });
    expect(index.by_name.get("shared")!.description).toBe("nearest.");
    expect(onWarn.some((m) => m.includes("duplicate skill"))).toBe(true);
  });

  it("skips a manifest missing name or description", async () => {
    await writeSkill(root, "ok", "name: ok\ndescription: fine.", "b");
    await writeSkill(root, "noname", "description: only desc.", "b");
    await writeSkill(root, "nodesc", "name: nodesc", "b");
    const index = await discoverSkills({
      workspace_root: root,
      stop_at: root,
      include_user_scoped: false,
    });
    expect(index.skills.map((s) => s.name)).toEqual(["ok"]);
  });

  it("returns an empty index when there are no skill dirs", async () => {
    const index = await discoverSkills({
      workspace_root: root,
      stop_at: root,
      include_user_scoped: false,
    });
    expect(index.skills).toEqual([]);
  });
});

describe("project instructions", () => {
  it("concatenates AGENTS.md/CLAUDE.md nearest-last", async () => {
    const child = path.join(root, "pkg");
    await fs.mkdir(child, { recursive: true });
    await fs.writeFile(path.join(root, "AGENTS.md"), "ROOT RULES", "utf8");
    await fs.writeFile(path.join(child, "CLAUDE.md"), "PKG RULES", "utf8");
    const res = await discoverProjectInstructions({
      workspace_root: child,
      stop_at: root,
    });
    // Outermost first → root before pkg (nearest has the final word).
    const rootIdx = res.text.indexOf("ROOT RULES");
    const pkgIdx = res.text.indexOf("PKG RULES");
    expect(rootIdx).toBeGreaterThanOrEqual(0);
    expect(pkgIdx).toBeGreaterThan(rootIdx);
    expect(res.files.length).toBe(2);
  });

  it("is empty when no instruction files exist", async () => {
    const res = await discoverProjectInstructions({
      workspace_root: root,
      stop_at: root,
    });
    expect(res.text).toBe("");
    expect(res.files).toEqual([]);
  });

  it("truncates past the token cap", async () => {
    await fs.writeFile(
      path.join(root, "AGENTS.md"),
      "x".repeat(10_000),
      "utf8"
    );
    const res = await discoverProjectInstructions({
      workspace_root: root,
      stop_at: root,
      max_tokens: 100, // 400 chars
    });
    expect(res.truncated).toBe(true);
    expect(res.text).toContain("truncated");
  });
});

describe("skill tool", () => {
  it("loads a body wrapped in <skill_content> and caches it", async () => {
    await writeSkill(
      root,
      "alpha",
      "name: alpha\ndescription: A.",
      "## Alpha instructions\nstep one"
    );
    const index = await discoverSkills({
      workspace_root: root,
      stop_at: root,
      include_user_scoped: false,
    });
    const cache = new Map<string, string>();
    const skillTool = createSkillTool({
      index,
      cache,
      load_body: nodeSkillBodyLoader,
    });
    const out = (await skillTool.execute!({ name: "alpha" }, {
      tool_call_id: "t1",
      messages: [],
    } as never)) as { content: string };
    expect(out.content).toContain('<skill_content name="alpha">');
    expect(out.content).toContain("## Alpha instructions");
    expect(out.content).toContain("</skill_content>");
    // Cached after first load.
    expect(cache.get("alpha")).toBe(out.content);

    // Mutate the file; a second call returns the cached body.
    await fs.writeFile(
      path.join(root, ".agents/skills/alpha/SKILL.md"),
      "---\nname: alpha\ndescription: A.\n---\nCHANGED",
      "utf8"
    );
    const again = (await skillTool.execute!({ name: "alpha" }, {
      tool_call_id: "t2",
      messages: [],
    } as never)) as { content: string };
    expect(again.content).toBe(out.content);
    expect(again.content).not.toContain("CHANGED");
  });

  it("returns a structured error for an unknown skill", async () => {
    await writeSkill(root, "alpha", "name: alpha\ndescription: A.", "b");
    const index = await discoverSkills({
      workspace_root: root,
      stop_at: root,
      include_user_scoped: false,
    });
    const skillTool = createSkillTool({
      index,
      load_body: nodeSkillBodyLoader,
    });
    const out = (await skillTool.execute!({ name: "ghost" }, {
      tool_call_id: "t1",
      messages: [],
    } as never)) as { ok: false; code: string };
    expect(out.ok).toBe(false);
    expect(out.code).toBe("skill-not-found");
  });

  it("renders the index block only when skills exist", () => {
    expect(renderSkillIndex({ skills: [], by_name: new Map() })).toBe("");
    const block = renderSkillIndex({
      skills: [
        { name: "a", description: "Do A.", path: "/a", source: "project" },
      ],
      by_name: new Map(),
    });
    expect(block).toContain("<skills>");
    expect(block).toContain("- a: Do A.");
    expect(block).toContain("skill");
  });

  it("wrapSkillContent uses the canonical marker", () => {
    expect(wrapSkillContent("x", "body")).toBe(
      '<skill_content name="x">\nbody\n</skill_content>'
    );
  });
});
