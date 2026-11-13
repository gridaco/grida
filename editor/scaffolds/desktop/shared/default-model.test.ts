// GRIDA-GG: desktop — default-model selection (issue #942)
import { describe, it, expect } from "vitest";
import {
  CHATGPT_PROVIDER_ID,
  CHATGPT_SUBSCRIPTION_MODEL_IDS,
  GG_PROVIDER_ID,
} from "@grida/agent";
import {
  CHATGPT_READY_DEFAULT_MODEL_ID,
  DEFAULT_MODEL_ID,
  GG_INCLUDED_MODEL_ID,
  reconcileChatGptSubscriptionDefault,
  resolveDefaultModelSelection,
  shouldUpgradeToIncluded,
} from "./default-model";

describe("resolveDefaultModelSelection", () => {
  it("uses GPT-5.6 Sol as the generic pro-tier fallback", () => {
    expect(DEFAULT_MODEL_ID).toBe("openai/gpt-5.6-sol");
  });

  it("keeps the generic fallback compatible with the first-priority ChatGPT provider", () => {
    expect(CHATGPT_SUBSCRIPTION_MODEL_IDS).toContain(DEFAULT_MODEL_ID);
  });

  it("defaults a fresh subscription-backed chat to GPT-5.6 Sol", () => {
    expect(
      resolveDefaultModelSelection({
        chatGptReady: true,
        ggActive: true,
      })
    ).toEqual({
      model_id: CHATGPT_READY_DEFAULT_MODEL_ID,
      provider_id: CHATGPT_PROVIDER_ID,
    });
    expect(CHATGPT_READY_DEFAULT_MODEL_ID).toBe("openai/gpt-5.6-sol");
    expect(CHATGPT_SUBSCRIPTION_MODEL_IDS).toContain(
      CHATGPT_READY_DEFAULT_MODEL_ID
    );
  });

  it("upgrades the keyless default to the included tier when a GG session is live", () => {
    expect(
      resolveDefaultModelSelection({
        chatGptReady: false,
        ggActive: true,
      })
    ).toEqual({
      model_id: GG_INCLUDED_MODEL_ID,
      provider_id: GG_PROVIDER_ID,
    });
  });

  it("falls back to the hosted catalog default when no GG session is live", () => {
    expect(
      resolveDefaultModelSelection({
        chatGptReady: false,
        ggActive: false,
      })
    ).toEqual({ model_id: DEFAULT_MODEL_ID });
  });

  it("the default is the included hosted catalog id", () => {
    // A `claude-acp/*` agent-provider id would run the user's own Claude auth,
    // not the gateway — the default must be a catalog id.
    expect(DEFAULT_MODEL_ID).toBe(GG_INCLUDED_MODEL_ID);
    expect(GG_INCLUDED_MODEL_ID.startsWith("claude-acp/")).toBe(false);
  });
});

describe("reconcileChatGptSubscriptionDefault", () => {
  const untouched = {
    current: { model_id: DEFAULT_MODEL_ID },
    chatGptReady: true,
    ggActive: false,
    userPicked: false,
  };

  it("promotes the untouched generic or Grida default to ChatGPT Sol", () => {
    const expected = {
      model_id: CHATGPT_READY_DEFAULT_MODEL_ID,
      provider_id: CHATGPT_PROVIDER_ID,
    };
    expect(reconcileChatGptSubscriptionDefault(untouched)).toEqual(expected);
    expect(
      reconcileChatGptSubscriptionDefault({
        ...untouched,
        current: {
          model_id: GG_INCLUDED_MODEL_ID,
          provider_id: GG_PROVIDER_ID,
        },
      })
    ).toEqual(expected);
  });

  it("restores the available non-subscription default after sign-out", () => {
    const current = {
      model_id: CHATGPT_READY_DEFAULT_MODEL_ID,
      provider_id: CHATGPT_PROVIDER_ID,
    };
    expect(
      reconcileChatGptSubscriptionDefault({
        ...untouched,
        current,
        chatGptReady: false,
      })
    ).toEqual({ model_id: DEFAULT_MODEL_ID });
    expect(
      reconcileChatGptSubscriptionDefault({
        ...untouched,
        current,
        chatGptReady: false,
        ggActive: true,
      })
    ).toEqual({
      model_id: GG_INCLUDED_MODEL_ID,
      provider_id: GG_PROVIDER_ID,
    });
  });

  it("never overrides an explicit user pick", () => {
    expect(
      reconcileChatGptSubscriptionDefault({
        ...untouched,
        userPicked: true,
      })
    ).toEqual(untouched.current);
  });

  it("never overrides another model or explicit provider", () => {
    const anotherModel = { model_id: "anthropic/claude-opus-4.8" };
    expect(
      reconcileChatGptSubscriptionDefault({
        ...untouched,
        current: anotherModel,
      })
    ).toEqual(anotherModel);
    const explicitProvider = {
      model_id: DEFAULT_MODEL_ID,
      provider_id: "openrouter",
    };
    expect(
      reconcileChatGptSubscriptionDefault({
        ...untouched,
        current: explicitProvider,
      })
    ).toEqual(explicitProvider);
  });
});

describe("shouldUpgradeToIncluded — the async GG-active guard", () => {
  const untouched = {
    current: { model_id: DEFAULT_MODEL_ID },
    userPicked: false,
  };

  it("upgrades the untouched fallback default", () => {
    expect(shouldUpgradeToIncluded(untouched)).toBe(true);
  });

  it("never overrides an explicit user pick", () => {
    expect(shouldUpgradeToIncluded({ ...untouched, userPicked: true })).toBe(
      false
    );
  });

  it("never overrides a selection that is no longer the default", () => {
    expect(
      shouldUpgradeToIncluded({
        ...untouched,
        current: { model_id: "anthropic/claude-opus-4.8" },
      })
    ).toBe(false);
  });
});
