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
  resolveNewChatTransition,
  shouldUpgradeToIncluded,
} from "./default-model";

/** A stub `isKnownId` that recognizes exactly the given ids. */
const knows =
  (...ids: string[]) =>
  (id: string | undefined | null): id is string =>
    typeof id === "string" && ids.includes(id);

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
        isKnownId: knows(),
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
        isKnownId: knows(),
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
        isKnownId: knows(),
      })
    ).toEqual({ model_id: DEFAULT_MODEL_ID });
  });

  it("an explicit caller-seeded initial wins over the GG default", () => {
    const initial = "openai/gpt-5.6-luna";
    expect(
      resolveDefaultModelSelection({
        initial,
        initialProviderId: CHATGPT_PROVIDER_ID,
        chatGptReady: true,
        ggActive: true,
        isKnownId: knows(initial),
      })
    ).toEqual({
      model_id: initial,
      provider_id: CHATGPT_PROVIDER_ID,
    });
  });

  it("a provided-but-unknown initial blocks provider-owned defaults", () => {
    // A caller `initial` that isn't known yet may be a late-loading endpoint
    // model (issue #806). Falls to the default until the registry loads
    // upstream.
    expect(
      resolveDefaultModelSelection({
        initial: "ollama/llama-3.3",
        chatGptReady: true,
        ggActive: true,
        isKnownId: knows(),
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

describe("resolveNewChatTransition", () => {
  it("resets a past chat to ChatGPT Sol when the subscription is ready", () => {
    expect(
      resolveNewChatTransition({
        previousBindingEpoch: 4,
        currentBindingEpoch: 5,
        currentSessionId: null,
        chatGptReady: true,
        ggActive: true,
      })
    ).toEqual({
      model_id: CHATGPT_READY_DEFAULT_MODEL_ID,
      provider_id: CHATGPT_PROVIDER_ID,
    });
  });

  it("falls back to Grida, then the generic default, when ChatGPT is unavailable", () => {
    expect(
      resolveNewChatTransition({
        previousBindingEpoch: 4,
        currentBindingEpoch: 5,
        currentSessionId: null,
        chatGptReady: false,
        ggActive: true,
      })
    ).toEqual({
      model_id: GG_INCLUDED_MODEL_ID,
      provider_id: GG_PROVIDER_ID,
    });
    expect(
      resolveNewChatTransition({
        previousBindingEpoch: 4,
        currentBindingEpoch: 5,
        currentSessionId: null,
        chatGptReady: false,
        ggActive: false,
      })
    ).toEqual({ model_id: DEFAULT_MODEL_ID });
  });

  it("can promote a cold New Chat reset when readiness arrives later", () => {
    const cold = resolveNewChatTransition({
      previousBindingEpoch: 4,
      currentBindingEpoch: 5,
      currentSessionId: null,
      chatGptReady: false,
      ggActive: false,
    });
    expect(cold).toEqual({ model_id: DEFAULT_MODEL_ID });
    expect(
      reconcileChatGptSubscriptionDefault({
        current: cold!,
        chatGptReady: true,
        ggActive: false,
        userPicked: false,
        hasInitial: false,
        storedSeeded: false,
      })
    ).toEqual({
      model_id: CHATGPT_READY_DEFAULT_MODEL_ID,
      provider_id: CHATGPT_PROVIDER_ID,
    });
  });

  it("does not reset the initial fresh-chat mount or an existing chat", () => {
    expect(
      resolveNewChatTransition({
        previousBindingEpoch: undefined,
        currentBindingEpoch: 0,
        currentSessionId: null,
        chatGptReady: true,
        ggActive: true,
      })
    ).toBeNull();
    expect(
      resolveNewChatTransition({
        previousBindingEpoch: 4,
        currentBindingEpoch: 5,
        currentSessionId: "ses_next",
        chatGptReady: true,
        ggActive: true,
      })
    ).toBeNull();
    expect(
      resolveNewChatTransition({
        previousBindingEpoch: 5,
        currentBindingEpoch: 5,
        currentSessionId: null,
        chatGptReady: true,
        ggActive: true,
      })
    ).toBeNull();
  });
});

describe("reconcileChatGptSubscriptionDefault", () => {
  const untouched = {
    current: { model_id: DEFAULT_MODEL_ID },
    chatGptReady: true,
    ggActive: false,
    userPicked: false,
    hasInitial: false,
    storedSeeded: false,
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

  it("never overrides a caller initial or stored-session seed", () => {
    expect(
      reconcileChatGptSubscriptionDefault({
        ...untouched,
        hasInitial: true,
      })
    ).toEqual(untouched.current);
    expect(
      reconcileChatGptSubscriptionDefault({
        ...untouched,
        storedSeeded: true,
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
        current: { model_id: "anthropic/claude-opus-4.8" },
      })
    ).toBe(false);
  });
});

describe("installed text runtime defaults", () => {
  it.each([undefined, false])(
    "rejects a current-only initial seed on an older runtime (%s)",
    (textCatalogV2) => {
      for (const initial of [
        "openai/gpt-6-sol",
        "openai/gpt-6-luna",
        "anthropic/claude-opus-5.5",
      ]) {
        for (const initialProviderId of [
          undefined,
          "gg",
          "openrouter",
          "vercel",
        ]) {
          expect(
            resolveDefaultModelSelection({
              initial,
              initialProviderId,
              textCatalogV2,
              chatGptReady: true,
              ggActive: true,
              isKnownId: knows(initial),
            })
          ).toEqual({ model_id: DEFAULT_MODEL_ID });
        }
      }
    }
  );

  it("recovers an untouched explicit seed when the capable preload hydrates", () => {
    const initial = "anthropic/claude-opus-5.5";
    const opts = {
      initial,
      initialProviderId: "openrouter",
      chatGptReady: true,
      ggActive: true,
      isKnownId: knows(initial),
    };
    expect(resolveDefaultModelSelection(opts)).toEqual({
      model_id: DEFAULT_MODEL_ID,
    });
    expect(
      resolveDefaultModelSelection({ ...opts, textCatalogV2: true })
    ).toEqual({
      model_id: initial,
      provider_id: "openrouter",
    });
  });

  it("does not impose service admission on a configured endpoint's model identity", () => {
    const initial = "openai/gpt-6-sol";
    expect(
      resolveDefaultModelSelection({
        initial,
        initialProviderId: "local-gateway",
        textCatalogV2: false,
        chatGptReady: false,
        ggActive: false,
        isKnownId: knows(initial),
      })
    ).toEqual({ model_id: initial, provider_id: "local-gateway" });
  });

  it("does not infer native subscription admission from current service admission", () => {
    const initial = "openai/gpt-6-sol";
    expect(
      resolveDefaultModelSelection({
        initial,
        initialProviderId: CHATGPT_PROVIDER_ID,
        textCatalogV2: true,
        chatGptReady: true,
        ggActive: true,
        isKnownId: knows(initial),
      })
    ).toEqual({ model_id: "openai/gpt-6-sol" });
  });

  it("does not reroute a stored or user-picked current model on an older runtime", () => {
    const current = { model_id: "openai/gpt-6-sol", provider_id: "openrouter" };
    for (const guard of ["storedSeeded", "userPicked"] as const) {
      expect(
        reconcileChatGptSubscriptionDefault({
          current,
          chatGptReady: true,
          ggActive: true,
          textCatalogV2: false,
          hasInitial: false,
          storedSeeded: false,
          userPicked: false,
          [guard]: true,
        })
      ).toBe(current);
    }
  });

  it.each([
    { textCatalogV2: undefined, expected: "openai/gpt-5.6-sol" },
    { textCatalogV2: false, expected: "openai/gpt-5.6-sol" },
    { textCatalogV2: true, expected: "openai/gpt-6-sol" },
  ])(
    "uses $expected for new Grida and unresolved chats (v2=$textCatalogV2)",
    ({ textCatalogV2, expected }) => {
      for (const ggActive of [false, true]) {
        const opts = { textCatalogV2, ggActive, chatGptReady: false };
        const selection = {
          model_id: expected,
          ...(ggActive ? { provider_id: GG_PROVIDER_ID } : {}),
        };
        expect(
          resolveDefaultModelSelection({ ...opts, isKnownId: knows() })
        ).toEqual(selection);
        expect(
          resolveNewChatTransition({
            ...opts,
            previousBindingEpoch: 1,
            currentBindingEpoch: 2,
            currentSessionId: null,
          })
        ).toEqual(selection);
        expect(
          reconcileChatGptSubscriptionDefault({
            ...opts,
            current: {
              model_id: CHATGPT_READY_DEFAULT_MODEL_ID,
              provider_id: CHATGPT_PROVIDER_ID,
            },
            userPicked: false,
            hasInitial: false,
            storedSeeded: false,
          })
        ).toEqual(selection);
      }
    }
  );

  it("keeps native subscription defaults on the observed allowlist after v2 admission", () => {
    expect(
      resolveDefaultModelSelection({
        textCatalogV2: true,
        chatGptReady: true,
        ggActive: true,
        isKnownId: knows(),
      })
    ).toEqual({
      model_id: "openai/gpt-5.6-sol",
      provider_id: CHATGPT_PROVIDER_ID,
    });
  });

  it("upgrades only untouched defaults when the capable preload arrives late", () => {
    const opts = {
      textCatalogV2: true,
      current: { model_id: "openai/gpt-5.6-sol", provider_id: GG_PROVIDER_ID },
      chatGptReady: false,
      ggActive: true,
      userPicked: false,
      hasInitial: false,
      storedSeeded: false,
    };
    expect(reconcileChatGptSubscriptionDefault(opts)).toEqual({
      model_id: "openai/gpt-6-sol",
      provider_id: GG_PROVIDER_ID,
    });
    for (const guard of ["userPicked", "hasInitial", "storedSeeded"]) {
      expect(
        reconcileChatGptSubscriptionDefault({ ...opts, [guard]: true })
      ).toBe(opts.current);
    }
    const byok = { model_id: "openai/gpt-5.6-sol", provider_id: "openrouter" };
    expect(
      reconcileChatGptSubscriptionDefault({ ...opts, current: byok })
    ).toBe(byok);
  });

  it("preserves a known explicit provider/model seed when the service default advances", () => {
    const initial = "openai/gpt-5.6-sol";
    expect(
      resolveDefaultModelSelection({
        textCatalogV2: true,
        initial,
        initialProviderId: "openrouter",
        chatGptReady: true,
        ggActive: true,
        isKnownId: knows(initial),
      })
    ).toEqual({ model_id: initial, provider_id: "openrouter" });
  });

  it("allows async Grida activation for the untouched v2 fallback", () => {
    expect(
      shouldUpgradeToIncluded({
        current: { model_id: "openai/gpt-6-sol" },
        userPicked: false,
        hasInitial: false,
        storedSeeded: false,
      })
    ).toBe(true);
  });
});
