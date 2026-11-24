import { describe, expect, it } from "vitest";
import type { NativeChatDisplayPart } from "@grida/desktop-bridge";
import { SkillMentions } from "@/lib/agent-chat/skill-mentions";
import {
  isUserMessageSkillMarker,
  projectUserMessageSkills,
} from "./user-message-markdown";

function skill(revision: string, source?: string) {
  return {
    kind: "skill",
    version: 1,
    data: {
      name: "slides",
      uri: `grida-skill:slides@${revision.repeat(64)}`,
      ...(source && { source }),
    },
  } satisfies NativeChatDisplayPart;
}

describe("user message skill placement", () => {
  it("places exact skill revisions within the message and keeps remaining context detached", () => {
    const project = skill("1", "project_agents");
    const personal = skill("2", "personal");
    const legacy = skill("3", "bundled");
    const attachment = { kind: "attachment", version: 1, data: {} };
    const projectMarkup = SkillMentions.markup("$slides", project.data.uri);
    const personalMarkup = SkillMentions.markup("$slides", personal.data.uri);
    const literal = "plain $slides or `" + personalMarkup + "`";
    const { text, context, links } = projectUserMessageSkills(
      `Use **${projectMarkup}** first and ${personalMarkup} afterward; ${literal}.`,
      [personal, attachment, project, legacy]
    );
    const [[projectHref, projectLink], [personalHref, personalLink]] = [
      ...links,
    ];
    expect(projectLink).toEqual({ label: "slides", source: "Project" });
    expect(personalLink).toEqual({ label: "slides", source: "Personal" });
    expect(projectHref).not.toBe(personalHref);
    expect(isUserMessageSkillMarker(projectHref)).toBe(true);
    expect(isUserMessageSkillMarker(personalHref)).toBe(true);
    expect(isUserMessageSkillMarker("https://grida.co/skills")).toBe(false);
    expect(text).toBe(
      `Use **[$slides](${projectHref})** first and [$slides](${personalHref}) afterward; ${literal}.`
    );
    expect(context).toEqual([attachment, legacy]);
  });

  it("never treats a matching name or unbound URI as evidence of a selection", () => {
    const bound = skill("1", "project_agents");
    const unbound = skill("2", "personal");
    const text = SkillMentions.markup("$slides", unbound.data.uri);
    expect(projectUserMessageSkills(text, [bound])).toEqual({
      text,
      context: [bound],
      links: new Map(),
    });
  });

  it("refreshes projected Markdown when the host confirms a skill source", () => {
    const pending = skill("1");
    const accepted = skill("1", "project_agents");
    const text = SkillMentions.markup("$slides", pending.data.uri);
    const before = projectUserMessageSkills(text, [pending]);
    const after = projectUserMessageSkills(text, [accepted]);
    expect([...before.links.values()]).toEqual([{ label: "slides" }]);
    expect([...after.links.values()]).toEqual([
      { label: "slides", source: "Project" },
    ]);
    expect(before.text).not.toBe(after.text);
  });
});
