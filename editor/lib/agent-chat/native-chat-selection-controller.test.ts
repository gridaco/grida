import { describe, expect, it, vi } from "vitest";
import type {
  DesktopNativeChat,
  NativeChatSelectionState,
  NativeChatSelectionTarget,
} from "@grida/desktop-bridge";
import { NativeChatController } from "./native-chat-controller";

function fixture() {
  const a = "a".repeat(64),
    b = "b".repeat(64);
  let active: string | null = a;
  let defaults: NonNullable<NativeChatSelectionState["selection"]> = {
    profileId: b,
    modelId: "model-b",
    effort: "high",
  };
  const states = new Map<string, NativeChatSelectionState>([
    [
      "chat-a",
      {
        target: { sessionId: "chat-a" },
        revision: 1,
        selection: { profileId: a, modelId: "model-a", effort: "low" },
        available: true,
      },
    ],
    [
      "chat-b",
      {
        target: { sessionId: "chat-b" },
        revision: 2,
        selection: defaults,
        available: true,
      },
    ],
  ]);
  const key = (target: NativeChatSelectionTarget): string => {
    const value = target.sessionId ?? target.draftId;
    if (typeof value !== "string") throw new Error("invalid selection fixture");
    return value;
  };
  const values = new Map<string, string>();
  const memory = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const bridge: DesktopNativeChat = {
    status: async () => "native-ready",
    takeNotificationFocus: async () => null,
    list: async () => ({ sessionIds: ["chat-a", "chat-b"], nextCursor: null }),
    create: vi.fn<DesktopNativeChat["create"]>(async () => ({
      attachmentId: "legacy",
      sessionId: "legacy",
    })),
    load: vi.fn<DesktopNativeChat["load"]>(async (id) => ({
      attachmentId: id,
      sessionId: id,
    })),
    detach: async () => {},
    submit: vi.fn<DesktopNativeChat["submit"]>(async (id, inputId) => ({
      sessionId: id,
      inputId,
      disposition: "claimed",
      inputPosition: 1,
      turnId: `turn-${id}`,
    })),
    inputReceipt: vi.fn<DesktopNativeChat["inputReceipt"]>(async () => {
      throw new Error("input_unavailable");
    }),
    observe: async (id) => ({
      observationId: `observation-${id}`,
      snapshot: {
        sessionId: id,
        sessionRevision: 1,
        queuedInputs: 0,
        admissionPaused: false,
        current: null,
        latest: null,
      },
    }),
    transcript: async () => [],
    control: async () => {
      throw new Error("not used");
    },
    subscribe: async () => "subscription",
    unsubscribe: async () => {},
    selection: vi.fn<NonNullable<DesktopNativeChat["selection"]>>(
      async (target) => {
        if (!states.has(key(target)))
          states.set(key(target), {
            target,
            revision: 1,
            selection: { ...defaults },
            available: true,
          });
        return structuredClone(states.get(key(target))!);
      }
    ),
    updateSelection: vi.fn<NonNullable<DesktopNativeChat["updateSelection"]>>(
      async (target, expected, _operation, choice) => {
        const old = states.get(key(target))!;
        if (old.revision !== expected)
          throw new Error("selection_revision_changed");
        defaults = {
          ...choice,
          modelId:
            choice.profileId === null
              ? "default-model"
              : choice.profileId === a
                ? "model-a"
                : "model-b",
        };
        const state = {
          target,
          revision: expected + 1,
          selection: defaults,
          available: true,
        };
        states.set(key(target), state);
        return structuredClone(state);
      }
    ),
    profiles: async () => ({
      active,
      modelChanges: true,
      choices: [
        { id: a, connection: "A", model: "Model A", ultra: true },
        { id: b, connection: "B", model: "Model B", ultra: true },
      ],
      saved: [],
    }),
    selectProfile: vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
      async (selected) => {
        active = selected.kind === "default" ? null : selected.id;
      }
    ),
    createFromDraft: vi.fn<NonNullable<DesktopNativeChat["createFromDraft"]>>(
      async (id) => {
        states.set("created", {
          ...states.get(id)!,
          target: { sessionId: "created" },
          revision: 1,
        });
        return {
          attachmentId: "created",
          sessionId: "created",
          firstInputId: "stable-first-input",
        };
      }
    ),
    submitInRegime: vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
      async (_action, id, inputId) => ({
        sessionId: id,
        inputId,
        disposition: "claimed",
        inputPosition: 1,
        turnId: `turn-${id}`,
      })
    ),
    acceptsEffort: async () => true,
  };
  bridge.enqueue = bridge.submit;
  return {
    bridge,
    a,
    b,
    states,
    memory,
    make: () => new NativeChatController(bridge, memory, "selection"),
    defaults: () => defaults,
  };
}

async function ready(controller: NativeChatController) {
  await vi.waitFor(() => expect(controller.read().loading).toBe(false));
}

describe("durable chat selection controller", () => {
  it.each([false, true])(
    "keeps pending Send feedback through initial route activation (switch chat: %s)",
    async (switchChat) => {
      const f = fixture();
      const pending =
        Promise.withResolvers<
          Awaited<ReturnType<DesktopNativeChat["submit"]>>
        >();
      const send = vi.mocked(f.bridge.submitInRegime!);
      send.mockReturnValueOnce(pending.promise);
      const controller = f.make();
      try {
        controller.connect(null);
        await ready(controller);
        const originalScope = controller.read().scope;
        const sending = controller.submit("First request");
        expect(controller.read().submitting).toBe(true);
        await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
        expect(controller.read().scope).not.toBe(originalScope);
        expect(controller.read().submitting).toBe(true);
        const [, attachmentId, inputId] = send.mock.calls[0];
        if (switchChat) await controller.select("chat-a");
        expect(controller.read().submitting).toBe(!switchChat);
        pending.resolve({
          sessionId: attachmentId,
          inputId,
          disposition: "claimed",
          inputPosition: 1,
          turnId: "turn-first",
        });
        await sending;
        expect(controller.read().submitting).toBe(false);
      } finally {
        controller.disconnect();
      }
    }
  );

  it("restores separate pairs without activating a route or changing defaults", async () => {
    const f = fixture(),
      controller = f.make();
    controller.connect("chat-a");
    await ready(controller);
    expect(controller.read().effort).toBe("low");
    expect(controller.read().profiles?.active).toBe(f.a);
    await controller.select("chat-b");
    expect(controller.read().effort).toBe("high");
    expect(controller.read().profiles?.active).toBe(f.b);
    await controller.select("chat-a");
    expect(f.bridge.selectProfile).not.toHaveBeenCalled();
    expect(f.bridge.updateSelection).not.toHaveBeenCalled();
    expect(f.defaults().profileId).toBe(f.b);
    controller.disconnect();
  });

  it("uses the complete current pair after an effort-only explicit change", async () => {
    const f = fixture(),
      controller = f.make();
    controller.connect("chat-a");
    await ready(controller);
    controller.selectEffort("medium");
    await vi.waitFor(() => expect(controller.read().profileBusy).toBe(false));
    expect(f.defaults()).toEqual({
      profileId: f.a,
      modelId: "model-a",
      effort: "medium",
    });
    await controller.select("chat-b");
    await controller.select(null);
    expect(controller.read().effort).toBe("medium");
    expect(controller.read().profiles?.active).toBe(f.a);
    expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
    controller.disconnect();
  });

  it.each([false, true])(
    "keeps an explicit default model during an effort change (selection restore pending: %s)",
    async (pendingRestore) => {
      const f = fixture();
      const saved: NativeChatSelectionState = {
        target: { sessionId: "chat-a" },
        revision: 3,
        selection: {
          profileId: null,
          modelId: "default-model",
          effort: "high",
        },
        available: true,
      };
      f.states.set("chat-a", saved);
      const read = f.bridge.selection!;
      const pending = Promise.withResolvers<NativeChatSelectionState>();
      f.bridge.selection = (target) =>
        pendingRestore && target.sessionId === "chat-a"
          ? pending.promise
          : read(target);
      const controller = f.make();
      try {
        controller.connect("chat-a");
        if (!pendingRestore) await ready(controller);
        controller.selectEffort("medium");
        pending.resolve(saved);
        await vi.waitFor(() =>
          expect(f.bridge.updateSelection).toHaveBeenCalledOnce()
        );
        await vi.waitFor(() =>
          expect(controller.read().profileBusy).toBe(false)
        );
        expect(f.defaults()).toEqual({
          profileId: null,
          modelId: "default-model",
          effort: "medium",
        });
        expect(f.bridge.selectProfile).not.toHaveBeenCalled();
      } finally {
        controller.disconnect();
      }
    }
  );

  it("restores the durable unsent draft after a renderer restart", async () => {
    const f = fixture();
    let controller = f.make();
    controller.connect(null);
    await ready(controller);
    await controller.selectProfile({ kind: "new", id: f.a });
    controller.selectEffort("xhigh");
    await vi.waitFor(() => expect(controller.read().profileBusy).toBe(false));
    controller.disconnect();
    controller = f.make();
    controller.connect(null);
    await ready(controller);
    expect(controller.read().effort).toBe("xhigh");
    expect(controller.read().profiles?.active).toBe(f.a);
    expect(f.bridge.createFromDraft).not.toHaveBeenCalled();
    controller.disconnect();
  });

  it("activates on send and preserves first-input identity and the native settings revision", async () => {
    const f = fixture(),
      controller = f.make();
    controller.connect(null);
    await ready(controller);
    expect(f.bridge.selectProfile).not.toHaveBeenCalled();
    await controller.submit("Hello");
    expect(f.bridge.selectProfile).toHaveBeenCalledExactlyOnceWith({
      kind: "new",
      id: f.b,
    });
    expect(f.bridge.create).not.toHaveBeenCalled();
    expect(f.bridge.createFromDraft).toHaveBeenCalledOnce();
    expect(f.bridge.submitInRegime).toHaveBeenCalledExactlyOnceWith(
      "submit",
      "created",
      "stable-first-input",
      "Hello",
      "act",
      "high",
      undefined,
      1
    );
    controller.disconnect();
  });

  it("keeps the saved future choice when accepted work blocks activation", async () => {
    const f = fixture(),
      controller = f.make();
    controller.connect("chat-a");
    await ready(controller);
    await controller.selectProfile({ kind: "new", id: f.b });
    f.bridge.selectProfile = vi.fn<
      NonNullable<DesktopNativeChat["selectProfile"]>
    >(async () => {
      throw new Error("native_chat_model_change_active_turn");
    });
    await expect(controller.submit("Next task")).rejects.toThrow("active_turn");
    expect(controller.read().profiles?.active).toBe(f.b);
    expect(f.states.get("chat-a")?.selection?.profileId).toBe(f.b);
    expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
    expect(controller.read().error).toContain("running chat turns");
    controller.disconnect();
  });

  it("drops a delayed old-chat restore after another chat opens", async () => {
    const f = fixture(),
      pending = Promise.withResolvers<NativeChatSelectionState>();
    const read = f.bridge.selection!;
    f.bridge.selection = (target) =>
      "sessionId" in target && target.sessionId === "chat-a"
        ? pending.promise
        : read(target);
    const controller = f.make();
    controller.connect("chat-a");
    await controller.select("chat-b");
    pending.resolve(f.states.get("chat-a")!);
    await ready(controller);
    expect(controller.read().selected).toBe("chat-b");
    expect(controller.read().effort).toBe("high");
    controller.disconnect();
  });

  it("preserves unavailable selection and refuses sending without a fallback", async () => {
    const f = fixture();
    f.states.set("chat-a", { ...f.states.get("chat-a")!, available: false });
    const controller = f.make();
    controller.connect("chat-a");
    await ready(controller);
    expect(controller.read().profiles?.active).toBe(f.a);
    expect(controller.canSubmit).toBe(false);
    await expect(controller.submit("Hello")).rejects.toThrow("not_ready");
    expect(f.bridge.selectProfile).not.toHaveBeenCalled();
    controller.disconnect();
  });

  it("Welcome displays the saved application preference before recommendations", async () => {
    const f = fixture();
    const model = new NativeChatController.ModelSelection();
    const catalog = await f.bridge.profiles!();
    await model.refresh(async () => ({
      ...catalog!,
      recommendedProfileId: f.a,
      newChatDefault: { profileId: f.b, modelId: "model-b", effort: "high" },
    }));
    expect(model.read().profileId).toBe(f.b);
    await model.refresh(async () => ({
      ...catalog!,
      recommendedProfileId: f.a,
      newChatDefault: {
        profileId: null,
        modelId: "default-model",
        effort: "high",
      },
    }));
    expect(model.read().profileId).toBeNull();
    model.choose({ kind: "new", id: f.a });
    await model.refresh(async () => ({
      ...catalog!,
      newChatDefault: { profileId: f.b, modelId: "model-b", effort: "low" },
    }));
    expect(model.read().profileId).toBe(f.a);
  });

  it("honors an explicit Welcome default-model choice while inheriting the last effort", async () => {
    const f = fixture(),
      controller = f.make();
    expect(
      await controller.startChat(null, () => ({ text: "Hello" }))
    ).toBeNull();
    expect(f.defaults()).toEqual({
      profileId: null,
      modelId: "default-model",
      effort: "high",
    });
    expect(f.bridge.selectProfile).toHaveBeenCalledExactlyOnceWith({
      kind: "default",
    });
    expect(f.bridge.submitInRegime).toHaveBeenCalledExactlyOnceWith(
      "submit",
      "created",
      "stable-first-input",
      "Hello",
      "act",
      "high",
      undefined,
      1
    );
    controller.disconnect();
  });

  it("waits for Home's saved effort before consuming and submitting the message", async () => {
    const f = fixture(),
      controller = f.make();
    const update = f.bridge.updateSelection!;
    const gate = Promise.withResolvers<void>();
    f.bridge.updateSelection = vi.fn<typeof update>(
      async (...args: Parameters<typeof update>) => {
        await gate.promise;
        return update(...args);
      }
    );
    const take = vi.fn<() => { text: string }>(() => ({
      text: "Plan a poster",
    }));
    const started = controller.startChat(f.b, take, {
      effort: "low",
      operatingRegime: "plan",
    });
    try {
      await vi.waitFor(() =>
        expect(f.bridge.updateSelection).toHaveBeenCalledOnce()
      );
      expect(take).not.toHaveBeenCalled();
      expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
      gate.resolve();
      expect(await started).toBeNull();
      expect(take).toHaveBeenCalledOnce();
      expect(f.bridge.submitInRegime).toHaveBeenCalledExactlyOnceWith(
        "submit",
        "created",
        "stable-first-input",
        "Plan a poster",
        "plan",
        "low",
        undefined,
        1
      );
    } finally {
      gate.resolve();
      controller.disconnect();
    }
  });

  it.each([false, true])(
    "validates Goal funding and Ultra on the activated saved route (supported: %s)",
    async (supported) => {
      const f = fixture();
      const observe = f.bridge.observe;
      f.bridge.observe = async (id) => {
        const observation = await observe(id);
        const selected = (await f.bridge.profiles!())!.active === f.b;
        const available = selected ? supported : !supported;
        return {
          ...observation,
          snapshot: {
            ...observation.snapshot,
            ...(available && {
              goalSpendingAvailable: true as const,
              goalNamedChildAvailable: true as const,
            }),
          },
        };
      };
      f.bridge.goal = async () => ({ observationId: null, goal: null });
      f.bridge.acceptsGoalEffort = async () => {
        const selected = (await f.bridge.profiles!())!.active === f.b;
        return selected ? supported : !supported;
      };
      f.bridge.startGoal = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>(
        async (sessionId, inputId) => ({
          sessionId,
          inputId,
          disposition: "queued" as const,
          inputPosition: 1,
          turnId: null,
        })
      );
      const controller = f.make();
      try {
        controller.connect("chat-a");
        await ready(controller);
        await vi.waitFor(() => expect(controller.read().goalReady).toBe(true));
        await controller.selectProfile({ kind: "new", id: f.b });
        expect(f.bridge.selectProfile).not.toHaveBeenCalled();
        expect(
          await controller.startGoal({
            objective: "Review the export",
            criteria: ["Collect the review"],
            allowance: { workTurns: 2, inferenceSteps: 64 },
            automatic: false,
            effort: "ultra",
            namedChildId: "reviewer",
            maxCostMills: "1000",
          })
        ).toBe(supported);
        expect(f.bridge.selectProfile).toHaveBeenCalledExactlyOnceWith({
          kind: "new",
          id: f.b,
        });
        expect(f.bridge.startGoal).toHaveBeenCalledTimes(Number(supported));
        expect(controller.read().goalEffortAvailable).toBe(supported);
        expect(
          !!controller.read().observation?.snapshot.goalSpendingAvailable
        ).toBe(supported);
        const fundingRefusal = expect.stringContaining(
          "supports enforced goal spending"
        );
        expect(controller.read().error).toEqual(
          supported ? null : fundingRefusal
        );
      } finally {
        controller.disconnect();
      }
    }
  );

  it("validates the Goal draft before activating its saved route", async () => {
    const f = fixture();
    f.bridge.goal = async () => ({ observationId: null, goal: null });
    f.bridge.startGoal = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>();
    const controller = f.make();
    try {
      controller.connect("chat-a");
      await ready(controller);
      await controller.selectProfile({ kind: "new", id: f.b });
      expect(
        await controller.startGoal({
          objective: "",
          criteria: ["Review it"],
          automatic: false,
        })
      ).toBe(false);
      expect(f.bridge.selectProfile).not.toHaveBeenCalled();
      expect(f.bridge.startGoal).not.toHaveBeenCalled();
      expect(controller.read().error).toContain("goal objective");
    } finally {
      controller.disconnect();
    }
  });

  it.each([false, true])(
    "submits a composer Ultra Goal on its saved route and settles its intent (supported: %s)",
    async (supported) => {
      const f = fixture();
      const saved = f.states.get("chat-a")!;
      f.states.set("chat-a", {
        ...saved,
        selection: { ...saved.selection!, effort: "ultra" },
      });
      f.bridge.goal = async () => ({ observationId: null, goal: null });
      f.bridge.acceptsGoalEffort = async () =>
        (await f.bridge.profiles!())!.active === f.b ? supported : !supported;
      f.bridge.startGoal = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>(
        async (sessionId, inputId) => ({
          sessionId,
          inputId,
          disposition: "queued",
          inputPosition: 1,
          turnId: null,
        })
      );
      const controller = f.make();
      try {
        controller.connect("chat-a");
        await ready(controller);
        await controller.selectProfile({ kind: "new", id: f.b });
        controller.selectGoalIntent(true);
        const result = await controller.submit("/goal Review the export").then(
          () => "accepted",
          (error: unknown) =>
            error instanceof Error ? error.message : String(error)
        );
        expect(result).toBe(
          supported
            ? "accepted"
            : "Ultra is unavailable for goals on this connection."
        );
        expect(f.bridge.startGoal).toHaveBeenCalledTimes(Number(supported));
        expect(f.bridge.selectProfile).toHaveBeenCalledExactlyOnceWith({
          kind: "new",
          id: f.b,
        });
        expect(controller.read().goalIntent).toBe(!supported);
        expect(controller.read().effort).toBe("ultra");
      } finally {
        controller.disconnect();
      }
    }
  );

  it("does not clear another chat's Goal intent after a delayed accepted composer Goal", async () => {
    const f = fixture();
    f.bridge.goal = async () => ({ observationId: null, goal: null });
    const pending =
      Promise.withResolvers<
        Awaited<ReturnType<NonNullable<DesktopNativeChat["startGoal"]>>>
      >();
    f.bridge.startGoal = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>(
      () => pending.promise
    );
    const controller = f.make();
    try {
      controller.connect("chat-a");
      await ready(controller);
      await controller.selectProfile({ kind: "new", id: f.b });
      controller.selectGoalIntent(true);
      const sending = controller
        .submit("/goal Review the export")
        .catch(() => {});
      await vi.waitFor(() => expect(f.bridge.startGoal).toHaveBeenCalledOnce());
      await controller.select("chat-b");
      controller.selectGoalIntent(true);
      pending.resolve({
        sessionId: "chat-a",
        inputId: vi.mocked(f.bridge.startGoal).mock.calls[0][1],
        disposition: "queued",
        inputPosition: 1,
        turnId: null,
      });
      await sending;
      expect(controller.read().selected).toBe("chat-b");
      expect(controller.read().goalIntent).toBe(true);
    } finally {
      controller.disconnect();
    }
  });
});

describe("selection activation lineage", () => {
  it("drops an old worker observation that arrives after a saved-route activation", async () => {
    const f = fixture(),
      controller = f.make();
    controller.connect("chat-a");
    await ready(controller);
    const baseline = f.bridge.observe;
    const pending =
      Promise.withResolvers<Awaited<ReturnType<typeof baseline>>>();
    let first = true;
    f.bridge.observe = vi.fn<DesktopNativeChat["observe"]>((id) => {
      if (first) {
        first = false;
        return pending.promise;
      }
      return baseline(id);
    });
    const previousScope = controller.read().scope;
    const oldRead = controller.repair();
    await vi.waitFor(() => expect(f.bridge.observe).toHaveBeenCalledOnce());
    await controller.selectProfile({ kind: "new", id: f.b });
    await controller.submit("Use the saved route");
    expect(controller.read().scope).not.toBe(previousScope);
    expect(controller.read().observation?.snapshot.sessionRevision).toBe(1);
    const old = await baseline("chat-a");
    pending.resolve({
      ...old,
      snapshot: {
        ...old.snapshot,
        sessionRevision: 99,
        goalSpendingAvailable: true,
      },
    });
    await oldRead;
    expect(controller.read().observation?.snapshot.sessionRevision).toBe(1);
    expect(
      controller.read().observation?.snapshot.goalSpendingAvailable
    ).toBeUndefined();
    controller.disconnect();
  });

  it("does not send a delayed Welcome message into a chat opened meanwhile", async () => {
    const f = fixture(),
      controller = f.make();
    const read = f.bridge.selection!;
    const pending = Promise.withResolvers<NativeChatSelectionState>();
    let draft: NativeChatSelectionTarget | undefined;
    f.bridge.selection = (target) => {
      if ("draftId" in target) {
        draft = target;
        return pending.promise;
      }
      return read(target);
    };
    const take = vi.fn<() => { text: string }>(() => ({
      text: "Welcome message",
    }));
    const startup = controller.startChat(f.b, take);
    await vi.waitFor(() => expect(draft).toBeDefined());
    await controller.select("chat-a");
    pending.resolve({
      target: draft!,
      revision: 1,
      selection: { profileId: f.b, modelId: "model-b", effort: "high" },
      available: true,
    });
    expect(await startup).toBeNull();
    expect(take).not.toHaveBeenCalled();
    expect(f.bridge.updateSelection).not.toHaveBeenCalled();
    expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
    expect(controller.read().selected).toBe("chat-a");
    controller.disconnect();
  });
});

describe("logical unsent draft rows", () => {
  it("keeps separate modern UUID drafts apart and promotes exactly the row that creates a chat", async () => {
    const f = fixture();
    const { ComposerDrafts } = await import("./composer-drafts");
    type Blob = import("./composer-drafts").ComposerDraftBlob;
    const blobs = new Map<string, Blob>();
    const store = new ComposerDrafts(null, {
      get: async (key) => blobs.get(key) ?? null,
      put: async (key, value) => {
        blobs.set(key, value);
      },
      delete: async (key) => {
        blobs.delete(key);
      },
    });
    const controller = f.make();
    controller.keepDrafts(store, "workspace");
    try {
      await controller.select(null);
      const first = controller.draftKey();
      expect(first).toMatch(/^workspace:draft\/[a-f0-9-]{36}$/);
      store.write(first!, { text: "Owned by the first draft" });
      await store.writeAttachment(first!, {
        kind: "png",
        name: "first.png",
        bytes: new Uint8Array([137, 1]).buffer,
      });
      await controller.select(null);
      const second = controller.draftKey();
      expect(second).not.toBe(first);
      expect(store.read(second!)).toBeNull();
      expect(controller.read().attachmentDraft).toBeNull();
      store.write(second!, { text: "Owned by the second draft" });
      await controller.submit("Create from the second draft");
      expect(controller.draftKey()).toBe("workspace:created");
      expect(store.read("workspace:created")).toEqual({
        text: "Owned by the second draft",
      });
      expect(store.read(second!)).toBeNull();
      expect(store.read(first!)).toEqual({ text: "Owned by the first draft" });
      expect(await store.readAttachment(first!)).toMatchObject({
        name: "first.png",
      });
    } finally {
      controller.disconnect();
    }
  });
});

describe("incomplete draft creation settings recovery", () => {
  async function setup() {
    const f = fixture();
    const { ComposerDrafts } = await import("./composer-drafts");
    type Blob = import("./composer-drafts").ComposerDraftBlob;
    const blobs = new Map<string, Blob>();
    const store = new ComposerDrafts(null, {
      get: async (key) => blobs.get(key) ?? null,
      put: async (key, value) => {
        blobs.set(key, value);
      },
      delete: async (key) => {
        blobs.delete(key);
      },
    });
    const create = vi.mocked(f.bridge.createFromDraft!);
    const createNormally = create.getMockImplementation()!;
    create.mockRejectedValueOnce(new Error("native_agent_invalid_response"));
    const updateNormally = f.bridge.updateSelection!;
    const update = vi.fn<NonNullable<DesktopNativeChat["updateSelection"]>>(
      async (...args) => {
        if ("draftId" in args[0])
          throw new Error("native_chat_draft_creation_pending");
        return updateNormally(...args);
      }
    );
    f.bridge.updateSelection = update;
    const controller = f.make();
    controller.keepDrafts(store, "workspace");
    controller.connect(null);
    await ready(controller);
    const key = controller.draftKey()!;
    store.write(key, { text: "Keep this draft" });
    return { ...f, controller, store, key, create, createNormally, update };
  }

  it.each(["model", "effort"] as const)(
    "finishes the same creation before saving a changed %s without sending input",
    async (kind) => {
      const f = await setup();
      try {
        await expect(f.controller.submit("Keep this draft")).rejects.toThrow(
          "native_agent_invalid_response"
        );
        const activations = vi.mocked(f.bridge.selectProfile!).mock.calls
          .length;
        if (kind === "model")
          await f.controller.selectProfile({ kind: "new", id: f.a });
        else f.controller.selectEffort("medium");
        await vi.waitFor(() =>
          expect(f.controller.read().profileBusy).toBe(false)
        );
        expect(f.create).toHaveBeenCalledTimes(2);
        expect(f.create.mock.calls[0]).toEqual(f.create.mock.calls[1]);
        expect(f.update.mock.calls.map((call) => call[0])).toEqual([
          { draftId: f.create.mock.calls[0][0] },
          { sessionId: "created" },
        ]);
        expect(f.update.mock.calls[0][2]).toBe(f.update.mock.calls[1][2]);
        expect(f.defaults()).toEqual({
          profileId: kind === "model" ? f.a : f.b,
          modelId: kind === "model" ? "model-a" : "model-b",
          effort: kind === "model" ? "high" : "medium",
        });
        expect(f.bridge.selectProfile).toHaveBeenCalledTimes(activations);
        expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
        expect(f.bridge.submit).not.toHaveBeenCalled();
        expect(f.controller.read().profileError).toBeNull();
        expect(f.store.read("workspace:created")).toEqual({
          text: "Keep this draft",
        });
        expect(f.store.read(f.key)).toBeNull();
        await f.controller.submit("Keep this draft");
        expect(vi.mocked(f.bridge.submitInRegime!).mock.calls[0][2]).toBe(
          "stable-first-input"
        );
      } finally {
        f.controller.disconnect();
      }
    }
  );

  it("keeps the frozen creation and draft after another unknown creation outcome", async () => {
    const f = await setup();
    try {
      await expect(f.controller.submit("Keep this draft")).rejects.toThrow(
        "native_agent_invalid_response"
      );
      f.create.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
      f.controller.selectEffort("medium");
      await vi.waitFor(() =>
        expect(f.controller.read().profileBusy).toBe(false)
      );
      expect(f.create).toHaveBeenCalledTimes(2);
      expect(f.create.mock.calls[0]).toEqual(f.create.mock.calls[1]);
      expect(f.update).toHaveBeenCalledOnce();
      expect(f.defaults().effort).toBe("high");
      expect(f.store.read(f.key)).toEqual({ text: "Keep this draft" });
      expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
      f.controller.selectEffort("medium");
      await vi.waitFor(() =>
        expect(f.controller.read().profileBusy).toBe(false)
      );
      expect(f.create).toHaveBeenCalledTimes(3);
      expect(f.create.mock.calls[0]).toEqual(f.create.mock.calls[2]);
      expect(f.defaults().effort).toBe("medium");
      expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
    } finally {
      f.controller.disconnect();
    }
  });

  it("does not publish settings after a different chat owns the view during creation recovery", async () => {
    const f = await setup();
    try {
      await expect(f.controller.submit("Keep this draft")).rejects.toThrow(
        "native_agent_invalid_response"
      );
      const pending = Promise.withResolvers<void>();
      f.create.mockImplementationOnce(async (id) => {
        await pending.promise;
        return f.createNormally(id);
      });
      const editing = f.controller.selectProfile({ kind: "new", id: f.a });
      await vi.waitFor(() => expect(f.create).toHaveBeenCalledTimes(2));
      const switching = f.controller.select("chat-a");
      pending.resolve();
      await Promise.all([editing, switching]);
      expect(f.update).toHaveBeenCalledOnce();
      expect(f.defaults().profileId).toBe(f.b);
      expect(f.controller.read().selected).toBe("chat-a");
      expect(f.controller.read().effort).toBe("low");
      expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
    } finally {
      f.controller.disconnect();
    }
  });

  it("keeps the composer bound to its original draft until the destination document has committed", async () => {
    const f = await setup();
    const { ComposerDraftBinding } = await import("./composer-draft-binding");
    const binding = new ComposerDraftBinding();
    binding.restored(f.key);
    let document: unknown = { text: "Keep this draft" };
    const seen: { key: string; document: unknown; destination: unknown }[] = [];
    // Match the composer's switch/restore/write behavior outside a Send.
    const unsubscribe = f.controller.subscribe(() => {
      const draft = f.controller.composerDraft();
      if (!draft) return;
      if (binding.meet(draft.key) === "switch") {
        document = draft.store.read(draft.key) ?? { text: "" };
        binding.restored(draft.key);
      }
      if (binding.held === draft.key) draft.store.write(draft.key, document);
      seen.push({
        key: draft.key,
        document,
        destination: draft.store.read("workspace:created"),
      });
    });
    const selected = Promise.withResolvers<void>();
    const releaseSelection = Promise.withResolvers<void>();
    const moving = Promise.withResolvers<void>();
    const releaseMove = Promise.withResolvers<void>();
    const read = f.bridge.selection!;
    f.bridge.selection = async (target) => {
      if (target.sessionId === "created") {
        selected.resolve();
        await releaseSelection.promise;
      }
      return read(target);
    };
    const move = f.store.move.bind(f.store);
    vi.spyOn(f.store, "move").mockImplementation(async (from, to) => {
      moving.resolve();
      await releaseMove.promise;
      await move(from, to);
    });
    try {
      await expect(f.controller.submit("Keep this draft")).rejects.toThrow(
        "native_agent_invalid_response"
      );
      f.controller.selectEffort("medium");
      await selected.promise;
      expect(f.controller.draftKey()).toBe(f.key);
      releaseSelection.resolve();
      await moving.promise;
      await f.controller.readProfiles();
      expect(f.controller.draftKey()).toBe(f.key);
      expect(seen.every((item) => item.key === f.key)).toBe(true);
      expect(document).toEqual({ text: "Keep this draft" });
      expect(f.store.read("workspace:created")).toBeNull();
      releaseMove.resolve();
      await vi.waitFor(() =>
        expect(f.controller.read().profileBusy).toBe(false)
      );
      expect(f.controller.draftKey()).toBe("workspace:created");
      expect(document).toEqual({ text: "Keep this draft" });
      expect(
        seen
          .filter((item) => item.key === "workspace:created")
          .every(
            (item) =>
              JSON.stringify(item.destination) ===
              JSON.stringify({ text: "Keep this draft" })
          )
      ).toBe(true);
      expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
    } finally {
      releaseSelection.resolve();
      releaseMove.resolve();
      unsubscribe();
      f.controller.disconnect();
    }
  });
});

describe("per-chat permission selection controller", () => {
  function permissions() {
    const f = fixture();
    const modes = new Map<
      string,
      { revision: number; mode: "restricted" | "full_access" }
    >();
    f.bridge.reviewPermissionMode = vi.fn<
      NonNullable<DesktopNativeChat["reviewPermissionMode"]>
    >(async () => ({
      reviewId: "review",
      chatTitle: "Example chat",
      workspaceName: "Example project",
    }));
    f.bridge.acceptsPermissionMode = vi.fn<
      NonNullable<DesktopNativeChat["acceptsPermissionMode"]>
    >(async () => true);
    f.bridge.permissionMode = vi.fn<
      NonNullable<DesktopNativeChat["permissionMode"]>
    >(async (id) => ({
      sessionId: id,
      ...(modes.get(id) ?? { revision: 0, mode: "restricted" as const }),
      available: ["restricted", "full_access"],
    }));
    f.bridge.setPermissionMode = vi.fn<
      NonNullable<DesktopNativeChat["setPermissionMode"]>
    >(async (id, revision, _request, mode) => {
      const next = { revision: revision + 1, mode };
      modes.set(id, next);
      return {
        sessionId: id,
        ...next,
        available: ["restricted", "full_access"],
      };
    });
    return { ...f, modes };
  }

  async function choose(controller: NativeChatController, accepted = true) {
    const changing = controller.selectPermissionMode("full_access");
    await vi.waitFor(() =>
      expect(controller.read().permissionModeReview).not.toBeNull()
    );
    controller.answerPermissionModeReview(accepted);
    await changing;
  }

  it("sends Home's first message through the prepared session's saved route and grant", async () => {
    const f = permissions();
    f.modes.set("chat-b", { revision: 1, mode: "full_access" });
    const controller = f.make();
    const take = vi.fn<() => { text: string } | null>(() => null);
    take.mockReturnValueOnce({ text: "First Home message" });
    try {
      const composer = {
        preparedSessionId: "chat-b",
        operatingRegime: "plan" as const,
      };
      expect(await controller.startChat(f.b, take, composer)).toBeNull();
      expect(await controller.startChat(f.b, take, composer)).toBeNull();
      expect(f.bridge.selectProfile).toHaveBeenCalledWith({
        kind: "saved",
        id: f.b,
      });
      expect(f.bridge.load).toHaveBeenCalledWith("chat-b");
      expect(f.bridge.submitInRegime).toHaveBeenCalledExactlyOnceWith(
        "submit",
        "chat-b",
        expect.any(String),
        "First Home message",
        "plan",
        "high",
        undefined,
        2
      );
      expect(f.bridge.updateSelection).not.toHaveBeenCalled();
      expect(f.bridge.reviewPermissionMode).not.toHaveBeenCalled();
      expect(f.bridge.setPermissionMode).not.toHaveBeenCalled();
      expect(f.bridge.createFromDraft).not.toHaveBeenCalled();
      expect(controller.read().selected).toBe("chat-b");
    } finally {
      controller.disconnect();
    }
  });

  it("sends context with the identity of the prepared Full access chat", async () => {
    const f = permissions();
    f.modes.set("chat-b", { revision: 1, mode: "full_access" });
    const controller = f.make();
    const messageContext = {
      modelText: "Use the attached example as context.",
      displayParts: [
        { kind: "example.reference", version: 1, data: { title: "Sample" } },
      ],
    };
    const submitMessage = vi.fn<
      NonNullable<DesktopNativeChat["submitMessage"]>
    >(async (attachment, input) =>
      f.bridge.submit(attachment, input.inputId, input.text)
    );
    f.bridge.submitMessage = submitMessage;
    try {
      await controller.startChat(f.b, () => ({ text: "", messageContext }), {
        preparedSessionId: "chat-b",
        messageContext,
      });
      expect(submitMessage).toHaveBeenCalledExactlyOnceWith(
        "chat-b",
        expect.objectContaining({
          action: "submit",
          text: "",
          selectionRevision: 2,
          messageContext,
        })
      );
      expect(f.bridge.setPermissionMode).not.toHaveBeenCalled();
      expect(controller.read().draftMessageContext).toBeNull();
    } finally {
      controller.disconnect();
    }
  });

  it.each(["restricted", "busy", "wrong attachment", "wrong profile"] as const)(
    "keeps the message as a draft when the prepared session is %s",
    async (reason) => {
      const f = permissions();
      if (reason !== "restricted")
        f.modes.set("chat-b", { revision: 1, mode: "full_access" });
      if (reason === "wrong attachment")
        vi.mocked(f.bridge.load).mockResolvedValueOnce({
          sessionId: "chat-a",
          attachmentId: "chat-a",
        });
      if (reason === "busy") {
        const observe = f.bridge.observe;
        f.bridge.observe = async (id) => {
          const state = await observe(id);
          return { ...state, snapshot: { ...state.snapshot, queuedInputs: 1 } };
        };
      }
      const controller = f.make();
      const take = vi.fn<() => { text: string }>(() => ({
        text: "Keep this message",
      }));
      try {
        expect(
          await controller.startChat(
            reason === "wrong profile" ? f.a : f.b,
            take,
            {
              preparedSessionId: "chat-b",
            }
          )
        ).toBe("Keep this message");
        expect(take).toHaveBeenCalledOnce();
        expect(f.bridge.submit).not.toHaveBeenCalled();
        expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
        expect(f.bridge.reviewPermissionMode).not.toHaveBeenCalled();
        expect(f.bridge.setPermissionMode).not.toHaveBeenCalled();
        expect(f.bridge.createFromDraft).not.toHaveBeenCalled();
        expect(controller.read().selected).toBe("chat-b");
        expect(controller.read().error).toContain("Full access");
      } finally {
        controller.disconnect();
      }
    }
  );

  it("ignores an old prepared handoff when the selected chat changes", async () => {
    const f = permissions();
    f.modes.set("chat-b", { revision: 1, mode: "full_access" });
    const controller = f.make();
    const pending = Promise.withResolvers<void>();
    const check = vi.mocked(f.bridge.permissionMode!);
    const read = check.getMockImplementation()!;
    check.mockImplementationOnce(async (id) => {
      await pending.promise;
      return read(id);
    });
    const take = vi.fn<() => { text: string }>(() => ({
      text: "Keep waiting",
    }));
    try {
      const start = controller.startChat(f.b, take, {
        preparedSessionId: "chat-b",
      });
      await vi.waitFor(() => expect(check).toHaveBeenCalledOnce());
      expect(controller.canSubmit).toBe(false);
      const switched = controller.select("chat-a");
      pending.resolve();
      await switched;
      expect(await start).toBeNull();
      expect(take).not.toHaveBeenCalled();
      expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
      expect(controller.read().selected).toBe("chat-a");
    } finally {
      pending.resolve();
      controller.disconnect();
    }
  });

  it("opens an exact blank chat without inference before choosing Full access and keeps new chats restricted", async () => {
    const f = permissions();
    const controller = f.make();
    try {
      controller.connect(null);
      await ready(controller);
      await vi.waitFor(() =>
        expect(controller.read().permissionModeAvailable).toBe(true)
      );
      const defaults = structuredClone(f.defaults());
      await choose(controller);
      expect(controller.read().permissionMode?.mode).toBe("full_access");
      expect(f.bridge.createFromDraft).toHaveBeenCalledOnce();
      expect(f.bridge.submit).not.toHaveBeenCalled();
      expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
      expect(f.bridge.updateSelection).not.toHaveBeenCalled();
      expect(f.defaults()).toEqual(defaults);
      await controller.select("chat-a");
      await ready(controller);
      expect(controller.read().permissionMode?.mode).toBe("restricted");
      await controller.select("created");
      await ready(controller);
      expect(controller.read().permissionMode?.mode).toBe("full_access");
      await controller.select(null);
      await ready(controller);
      expect(controller.read().permissionMode).toBeNull();
    } finally {
      controller.disconnect();
    }
  });

  it("retries an unconfirmed exact selection without changing its authority request", async () => {
    const f = permissions();
    const change = vi.mocked(f.bridge.setPermissionMode!);
    const receipt = {
      sessionId: "chat-a",
      revision: 1,
      mode: "full_access" as const,
      available: ["restricted", "full_access"] as const,
    };
    change.mockImplementationOnce(async () => {
      f.modes.set("chat-a", { revision: 1, mode: "full_access" });
      throw new Error("native_agent_request_timeout");
    });
    change.mockResolvedValueOnce(receipt);
    const controller = f.make();
    try {
      controller.connect("chat-a");
      await ready(controller);
      await choose(controller);
      expect(controller.read().permissionModeUncertain).toBe(false);
      await controller.selectPermissionMode("full_access");
      expect(change).toHaveBeenCalledTimes(2);
      expect(change.mock.calls[1]).toEqual(change.mock.calls[0]);
      expect(controller.read().permissionMode?.mode).toBe("full_access");
      expect(controller.read().permissionModeError).toBeNull();
    } finally {
      controller.disconnect();
    }
  });

  it("preserves Default on cancellation and explains busy native work", async () => {
    const f = permissions();
    const change = vi.mocked(f.bridge.setPermissionMode!);
    change.mockResolvedValueOnce(null);
    const controller = f.make();
    try {
      controller.connect("chat-a");
      await ready(controller);
      await choose(controller, false);
      expect(controller.read().permissionMode?.mode).toBe("restricted");
      change.mockRejectedValueOnce(new Error("permission_mode_busy"));
      await choose(controller);
      expect(controller.read().permissionMode?.mode).toBe("restricted");
      expect(controller.read().permissionModeError).toMatch(
        /accepted work and background processes/
      );
    } finally {
      controller.disconnect();
    }
  });

  it("blocks fresh sends after an unknown permission outcome until authoritative access is readable", async () => {
    const f = permissions();
    let lost = false;
    const read = f.bridge.permissionMode!;
    f.bridge.permissionMode = vi.fn<
      NonNullable<DesktopNativeChat["permissionMode"]>
    >(async (id) => {
      if (lost) throw new Error("native_agent_request_timeout");
      return read(id);
    });
    vi.mocked(f.bridge.setPermissionMode!).mockImplementationOnce(async () => {
      f.modes.set("chat-a", { revision: 1, mode: "full_access" });
      lost = true;
      throw new Error("native_agent_request_timeout");
    });
    const controller = f.make();
    try {
      controller.connect("chat-a");
      await ready(controller);
      await choose(controller);
      expect(controller.read().permissionModeUncertain).toBe(true);
      expect(controller.canSubmit).toBe(false);
      await expect(
        controller.submit("Do not send while access is unknown")
      ).rejects.toThrow("not_ready");
      expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
      lost = false;
      await controller.checkPermissionMode();
      expect(controller.read().permissionModeUncertain).toBe(false);
      expect(controller.read().permissionMode?.mode).toBe("full_access");
      expect(controller.canSubmit).toBe(true);
    } finally {
      controller.disconnect();
    }
  });

  it("asks for a fresh confirmation when a previous uncommitted review expired", async () => {
    const f = permissions();
    vi.mocked(f.bridge.setPermissionMode!).mockRejectedValueOnce(
      new Error("native_chat_permission_mode_review_changed")
    );
    const controller = f.make();
    try {
      controller.connect("chat-a");
      await ready(controller);
      await choose(controller);
      expect(controller.read().permissionModeError).toMatch(
        /confirmation expired/
      );
      await choose(controller);
      expect(f.bridge.reviewPermissionMode).toHaveBeenCalledTimes(2);
      expect(controller.read().permissionMode?.mode).toBe("full_access");
    } finally {
      controller.disconnect();
    }
  });

  it("keeps permission selection unavailable on older bridges", async () => {
    const f = fixture();
    const controller = f.make();
    try {
      controller.connect(null);
      await ready(controller);
      await controller.selectPermissionMode("full_access");
      expect(controller.read().permissionModeAvailable).toBe(false);
      expect(f.bridge.createFromDraft).not.toHaveBeenCalled();
    } finally {
      controller.disconnect();
    }
  });
});
