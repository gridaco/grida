// GRIDA-GG: desktop — default-model selection (issue #942)
import { describe, it, expect } from "vitest";
import {
  DEFAULT_MODEL_ID,
  GG_INCLUDED_MODEL_ID,
  resolveDefaultModelId,
  shouldUpgradeToIncluded,
} from "./default-model";

/** A stub `isKnownId` that recognizes exactly the given ids. */
const knows =
  (...ids: string[]) =>
  (id: string | undefined | null): id is string =>
    typeof id === "string" && ids.includes(id);

describe("resolveDefaultModelId — the initial default for a new chat", () => {
  it("defaults the picker to GPT-5.6 Terra", () => {
    expect(DEFAULT_MODEL_ID).toBe("openai/gpt-5.6-terra");
  });

  it("upgrades the keyless default to the included tier when a GG session is live", () => {
    expect(resolveDefaultModelId({ ggActive: true, isKnownId: knows() })).toBe(
      GG_INCLUDED_MODEL_ID
    );
  });

  it("falls back to the hosted catalog default when no GG session is live", () => {
    expect(resolveDefaultModelId({ ggActive: false, isKnownId: knows() })).toBe(
      DEFAULT_MODEL_ID
    );
  });

  it("an explicit caller-seeded initial wins over the GG default", () => {
    const initial = "openai/gpt-5.4-mini";
    expect(
      resolveDefaultModelId({
        initial,
        ggActive: true,
        isKnownId: knows(initial),
      })
    ).toBe(initial);
  });

  it("a provided-but-unknown initial falls back to the hosted default", () => {
    // A caller `initial` that isn't known yet may be a late-loading endpoint
    // model (issue #806). Falls to the default until the registry loads
    // upstream.
    expect(
      resolveDefaultModelId({
        initial: "ollama/llama-3.3",
        ggActive: true,
        isKnownId: knows(),
      })
    ).toBe(DEFAULT_MODEL_ID);
  });

  it("the default is the included hosted catalog id", () => {
    // A `claude-acp/*` agent-provider id would run the user's own Claude auth,
    // not the gateway — the default must be a catalog id.
    expect(DEFAULT_MODEL_ID).toBe(GG_INCLUDED_MODEL_ID);
    expect(GG_INCLUDED_MODEL_ID.startsWith("claude-acp/")).toBe(false);
  });
});

describe("shouldUpgradeToIncluded — the async GG-active guard", () => {
  const untouched = {
    current: DEFAULT_MODEL_ID,
    userPicked: false,
    hasInitial: false,
    storedSeeded: false,
  };

  it("upgrades the untouched fallback default", () => {
    expect(shouldUpgradeToIncluded(untouched)).toBe(true);
  });

  it("never overrides an explicit user pick", () => {
    expect(shouldUpgradeToIncluded({ ...untouched, userPicked: true })).toBe(
      false
    );
  });

  it("never overrides a caller-provided initial (even before it is known)", () => {
    expect(shouldUpgradeToIncluded({ ...untouched, hasInitial: true })).toBe(
      false
    );
  });

  it("never overrides a stored-session seed", () => {
    expect(shouldUpgradeToIncluded({ ...untouched, storedSeeded: true })).toBe(
      false
    );
  });

  it("never overrides a selection that is no longer the default", () => {
    expect(
      shouldUpgradeToIncluded({
        ...untouched,
        current: "anthropic/claude-opus-4.8",
      })
    ).toBe(false);
  });
});
