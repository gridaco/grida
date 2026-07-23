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

  it("uses the same workspace-rooted path vocabulary as filesystem tools", () => {
    const hint = surfaceHint(true);
    expect(hint).toMatch(/absolute agent-filesystem/i);
    expect(hint).toContain("starting with `/`");
    expect(hint).toMatch(/file, or a recognized bundle directory/i);
  });
});
