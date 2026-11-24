import { describe, expect, it, vi } from "vitest";
import type { NativeChatSkill } from "@grida/desktop-bridge";
import { getSchema } from "@tiptap/core";
import { ComposerCore } from "@/kits/composer/composer-core";
import { ComposerTiptap } from "@/kits/composer/composer-tiptap";
import { SkillMentions } from "./skill-mentions";

describe("SkillMentions", () => {
  it("ignores a late catalog from a departed workspace and keeps the selected personal skill", async () => {
    const personal = skill("personal", "1");
    const project = skill("project_agents", "2");
    const pending = Promise.withResolvers<readonly NativeChatSkill[]>();
    const read = vi.fn<() => Promise<readonly NativeChatSkill[]>>();
    read.mockReturnValueOnce(pending.promise);
    read.mockResolvedValueOnce([project, personal]);
    const home = new SkillMentions.Catalog(read);
    const oldRead = home.refresh();
    expect(home.refresh()).toBe(oldRead);
    home.release();
    const workspace = new SkillMentions.Catalog(read, "destination");
    await workspace.refresh();
    pending.resolve([personal]);
    await oldRead;
    expect(home.read()).toEqual([]);
    expect(workspace.read().map(({ id }) => id)).toEqual([
      project.uri,
      personal.uri,
    ]);
    const core = new ComposerCore({ skillMentions: workspace.read() });
    core.ingestDocument({
      text: "$slides Use my format",
      document: {
        type: "doc",
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "mention",
                id: personal.uri,
                label: personal.name,
                sigil: "$",
                payload: { name: personal.name, uri: personal.uri },
              },
              { type: "text", text: "Use my format" },
            ],
          },
        ],
      },
    });
    core.setCatalog({
      skillMentions: SkillMentions.catalog([project], "destination"),
    });
    expect(
      SkillMentions.selected(core.createMessage({ submitted_at: 0 })!)
    ).toEqual([{ name: personal.name, uri: personal.uri }]);
    expect(workspace.read()[0].payload).toEqual({
      name: project.name,
      uri: project.uri,
      workspaceId: "destination",
    });
  });
  it("keeps each selected mention at its own position and leaves lookalikes literal", () => {
    const personal = skill("personal", "1");
    const project = skill("project_agents", "2");
    const first = SkillMentions.markup("$slides", personal.uri);
    const second = SkillMentions.markup("$slides", project.uri);
    const detached = SkillMentions.markup("$slides", skill("bundled", "3").uri);
    const code = "`" + first + "`";
    const text =
      "😀 $slides " + first + ", then " + second + ". " + code + " " + detached;
    const parts = SkillMentions.display([personal, project], undefined);
    expect(SkillMentions.inline(text, parts)).toEqual([
      {
        from: text.indexOf(first),
        to: text.indexOf(first) + first.length,
        label: "$slides",
        uri: personal.uri,
      },
      {
        from: text.indexOf(second),
        to: text.indexOf(second) + second.length,
        label: "$slides",
        uri: project.uri,
      },
    ]);
    expect(SkillMentions.plainText(text, parts)).toBe(
      "😀 $slides $slides, then $slides. " + code + " " + detached
    );
    expect(
      SkillMentions.previewText("Use " + first.slice(0, 28) + "…", parts)
    ).toBe("Use $slides…");
  });

  it("restores an inline binding in a recovered draft and preserves a queued binding on caption edit", () => {
    const { name, uri } = skill("personal", "1");
    const selection = { name, uri };
    const text = "Use " + SkillMentions.markup("$slides", uri) + " for $100.";
    const parts = SkillMentions.display([selection], undefined);
    const restored = SkillMentions.restoreDocument(text, [selection]);
    expect(restored.content[0].content).toMatchObject([
      { type: "text", text: "Use " },
      { type: "composerMention", attrs: { id: uri, sigil: "$" } },
      { type: "text", text: " for $100." },
    ]);
    const queued = SkillMentions.retainedDocument(text, parts)!;
    const core = new ComposerCore();
    core.ingestDocument({
      text,
      document: ComposerTiptap.toDocument(queued),
    });
    const edited = core.createMessage({ submitted_at: 0 })!;
    expect(SkillMentions.selected(edited, true)).toBeUndefined();
    expect(SkillMentions.selected(edited)).toEqual([selection]);
  });

  it("retains formatting and only replaces the exact authored selection when editing a queue caption", () => {
    const { name, uri } = skill("personal", "1");
    const selected = SkillMentions.markup("$slides", uri);
    const code = "`" + selected + "`";
    const text = `Use **this** ${selected}.\n\n- Keep the example ${code}.\n- Keep [another link](https://example.com).`;
    const document = SkillMentions.retainedDocument(
      text,
      SkillMentions.display([{ name, uri }], undefined)
    )!;
    const schema = getSchema(ComposerTiptap.extensions({ placeholder: "" }));
    const doc = schema.nodeFromJSON(document);
    expect(doc.child(1).type.name).toBe("bulletList");
    expect(ComposerTiptap.formattedMarkdown(doc)).toBe(text);
  });

  it("recalls plain mentions as text and restores only the picker selection", () => {
    const selected = skill("project_agents", "1");
    const inferred = {
      name: "svg",
      uri: `grida-skill:svg@${"2".repeat(64)}`,
      source: "bundled",
    };
    const parts = [selected, inferred].map(({ name, uri, source }) => ({
      kind: "skill",
      version: 1,
      data: { name, uri, source },
    }));
    expect(SkillMentions.recalledDocument("Use $svg.", parts)).toBeUndefined();

    const text = `Use ${SkillMentions.markup("$slides", selected.uri)} and $svg.`;
    const document = SkillMentions.recalledDocument(text, parts, "workspace")!;
    const schema = getSchema(ComposerTiptap.extensions({ placeholder: "" }));
    expect(
      ComposerTiptap.formattedMarkdown(schema.nodeFromJSON(document))
    ).toBe(text);
    const core = new ComposerCore();
    core.ingestDocument({
      text,
      document: ComposerTiptap.toDocument(document),
    });
    expect(
      SkillMentions.selected(core.createMessage({ submitted_at: 0 })!)
    ).toEqual([
      { name: selected.name, uri: selected.uri, workspaceId: "workspace" },
    ]);
  });
});

function skill(
  source: NativeChatSkill["source"],
  marker: string
): NativeChatSkill {
  const revision = marker.repeat(64);
  return {
    name: "slides",
    description: "Make slides",
    source,
    revision,
    uri: `grida-skill:slides@${revision}`,
  };
}
