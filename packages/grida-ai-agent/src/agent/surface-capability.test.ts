import { describe, expect, it } from "vitest";
import type { LanguageModel } from "ai";
import { buildCapabilityHints } from ".";

const modelFactory = (): LanguageModel => ({}) as LanguageModel;

function surfaceHint(interactive?: boolean): string {
  const hints = buildCapabilityHints({
    model_factory: modelFactory,
    interactive,
  });
  return hints.find((hint) =>
    hint.includes('<capability name="workspace-surfaces">')
  )!;
}

describe("workspace surface capability hint", () => {
  it("is present for both interactive and non-interactive hosts", () => {
    expect(surfaceHint(true)).toContain("`surface_open`");
    expect(surfaceHint(false)).toContain("`surface_open`");
    expect(surfaceHint(undefined)).toContain("`surface_list_open`");
  });

  it("keeps headless presentation auxiliary and continuation-safe", () => {
    const hint = surfaceHint(false);
    expect(hint).toContain("not_interactive");
    expect(hint).toMatch(/do not\s+retry/i);
    expect(hint).toMatch(/continue/i);
    expect(hint).toMatch(/artifact itself/i);
  });

  it("does not treat a request acknowledgement as renderer completion", () => {
    const hint = surfaceHint(true);
    expect(hint).toContain("`requested`");
    expect(hint).toMatch(/does not prove/i);
    expect(hint).toMatch(/opened/i);
  });

  it("presents the first meaningful checkpoint before finishing the work", () => {
    const hint = surfaceHint(true);
    expect(hint).toMatch(/early progress\s+milestone/i);
    expect(hint).toMatch(/smallest meaningful valid version/i);
    expect(hint).toMatch(/open it\s+immediately/i);
    expect(hint).toMatch(/keep refining/i);
    expect(hint).toMatch(/do not author the finished artifact/i);
    expect(hint).toMatch(/do not wait for complete content, polish/i);
    expect(hint).toMatch(/final `validate and open` step/i);
    expect(hint).toMatch(/never open an empty, broken/i);
  });

  it("uses the same workspace-rooted path vocabulary as filesystem tools", () => {
    const hint = surfaceHint(true);
    expect(hint).toMatch(/absolute agent-filesystem/i);
    expect(hint).toContain("starting with `/`");
    expect(hint).toMatch(/file, or a recognized bundle directory/i);
  });
});
