import { describe, expect, it } from "vitest";
import { NativeChatSkills } from "./native-chat-skills";
import {
  parseNativeChatHostDisplayParts,
  parseNativeChatMessageContext,
} from "./native-chat-message-context";

function link(revision: string, selector = "slides") {
  return `grida-skill:${selector}@${revision.repeat(64)}`;
}

describe("NativeChatSkills", () => {
  it("keeps same-name sources distinct and returns metadata only", () => {
    const description = "A description";
    const input = [
      {
        name: "slides",
        description,
        source: "project_agents",
        revision: "a".repeat(64),
        uri: link("a"),
      },
      {
        name: "slides",
        description,
        source: "personal",
        revision: "b".repeat(64),
        uri: link("b"),
      },
    ];
    expect(
      NativeChatSkills.catalog({
        skills: input.map((item) => ({ ...item, path: "/private" })),
      })
    ).toEqual(input);
    expect(
      NativeChatSkills.catalog({ skills: [input[0], input[0]] })
    ).toBeNull();
    expect(
      NativeChatSkills.catalog({ skills: [{ ...input[0], name: "other" }] })
    ).toBeNull();
  });

  it("validates bounded exact references with optional workspace scope", () => {
    const personal = { name: "slides", uri: link("b") };
    const project = {
      name: "slides",
      uri: link("a"),
      workspaceId: "workspace-1",
    };
    const extension = { name: "slides", uri: link("a", "package/slides") };
    expect(NativeChatSkills.references([personal, project, extension])).toEqual(
      [personal, project, extension]
    );
    expect(NativeChatSkills.references([personal, personal])).toBeNull();
    expect(
      NativeChatSkills.references([{ ...project, workspaceId: "/project" }])
    ).toBeNull();
    expect(
      NativeChatSkills.references([
        { ...personal, uri: link("a", "../slides") },
      ])
    ).toBeNull();
    expect(
      NativeChatSkills.references([{ ...personal, name: "renamed" }])
    ).toBeNull();
  });

  it("reserves skill display parts for the host and bounds them separately", () => {
    const context = Array.from({ length: 16 }, () => ({
      kind: "sample",
      version: 1,
      data: { label: "A reference" },
    }));
    const skills = ["a", "b", "c", "d"].map((revision) => ({
      kind: "skill",
      version: 1,
      data: { name: "slides", source: "personal", uri: link(revision) },
    }));
    expect(parseNativeChatHostDisplayParts([...context, ...skills])).toEqual([
      ...context,
      ...skills,
    ]);
    expect(parseNativeChatHostDisplayParts([...skills, skills[0]])).toBeNull();
    expect(
      parseNativeChatHostDisplayParts([...context, context[0]])
    ).toBeNull();
    expect(
      parseNativeChatMessageContext({
        modelText: "Guidance",
        displayParts: skills,
      })
    ).toBeNull();
  });
});
