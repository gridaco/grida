import { describe, expect, it, vi } from "vitest";
import type {
  DesktopNativeChat,
  DesktopPersonalizationSettings,
  NativeChatPermissionMode,
  NativeChatSelectionState,
  NativeChatSelectionTarget,
} from "@grida/desktop-bridge";
import { NativeChatController } from "./native-chat-controller";
import { ComposerDrafts, type ComposerDraftBlob } from "./composer-drafts";
import { HomeComposer } from "@/scaffolds/desktop/home/home-composer";
import { WorkspaceOpening } from "@/scaffolds/desktop/workbench/workspace-workbench-url";
import { welcome_message } from "@/lib/desktop/welcome-message";
import type { Workspace } from "@/lib/desktop/bridge";

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
          profileId: choice.profileId,
          effort: choice.effort,
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
          selection: {
            ...defaults,
            ...(choice.speed && { speed: choice.speed }),
          },
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

function enableAutomaticSearch(controller: NativeChatController) {
  return controller.connectPersonalization({
    get: async () => ({
      suggestedPrompts: false,
      webSearch: "live",
      revision: 1,
    }),
    onChange: () => () => {},
  });
}

describe("durable chat selection controller", () => {
  it("carries a Home send through a slow workspace opening without consuming the follow-up draft", async () => {
    const f = fixture();
    const controller = f.make();
    const workspace: Workspace = {
      id: "project",
      name: "Project",
      root: "/project",
      opened_at: 1,
      pinned: false,
    };
    const records = new Map<string, ComposerDraftBlob>();
    const store = new ComposerDrafts(null, {
      get: async (key) => records.get(key) ?? null,
      put: async (key, value) => {
        records.set(key, value);
      },
      delete: async (key) => {
        records.delete(key);
      },
    });
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    };
    const resolveWorkspace = Promise.withResolvers<Workspace>();
    const allowSubmit = Promise.withResolvers<void>();
    const submit = vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
      async (_action, sessionId, inputId) => {
        await allowSubmit.promise;
        return {
          sessionId,
          inputId,
          disposition: "claimed",
          inputPosition: 1,
          turnId: "first-turn",
        };
      }
    );
    f.bridge.submitInRegime = submit;
    const home = new HomeComposer(store);
    const source = home.draftFor("default");
    const first = "Make a poster";
    const second = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Use blue" }] },
      ],
    };
    try {
      expect(
        home.capture(
          {
            text: first,
            prompt: first,
            target: null,
            profileId: f.b,
            references: [],
          },
          {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: first }] },
            ],
          },
          {
            defaultWorkspace: () => resolveWorkspace.promise,
            stash: (id, message) => welcome_message.stash(id, message, storage),
            open: WorkspaceOpening.href,
          },
          { ...source, read: () => store.read(source.key) }
        )
      ).toBe(true);
      expect(home.read().outgoing?.text).toBe(first);
      store.write(source.key, second);
      expect(WorkspaceOpening.peek(workspace.id)).toBeUndefined();

      resolveWorkspace.resolve(workspace);
      await vi.waitFor(() =>
        expect(WorkspaceOpening.peek(workspace.id)).toBe(workspace)
      );
      const handoff = welcome_message.pending(workspace.id, storage)!;
      expect(handoff.peek()?.text).toBe(first);
      expect(submit).not.toHaveBeenCalled();
      controller.keepDrafts(store, workspace.id, {
        sessionId: null,
        home: handoff.message,
      });
      handoff.message.transferNextDraft?.(controller.composerDraft()!);
      const start = controller.startChat(
        handoff.message.profileId,
        handoff.take,
        handoff.message
      );
      await vi.waitFor(() => {
        const view = controller.read();
        expect(
          view.error ?? view.profileError ?? view.outgoing[0]?.error ?? null
        ).toBeNull();
        expect(submit).toHaveBeenCalledOnce();
      });
      expect(controller.read().outgoing).toMatchObject([
        { text: first, status: "sending" },
      ]);
      expect(submit.mock.calls[0]?.slice(0, 4)).toEqual([
        "submit",
        "created",
        "stable-first-input",
        first,
      ]);
      f.bridge.transcript = async () => [
        {
          messageId: "authored",
          inputId: "stable-first-input",
          role: "user",
          text: first,
          turnId: "first-turn",
        },
      ];
      allowSubmit.resolve();
      await start;
      expect(controller.read().messages.map((m) => m.text)).toEqual([first]);
      expect(controller.read().outgoing).toEqual([]);
      expect(store.read(controller.composerDraft()!.key)).toEqual(second);
      expect(store.read(source.key)).toBeNull();
      expect(handoff.waiting()).toBe(false);
      expect(submit).toHaveBeenCalledOnce();
    } finally {
      resolveWorkspace.resolve(workspace);
      allowSubmit.resolve();
      WorkspaceOpening.arrived(workspace);
      controller.disconnect();
    }
  });
  it("recovers the next draft through reloads on both sides of the Home handoff", async () => {
    const f = fixture();
    const entries = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return entries.size;
      },
      key: (i) => [...entries.keys()][i] ?? null,
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => {
        entries.set(key, value);
      },
      removeItem: (key) => {
        entries.delete(key);
      },
      clear: () => entries.clear(),
    };
    const records = new Map<string, ComposerDraftBlob>();
    const store = () =>
      new ComposerDrafts(storage, {
        get: async (key) => records.get(key) ?? null,
        put: async (key, value) => {
          records.set(key, value);
        },
        delete: async (key) => {
          records.delete(key);
        },
      });
    const workspace = "home-project";
    const first = "Build the deck";
    const followup = { nextDraft: "Use blue" };
    welcome_message.stash(workspace, { text: first, profileId: f.b }, storage);
    const handoff = welcome_message.pending(workspace, storage)!;
    const options = { sessionId: null, home: handoff.message };
    const selecting = Promise.withResolvers<void>();
    const selection = vi.mocked(f.bridge.selection!).getMockImplementation()!;
    vi.mocked(f.bridge.selection!).mockImplementationOnce(async (target) => {
      await selecting.promise;
      return selection(target);
    });
    const creating = Promise.withResolvers<void>();
    const create = vi
      .mocked(f.bridge.createFromDraft!)
      .getMockImplementation()!;
    vi.mocked(f.bridge.createFromDraft!).mockImplementationOnce(
      async (...args) => {
        await creating.promise;
        return create(...args);
      }
    );
    const sent = vi.mocked(f.bridge.submitInRegime!);
    const before = f.make();
    const during = f.make();
    const after = f.make();
    try {
      before.keepDrafts(store(), workspace, options);
      const opening = before.startChat(f.b, handoff.take, handoff.message);
      const draft = before.composerDraft()!;
      draft.store.write(draft.key, followup);
      before.disconnect();
      selecting.resolve();
      await opening;
      expect(handoff.waiting()).toBe(true);

      during.keepDrafts(store(), workspace, options);
      expect(
        during.composerDraft()!.store.read(during.composerDraft()!.key)
      ).toEqual(followup);
      const starting = during.startChat(f.b, handoff.take, handoff.message);
      await vi.waitFor(() =>
        expect(f.bridge.createFromDraft).toHaveBeenCalledOnce()
      );
      expect(handoff.waiting()).toBe(false);
      during.disconnect();
      creating.resolve();
      await starting;
      expect(f.bridge.submitInRegime).not.toHaveBeenCalled();

      after.keepDrafts(store(), workspace, { sessionId: null });
      after.connect(null);
      await vi.waitFor(() =>
        expect(after.read().outgoing).toMatchObject([
          { text: first, status: "failed" },
        ])
      );
      expect(
        after.composerDraft()!.store.read(after.composerDraft()!.key)
      ).toEqual(followup);
      after.retryOutgoing(after.read().outgoing[0]!.id);
      await vi.waitFor(() =>
        expect(f.bridge.submitInRegime).toHaveBeenCalledOnce()
      );
      expect(
        vi.mocked(f.bridge.createFromDraft!).mock.calls.map(([id]) => id)
      ).toEqual([handoff.message.requestId, handoff.message.requestId]);
      expect(sent.mock.calls[0]?.slice(0, 4)).toEqual([
        "submit",
        "created",
        "stable-first-input",
        first,
      ]);
      expect(
        after.composerDraft()!.store.read(after.composerDraft()!.key)
      ).toEqual(followup);
    } finally {
      selecting.resolve();
      creating.resolve();
      before.disconnect();
      during.disconnect();
      after.disconnect();
    }
  });
  it("keeps speed on the saved chat and starts a new draft at Standard without Personalization", async () => {
    const f = fixture();
    f.bridge.turnCapabilities = async () => ({
      status: "available",
      speeds: ["fast"],
      webSearch: false,
    });
    const controller = f.make();
    try {
      controller.connect("chat-a");
      await ready(controller);
      await controller.refreshTurnCapabilities();
      expect(controller.read().speed).toBe("standard");
      controller.selectSpeed("fast");
      await vi.waitFor(() => expect(controller.read().speed).toBe("fast"));
      expect(f.states.get("chat-a")?.selection?.speed).toBe("fast");
      await controller.select(null);
      expect(controller.read().speed).toBe("standard");
      await controller.select("chat-a");
      expect(controller.read().speed).toBe("fast");
    } finally {
      controller.disconnect();
    }
  });

  it("offers automatic web search according to Personalization and model availability", async () => {
    const f = fixture();
    const saved = f.states.get("chat-a")!;
    f.states.set("chat-a", {
      ...saved,
      selection: { ...saved.selection!, speed: "fast" },
    });
    let offered = true;
    f.bridge.turnCapabilities = async () => ({
      status: "available",
      speeds: ["fast"],
      webSearch: offered,
    });
    const controller = f.make();
    const initial = {
      webSearch: "live" as const,
      suggestedPrompts: false,
      revision: 1,
    };
    let receive: (next: DesktopPersonalizationSettings) => void = () => {};
    const get = Promise.withResolvers<DesktopPersonalizationSettings>();
    const stop = controller.connectPersonalization({
      get: () => get.promise,
      onChange: (cb) => {
        receive = cb;
        return () => {};
      },
    });
    try {
      controller.connect("chat-a");
      await ready(controller);
      expect(controller.read().webSearch).toBe(false);
      receive({ ...initial, revision: 2 });
      get.resolve({ ...initial, webSearch: "disabled" });
      await vi.waitFor(() => expect(controller.read().webSearch).toBe(true));
      expect(controller.read().speed).toBe("fast");
      await controller.submit("Use the chat");
      const send = vi.mocked(f.bridge.submitInRegime!);
      expect(send.mock.calls[0][10]).toBe(true);
      expect(controller.read().webSearch).toBe(true);
      await controller.submit("Look it up");
      expect(send.mock.calls[1][10]).toBe(true);
      receive({
        ...initial,
        webSearch: "disabled",
        revision: 3,
      });
      expect(controller.read().speed).toBe("fast");
      expect(controller.read().webSearch).toBe(false);
      await controller.submit("No search");
      expect(send.mock.calls[2][10]).toBeUndefined();
      offered = false;
      receive({ ...initial, revision: 4 });
      await controller.refreshTurnCapabilities();
      expect(controller.read().webSearch).toBe(false);
      await controller.submit("No compatible tool");
      expect(send.mock.calls[3][10]).toBeUndefined();
    } finally {
      stop();
      controller.disconnect();
    }
  });

  it("sends ordinary chat if an automatic search offer is lost during preflight", async () => {
    const f = fixture();
    let offered = true;
    f.bridge.turnCapabilities = async () => ({
      status: offered ? "available" : "unavailable",
      speeds: [],
      webSearch: offered,
    });
    const controller = f.make();
    const stop = enableAutomaticSearch(controller);
    try {
      controller.connect("chat-a");
      await ready(controller);
      expect(controller.read().webSearch).toBe(true);
      offered = false;
      await controller.submit("Ordinary fallback");
      const send = vi.mocked(f.bridge.submitInRegime!);
      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][10]).toBeUndefined();
      offered = true;
      await controller.submit("Search after discovery recovers");
      expect(send.mock.calls[1][10]).toBe(true);
    } finally {
      stop();
      controller.disconnect();
    }
  });

  it.each([true, false])(
    "checks the original search receipt after opting out before sending again (accepted: %s)",
    async (accepted) => {
      const f = fixture();
      f.bridge.turnCapabilities = async () => ({
        status: "available",
        speeds: [],
        webSearch: true,
      });
      const send = vi.mocked(f.bridge.submitInRegime!);
      send.mockRejectedValueOnce(new Error("timeout"));
      let receive: (next: DesktopPersonalizationSettings) => void = () => {};
      const prefs = {
        suggestedPrompts: false,
        webSearch: "live",
        revision: 1,
      } as const;
      const controller = f.make();
      const stop = controller.connectPersonalization({
        get: async () => prefs,
        onChange: (cb) => {
          receive = cb;
          return () => {};
        },
      });
      try {
        controller.connect("chat-a");
        await ready(controller);
        await expect(controller.submit("Question")).rejects.toThrow("timeout");
        const [, sessionId, inputId] = send.mock.calls[0];
        receive({ ...prefs, webSearch: "disabled", revision: 2 });
        if (accepted)
          vi.mocked(f.bridge.inputReceipt).mockResolvedValueOnce({
            sessionId,
            inputId,
            disposition: "completed",
            inputPosition: 1,
            turnId: "turn",
          });
        const error = await controller.submit("Question").then(
          () => null,
          (err: Error) => err.message
        );
        expect(error).toBe(
          accepted ? null : "Web search is disabled in Personalization."
        );
        expect(send).toHaveBeenCalledTimes(1);
        await controller.submit("Question");
        expect(send.mock.calls[1][10]).toBeUndefined();
      } finally {
        stop();
        controller.disconnect();
      }
    }
  );

  it("keeps an unavailable speed for the chat until Standard is selected", async () => {
    const f = fixture();
    const saved = f.states.get("chat-a")!;
    f.states.set("chat-a", {
      ...saved,
      selection: { ...saved.selection!, speed: "fast" },
    });
    f.bridge.turnCapabilities = async () => ({
      status: "reauthenticationRequired",
      speeds: [],
      webSearch: false,
    });
    const controller = f.make();
    try {
      controller.connect("chat-a");
      await ready(controller);
      expect(controller.read().speed).toBe("fast");
      expect(controller.turnOptionsError).toContain("Sign in");
      expect(controller.canSubmit).toBe(false);
      controller.selectSpeed("standard");
      await vi.waitFor(() => expect(controller.canSubmit).toBe(true));
      expect(f.bridge.updateSelection).toHaveBeenCalledWith(
        { sessionId: "chat-a" },
        1,
        expect.any(String),
        { profileId: f.a, effort: "low", speed: "standard" }
      );
      expect(controller.read().speed).toBe("standard");
    } finally {
      controller.disconnect();
    }
  });

  it("uses the new model’s search offer immediately after switching models", async () => {
    const f = fixture();
    f.bridge.turnCapabilities = async () => ({
      status: "available",
      speeds: [],
      webSearch: f.states.get("chat-a")?.selection?.profileId === f.b,
    });
    const controller = f.make();
    const stop = enableAutomaticSearch(controller);
    try {
      controller.connect("chat-a");
      await ready(controller);
      expect(controller.read().webSearch).toBe(false);
      await controller.selectProfile({ kind: "new", id: f.b });
      await vi.waitFor(() => expect(controller.read().webSearch).toBe(true));
      expect(controller.turnOptionsError).toBeNull();
      expect(controller.canSubmit).toBe(true);
    } finally {
      stop();
      controller.disconnect();
    }
  });

  it("resumes ordinary chat when search is unavailable after an unconfirmed send is found absent", async () => {
    const f = fixture();
    let available = true;
    f.bridge.turnCapabilities = async () => ({
      status: available ? "available" : "unsupported",
      speeds: [],
      webSearch: available,
    });
    const send = vi.mocked(f.bridge.submitInRegime!);
    send.mockRejectedValueOnce(new Error("timeout"));
    const controller = f.make();
    const stop = enableAutomaticSearch(controller);
    try {
      controller.connect("chat-a");
      await ready(controller);
      await expect(controller.submit("Forecast")).rejects.toThrow("timeout");
      available = false;
      await expect(controller.submit("Forecast")).rejects.toThrow(
        "Web search is unavailable"
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect(controller.read().webSearch).toBe(false);
      await controller.submit("Forecast");
      expect(send.mock.calls[1][10]).toBeUndefined();
    } finally {
      stop();
      controller.disconnect();
    }
  });

  it("reconciles a search-enabled send before accepting another message", async () => {
    const f = fixture();
    f.bridge.turnCapabilities = async () => ({
      status: "available",
      speeds: ["fast"],
      webSearch: true,
    });
    const send = vi.mocked(f.bridge.submitInRegime!);
    send.mockRejectedValueOnce(new Error("timeout"));
    const controller = f.make();
    const stop = enableAutomaticSearch(controller);
    try {
      controller.connect("chat-a");
      await ready(controller);
      await expect(controller.submit("Search again")).rejects.toThrow(
        "timeout"
      );
      const [, sessionId, inputId] = send.mock.calls[0];
      expect(send.mock.calls[0][10]).toBe(true);
      vi.mocked(f.bridge.inputReceipt).mockResolvedValueOnce({
        sessionId,
        inputId,
        disposition: "claimed",
        inputPosition: 1,
        turnId: "turn-a",
      });
      await controller.submit("Search again");
      expect(send).toHaveBeenCalledTimes(1);
      await controller.submit("Continue");
      expect(send.mock.calls[1][10]).toBe(true);
    } finally {
      stop();
      controller.disconnect();
    }
  });

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

  it("queues the new model revision while observing the same running turn", async () => {
    const f = fixture();
    const catalog = await f.bridge.profiles!();
    f.bridge.profiles = async () => ({ ...catalog!, inputRoutes: true });
    const observe = f.bridge.observe;
    f.bridge.observe = async (id) => {
      const value = await observe(id);
      return {
        ...value,
        snapshot: {
          ...value.snapshot,
          current: {
            turnId: "running-on-a",
            epoch: 1,
            journalPosition: 1,
            historyPosition: 1,
            controlRevision: 1,
            paused: false,
            cancelled: false,
            disposition: "running",
            status: null,
          },
        },
      };
    };
    const controller = f.make();
    try {
      controller.connect("chat-a");
      await ready(controller);
      const scope = controller.read().scope;
      await controller.selectProfile({ kind: "new", id: f.b });
      await controller.submit("Next task");
      expect(f.bridge.submitInRegime).toHaveBeenCalledExactlyOnceWith(
        "enqueue",
        "chat-a",
        expect.any(String),
        "Next task",
        "act",
        "low",
        undefined,
        2
      );
      expect(controller.read().scope).toBe(scope);
      expect(controller.read().observation?.snapshot.current?.turnId).toBe(
        "running-on-a"
      );
      expect(f.bridge.selectProfile).not.toHaveBeenCalled();
    } finally {
      controller.disconnect();
    }
  });

  it("keeps the saved future choice when an older host blocks activation", async () => {
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

  it("resends the same draft on another connection after a confirmed admission refusal", async () => {
    const f = fixture();
    const catalog = (await f.bridge.profiles!())!;
    f.bridge.profiles = async () => ({ ...catalog, inputRoutes: true });
    const send = vi.mocked(f.bridge.submitInRegime!);
    send.mockRejectedValueOnce(new Error("chat_selection_route_unavailable"));
    const controller = f.make();
    try {
      controller.connect("chat-a");
      await ready(controller);
      await controller.selectProfile({ kind: "new", id: f.b });
      await expect(controller.submit("Try this")).rejects.toThrow(
        "route_unavailable"
      );
      expect(controller.read().error).toContain("choose another connection");
      await controller.selectProfile({ kind: "new", id: f.a });
      await controller.submit("Try this");
      const [refused, accepted] = send.mock.calls;
      expect([refused[7], accepted[7]]).toEqual([2, 3]);
      expect(accepted[2]).not.toBe(refused[2]);
    } finally {
      controller.disconnect();
    }
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

  it.each(["first request", "/compact"])(
    "keeps %s on Home when the handoff cannot be retired",
    async (text) => {
      const f = fixture();
      const controller = f.make();
      const release = vi.fn<() => void>();
      const input = {
        requestId: crypto.randomUUID(),
        text,
        commit: () => {
          throw new Error("Home handoff is still pending");
        },
        release,
      };
      try {
        await controller.startChat(f.b, () => input);
        expect(release).toHaveBeenCalledOnce();
        expect(f.bridge.createFromDraft).not.toHaveBeenCalled();
        expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
        expect(f.bridge.submit).not.toHaveBeenCalled();
      } finally {
        controller.disconnect();
      }
    }
  );

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

  it.each([
    { speed: "standard", searchAvailable: true },
    { speed: "standard", searchAvailable: false },
    { speed: "fast", searchAvailable: true },
  ] as const)(
    "sends Home's first message at $speed with automatic search (available: $searchAvailable)",
    async ({ speed, searchAvailable }) => {
      const f = fixture();
      f.bridge.turnCapabilities = async () => ({
        status: searchAvailable ? "available" : "unsupported",
        speeds: searchAvailable ? ["fast"] : [],
        webSearch: searchAvailable,
      });
      const controller = f.make();
      const stop = enableAutomaticSearch(controller);
      try {
        const options =
          speed === "fast"
            ? { turnOptions: { profileId: f.b, modelId: "model-b", speed } }
            : undefined;
        const text = "Find sources";
        expect(
          await controller.startChat(f.b, () => ({ text }), options)
        ).toBeNull();
        expect(f.states.get("created")?.selection?.speed ?? "standard").toBe(
          speed
        );
        const send = vi.mocked(f.bridge.submitInRegime!);
        expect(send).toHaveBeenCalledOnce();
        expect(send.mock.calls[0][3]).toBe(text);
        expect(send.mock.calls[0][10]).toBe(searchAvailable || undefined);
      } finally {
        stop();
        controller.disconnect();
      }
    }
  );

  it("does not use a different speed after Home's draft becomes a chat", async () => {
    const f = fixture();
    const profiles = (await f.bridge.profiles!())!;
    f.bridge.profiles = async () => ({ ...profiles, inputRoutes: true });
    f.bridge.turnCapabilities = async () => ({
      status: "available",
      speeds: ["fast"],
      webSearch: true,
    });
    const create = f.bridge.createFromDraft!;
    f.bridge.createFromDraft = async (...args) => {
      const chat = await create(...args);
      const state = f.states.get(chat.sessionId)!;
      f.states.set(chat.sessionId, {
        ...state,
        revision: state.revision + 1,
        selection: { ...state.selection!, speed: "standard" },
      });
      return chat;
    };
    const controller = f.make();
    try {
      expect(
        await controller.startChat(f.b, () => ({ text: "Keep this request" }), {
          turnOptions: { profileId: f.b, modelId: "model-b", speed: "fast" },
        })
      ).toBe("Keep this request");
      expect(controller.read().error).toContain("speed selected on Home");
      expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
    } finally {
      controller.disconnect();
    }
  });

  it.each(["connection changed", "search disabled"] as const)(
    "keeps a previously staged search request from Home as a draft when the %s",
    async (reason) => {
      const f = fixture();
      f.bridge.turnCapabilities = async () => ({
        status: "available",
        speeds: ["fast"],
        webSearch: true,
      });
      const controller = f.make();
      const stop =
        reason === "connection changed"
          ? enableAutomaticSearch(controller)
          : controller.connectPersonalization({
              get: async () => ({
                suggestedPrompts: false,
                webSearch: "disabled",
                revision: 1,
              }),
              onChange: () => () => {},
            });
      try {
        expect(
          await controller.startChat(f.b, () => ({ text: "Find sources" }), {
            turnOptions: {
              profileId: f.b,
              modelId:
                reason === "connection changed"
                  ? "formerly-model-b"
                  : "model-b",
              speed: "fast",
              webSearch: true,
            },
          })
        ).toBe("Find sources");
        expect(controller.read().error).toContain(
          reason === "connection changed"
            ? "model connection changed"
            : "Web search selected on Home is unavailable"
        );
        expect(f.bridge.updateSelection).not.toHaveBeenCalled();
        expect(f.bridge.submitInRegime).not.toHaveBeenCalled();
        await controller.submit("Find sources");
        const send = vi.mocked(f.bridge.submitInRegime!);
        expect(send).toHaveBeenCalledOnce();
        expect(send.mock.calls[0][10]).toBe(
          reason === "search disabled" ? undefined : true
        );
      } finally {
        stop();
        controller.disconnect();
      }
    }
  );

  it.each([
    { inputRoutes: false, supported: false },
    { inputRoutes: false, supported: true },
    { inputRoutes: true, supported: false },
    { inputRoutes: true, supported: true },
  ])(
    "validates Goal funding on the selected connection (inputRoutes: $inputRoutes, funded: $supported)",
    async ({ inputRoutes, supported }) => {
      const f = fixture();
      if (inputRoutes) {
        const catalog = (await f.bridge.profiles!())!;
        f.bridge.profiles = async () => ({
          ...catalog,
          inputRoutes: true,
          choices: catalog.choices.map((choice) => ({
            ...choice,
            ...((choice.id === f.b ? supported : !supported) && {
              goalSpending: true as const,
            }),
          })),
        });
      }
      const observe = f.bridge.observe;
      f.bridge.observe = async (id) => {
        const observation = await observe(id);
        const selected = (await f.bridge.profiles!())!.active === f.b;
        const available = inputRoutes || (selected ? supported : !supported);
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
        return inputRoutes || (selected ? supported : !supported);
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
        expect(vi.mocked(f.bridge.selectProfile!).mock.calls).toEqual(
          inputRoutes ? [] : [[{ kind: "new", id: f.b }]]
        );
        expect(f.bridge.startGoal).toHaveBeenCalledTimes(Number(supported));
        expect(controller.read().goalEffortAvailable).toBe(
          inputRoutes || supported
        );
        expect(
          !!controller.read().observation?.snapshot.goalSpendingAvailable
        ).toBe(inputRoutes || supported);
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
      const meeting = binding.meet(draft.key, draft.promotedFrom);
      if (meeting !== "held") {
        const saved = draft.store.read(draft.key);
        if (
          meeting === "switch" ||
          JSON.stringify(saved) !== JSON.stringify(document)
        )
          document = saved ?? { text: "" };
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
      expect(f.controller.composerDraft()?.promotedFrom).toBe(f.key);
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
  function permissions(
    available: readonly NativeChatPermissionMode[] = [
      "restricted",
      "full_access",
    ]
  ) {
    const f = fixture();
    const modes = new Map<
      string,
      { revision: number; mode: NativeChatPermissionMode }
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
      available,
    }));
    f.bridge.setPermissionMode = vi.fn<
      NonNullable<DesktopNativeChat["setPermissionMode"]>
    >(async (id, revision, _request, mode) => {
      const next = { revision: revision + 1, mode };
      modes.set(id, next);
      return {
        sessionId: id,
        ...next,
        available,
      };
    });
    return { ...f, modes };
  }

  function automaticDefaults() {
    const f = permissions(["restricted", "approve_for_me", "full_access"]);
    Object.assign(f.bridge, { defaultsToAutomaticReview: true });
    f.bridge.acceptsAutomaticApprovalReview = async () => true;
    const create = f.bridge.createFromDraft!;
    f.bridge.createFromDraft = vi.fn<typeof create>(async (id, manual) => {
      const result = await create(id);
      if (!manual)
        f.modes.set(result.sessionId, { revision: 1, mode: "approve_for_me" });
      return result;
    });
    return f;
  }

  it("opens existing manual chats as Ask for approval and starts new workspace chats in Auto", async () => {
    const f = automaticDefaults();
    f.modes.set("chat-a", { revision: 2, mode: "restricted" });
    const controller = f.make();
    try {
      controller.connect("chat-a");
      await ready(controller);
      expect(controller.composerPermissionMode).toBe("restricted");
      await controller.select(null);
      await vi.waitFor(() =>
        expect(controller.composerPermissionMode).toBe("approve_for_me")
      );
      await controller.submit("First workspace message");
      expect(f.bridge.createFromDraft).toHaveBeenCalledExactlyOnceWith(
        expect.any(String)
      );
      expect(controller.composerPermissionMode).toBe("approve_for_me");
      expect(f.modes.get("chat-a")).toEqual({
        revision: 2,
        mode: "restricted",
      });
    } finally {
      controller.disconnect();
    }
  });

  it("requests Ask for approval when creating a Home chat with that choice", async () => {
    const f = automaticDefaults();
    const controller = f.make();
    try {
      expect(
        await controller.startChat(
          f.b,
          () => ({ text: "First Home message" }),
          {
            manualApproval: true,
          }
        )
      ).toBeNull();
      expect(f.bridge.createFromDraft).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        true
      );
      expect(f.bridge.submitInRegime).toHaveBeenCalledOnce();
      expect(controller.composerPermissionMode).toBe("restricted");
    } finally {
      controller.disconnect();
    }
  });

  it("requests Ask for approval before opening a workspace draft", async () => {
    const f = automaticDefaults();
    const controller = f.make();
    try {
      controller.connect(null);
      await vi.waitFor(() =>
        expect(controller.composerPermissionMode).toBe("approve_for_me")
      );
      await controller.selectPermissionMode("restricted");
      expect(f.bridge.createFromDraft).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        true
      );
      expect(f.bridge.setPermissionMode).not.toHaveBeenCalled();
      expect(controller.composerPermissionMode).toBe("restricted");
    } finally {
      controller.disconnect();
    }
  });

  async function choose(controller: NativeChatController, accepted = true) {
    const changing = controller.selectPermissionMode("full_access");
    await vi.waitFor(() =>
      expect(controller.read().permissionModeReview).not.toBeNull()
    );
    controller.answerPermissionModeReview(accepted);
    await changing;
  }

  it.each(["approve_for_me", "full_access"] as const)(
    "sends Home's first message through the prepared session's saved route and %s grant",
    async (mode) => {
      const f = permissions(["restricted", "approve_for_me", "full_access"]);
      f.modes.set("chat-b", { revision: 1, mode });
      const prepared = f.states.get("chat-b")!;
      f.states.set("chat-b", {
        ...prepared,
        selection: { ...prepared.selection!, speed: "fast" },
      });
      f.bridge.turnCapabilities = async () => ({
        status: "available",
        speeds: ["fast"],
        webSearch: true,
      });
      const controller = f.make();
      const stop = enableAutomaticSearch(controller);
      const take = vi.fn<() => { text: string } | null>(() => null);
      take.mockReturnValueOnce({ text: "First Home message" });
      try {
        const composer = {
          preparedSessionId: "chat-b",
          ...(mode === "approve_for_me" && { preparedMode: mode }),
          operatingRegime: "plan" as const,
          turnOptions: {
            profileId: f.b,
            modelId: "model-b",
            speed: "fast" as const,
            webSearch: true as const,
          },
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
          2,
          undefined,
          undefined,
          true
        );
        expect(f.bridge.updateSelection).not.toHaveBeenCalled();
        expect(f.bridge.reviewPermissionMode).not.toHaveBeenCalled();
        expect(f.bridge.setPermissionMode).not.toHaveBeenCalled();
        expect(f.bridge.createFromDraft).not.toHaveBeenCalled();
        expect(controller.read().selected).toBe("chat-b");
      } finally {
        stop();
        controller.disconnect();
      }
    }
  );

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
        expect(controller.read().error).toContain("chat’s access");
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

  it.each([false, true])(
    "uses the installed host’s automatic review support (%s) for an empty workspace chat",
    async (supported) => {
      const f = permissions();
      f.bridge.acceptsAutomaticApprovalReview = vi.fn<
        NonNullable<DesktopNativeChat["acceptsAutomaticApprovalReview"]>
      >(async () => supported);
      const controller = f.make();
      try {
        controller.connect(null);
        await ready(controller);
        await vi.waitFor(() =>
          expect(controller.read().permissionModeAvailable).toBe(true)
        );
        expect(controller.read().draftAutomaticReviewAvailable).toBe(supported);
        expect(f.bridge.createFromDraft).not.toHaveBeenCalled();
      } finally {
        controller.disconnect();
      }
    }
  );

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
        /couldn't change access/
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
