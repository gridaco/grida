import { describe, expect, it } from "vitest";
import { composeSystemPrompt } from "./prompts";

describe("composeSystemPrompt", () => {
  it("loads the shared Grida Copilot posture over the core rules", () => {
    const prompt = composeSystemPrompt({});

    expect(prompt).toContain("Grida Copilot");
    expect(prompt).toContain("coding agent or design agent");
    expect(prompt).toContain("<filesystem>");
  });

  it("loads the svg skill only when requested", () => {
    const base = composeSystemPrompt({});
    const svg = composeSystemPrompt({ skills: ["svg"] });

    expect(base).not.toContain('<skill name="svg">');
    expect(svg).toContain('<skill name="svg">');
  });
});
