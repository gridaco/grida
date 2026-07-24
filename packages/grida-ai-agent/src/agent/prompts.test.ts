import { describe, expect, it } from "vitest";
import { composeSystemPrompt } from "./prompts";

describe("composeSystemPrompt", () => {
  it("loads the shared Grida Copilot posture over the core rules", () => {
    const prompt = composeSystemPrompt({});

    expect(prompt).toContain("Grida Copilot");
    expect(prompt).toContain("coding agent or design agent");
    expect(prompt).toContain("<filesystem>");
  });

  it("teaches current-content edits without a prior-read authorization rule", () => {
    const prompt = composeSystemPrompt({});

    expect(prompt).toMatch(
      /checks `old_string` against the file's current\s+content/
    );
    expect(prompt).toMatch(
      /Do not re-read content you just successfully\s+wrote/
    );
    expect(prompt).not.toContain("before your first edit");
    expect(prompt).not.toContain("most recent `version`");
    expect(prompt).toContain('reason="too_large"');
  });

  it("injects raw eager skill blocks only when provided", () => {
    const base = composeSystemPrompt({});
    const withBlock = composeSystemPrompt({
      skill_blocks: ["<eager-block>hello</eager-block>"],
    });

    expect(base).not.toContain("<eager-block>");
    expect(withBlock).toContain("<eager-block>hello</eager-block>");
  });

  it("renders the advertised skill index above eager blocks", () => {
    const prompt = composeSystemPrompt({
      skill_index: "<skills>\n- svg: edit svg\n</skills>",
      skill_blocks: ["EAGER"],
    });
    // index (advertise-then-load) comes before eager blocks in assembly order
    expect(prompt.indexOf("<skills>")).toBeGreaterThan(-1);
    expect(prompt.indexOf("<skills>")).toBeLessThan(prompt.indexOf("EAGER"));
  });
});
