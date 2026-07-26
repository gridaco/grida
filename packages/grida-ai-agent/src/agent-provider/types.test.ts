import { describe, expect, it } from "vitest";
import {
  AGENT_PROVIDER_MODELS,
  agentProviderModel,
  isAgentProviderModel,
  type AgentProviderModelId,
} from "./types";

/**
 * Claude Code's own alias vocabulary. An alias resolves to whatever version is
 * current, so one landing in {@link AGENT_PROVIDER_MODELS} would silently
 * change model under us — the map's contract is full vendor ids only.
 */
const CLAUDE_CODE_ALIASES = [
  "sonnet",
  "opus",
  "haiku",
  "fable",
  "best",
  "opusplan",
  "sonnet[1m]",
  "opus[1m]",
  "fable[1m]",
] as const;

/**
 * A full vendor id — `claude-`-prefixed, optionally carrying the `[1m]`
 * suffix. Deliberately loose about the version shape (dated snapshots and
 * `claude-3-5-haiku`-style ids are legitimate); the alias check below is what
 * carries the real constraint.
 */
const FULL_VENDOR_ID = /^claude-[a-z0-9-]+(\[1m\])?$/;

const ids = Object.keys(AGENT_PROVIDER_MODELS) as AgentProviderModelId[];

/** Entries that pin a vendor model — everything but the subscription default. */
const pinned = ids.filter((id) => id !== "claude-acp");

describe("AGENT_PROVIDER_MODELS", () => {
  it.each(ids)("routes %s to the single agent-provider id", (id) => {
    expect(AGENT_PROVIDER_MODELS[id].id).toBe("claude");
  });

  it("leaves the bare id unpinned so it takes the subscription default", () => {
    expect(ids).toContain("claude-acp");
    expect(agentProviderModel("claude-acp")).toBeUndefined();
    // …and it is the only unpinned entry.
    expect(pinned.length).toBe(ids.length - 1);
  });

  it.each(pinned)("pins %s to a full vendor id, never an alias", (id) => {
    const model = agentProviderModel(id);
    expect(model).toBeDefined();
    expect(model).toMatch(FULL_VENDOR_ID);
    expect(CLAUDE_CODE_ALIASES).not.toContain(model);
  });

  it.each(pinned)("keeps %s's context suffix honest", (id) => {
    // A `-1m` key must carry the `[1m]` vendor suffix and vice versa. The
    // suffix only adds the 1M-context beta (Claude Code strips it before the
    // request), so a key that advertises it without setting it — or sets it
    // without saying so — misdescribes what the entry asks for.
    expect(id.endsWith("-1m")).toBe(
      agentProviderModel(id)?.endsWith("[1m]") === true
    );
  });

  it("retains superseded entries, newest first", () => {
    // Grida-catalogue deprecation does not transfer to this map: these run on
    // the user's own subscription. Dropping a key is a hard break for anything
    // pinned to it — the id stops passing the run-input gate, and this map is
    // the only record of a persisted session's vendor model.
    expect(agentProviderModel("claude-acp/opus-5")).toBe("claude-opus-5");
    expect(agentProviderModel("claude-acp/opus-4.8-1m")).toBe(
      "claude-opus-4-8[1m]"
    );
    expect(ids.indexOf("claude-acp/opus-5")).toBeLessThan(
      ids.indexOf("claude-acp/opus-4.8-1m")
    );
  });
});

describe("isAgentProviderModel", () => {
  it.each(ids)("accepts the catalogued key %s", (id) => {
    expect(isAgentProviderModel(id)).toBe(true);
  });

  // Prototype keys must not pass: the later AGENT_PROVIDER_MODELS[id] lookup
  // would otherwise yield junk instead of a provider entry.
  it.each([
    "anthropic/claude-opus-5",
    "claude-acp/opus-5-1m",
    "claude-code/opus-4.8-1m",
    "",
    "toString",
    "__proto__",
    "constructor",
  ])("rejects %s", (id) => {
    expect(isAgentProviderModel(id)).toBe(false);
  });

  it("rejects nullish", () => {
    expect(isAgentProviderModel(null)).toBe(false);
    expect(isAgentProviderModel(undefined)).toBe(false);
  });
});
