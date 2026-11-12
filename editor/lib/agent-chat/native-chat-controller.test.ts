import { describe, expect, it, vi } from "vitest";
import type {
  NativeChatProfileSelection,
  DesktopNativeChat,
  NativeChatCommand,
  NativeChatCommandResult,
  NativeChatGatewayBillingAttempt,
  NativeChatCatalogEntry,
  NativeChatGoal,
  NativeChatMessage,
  NativeChatObservation,
  NativeChatPage,
  NativeChatRevisionInput,
  NativeChatRevisionReceipt,
  NativeChatTranscriptPage,
  NativeChatTurn,
  NativeChatTurnSummary,
  NativeChatUpdate,
  NativeChatWakeup,
  NativeEditorSurfaceOpen,
  NativeEditorSurfaceSnapshot,
} from "@grida/desktop-bridge";
import { NativeChatController } from "./native-chat-controller";
import {
  ComposerDrafts,
  type ComposerDraftAttachment,
} from "./composer-drafts";

function fixture() {
  const updates = new Map<string, (update: NativeChatUpdate) => void>();
  const transcripts = new Map<string, readonly NativeChatMessage[]>();
  const running = new Set<string>();
  const waiting = new Set<string>();
  const observed = (id: string): NativeChatObservation => ({
    observationId: `observation-${id}`,
    snapshot: {
      sessionId: id,
      sessionRevision: 2,
      queuedInputs: 0,
      admissionPaused: false,
      current:
        running.has(id) || waiting.has(id)
          ? {
              turnId: `turn-${id}`,
              epoch: 1,
              journalPosition: 1,
              historyPosition: 1,
              controlRevision: 1,
              paused: false,
              cancelled: false,
              disposition: waiting.has(id) ? "suspended" : "running",
              status: null,
            }
          : null,
      latest: null,
    },
  });
  const bridge: DesktopNativeChat = {
    async available() {
      return true;
    },
    async list() {
      return { sessionIds: [], nextCursor: null };
    },
    async create() {
      return this.load("new");
    },
    async load(id) {
      return { attachmentId: id, sessionId: id };
    },
    async detach(id) {
      updates.delete(id);
    },
    async submit(id, inputId) {
      return {
        sessionId: id,
        inputId,
        disposition: "claimed",
        inputPosition: 1,
        turnId: `turn-${id}`,
      };
    },
    async inputReceipt() {
      throw new Error("input_missing");
    },
    async observe(id) {
      return observed(id);
    },
    async transcript(id) {
      return transcripts.get(id) ?? [];
    },
    async control(id, input) {
      if (input.action === "resume") throw new Error("fixture only");
      return {
        action: input.action,
        receipt: {
          sessionId: id,
          turnId: `turn-${id}`,
          requestId: input.requestId,
          sessionRevision: 2,
          journalPosition: 1,
        },
      };
    },
    async subscribe(id, listener) {
      updates.set(id, listener);
      return id;
    },
    async unsubscribe(id) {
      updates.delete(id);
    },
  };
  return {
    bridge,
    updates,
    transcripts,
    running,
    waiting,
    controller: new NativeChatController(bridge),
  };
}

it("offers explicit connections before a failed default can open chat or history", async () => {
  const { bridge, controller } = fixture();
  const id = "c".repeat(64);
  const profiles = vi.fn<NonNullable<DesktopNativeChat["profiles"]>>(
    async () => ({
      active: null,
      saved: [],
      choices: [{ id, connection: "Fixture provider", model: "Fixture" }],
    })
  );
  const create = vi.fn<DesktopNativeChat["create"]>(bridge.create.bind(bridge));
  const load = vi.fn<DesktopNativeChat["load"]>(bridge.load.bind(bridge));
  const list = vi.fn<DesktopNativeChat["list"]>(bridge.list.bind(bridge));
  const choose = vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
    async () => {}
  );
  bridge.profiles = profiles;
  bridge.create = create;
  bridge.load = load;
  bridge.list = list;
  bridge.selectProfile = choose;
  try {
    controller.connectForSelection();
    await vi.waitFor(() =>
      expect(controller.read().profiles?.choices).toHaveLength(1)
    );
    expect(choose).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    choose.mockRejectedValueOnce(new Error("fixture unavailable"));
    expect(await controller.selectConnection({ kind: "new", id })).toBe(false);
    expect(controller.read().profileError).toContain("unavailable");
    expect(await controller.selectConnection({ kind: "new", id })).toBe(true);
    expect(choose).toHaveBeenLastCalledWith({ kind: "new", id });
    expect(create).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  } finally {
    controller.disconnect();
  }
});

it("ignores late connection recovery after the pane closes", async () => {
  const { bridge, controller } = fixture();
  const pending = Promise.withResolvers<void>();
  bridge.selectProfile = async () => pending.promise;
  controller.connectForSelection();
  const selecting = controller.selectConnection({
    kind: "saved",
    id: "b".repeat(64),
  });
  controller.disconnect();
  controller.connectForSelection();
  pending.resolve();
  expect(await selecting).toBe(false);
  expect(controller.read().profileBusy).toBe(false);
  controller.disconnect();
});

it.each([false, true])(
  "activates a recovered profile, then reopens the workspace chat (new connection: %s)",
  async (startNewChat) => {
    const { bridge } = fixture();
    const memory = {
      getItem: (key: string) =>
        key === "project"
          ? JSON.stringify({
              selected: "old-default",
              sessions: ["old-default"],
            })
          : null,
      setItem: () => {},
    };
    const controller = new NativeChatController(bridge, memory, "project");
    const choose = vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
      async () => {}
    );
    const load = vi.fn<DesktopNativeChat["load"]>(bridge.load.bind(bridge));
    bridge.selectProfile = choose;
    bridge.load = load;
    const id = "d".repeat(64);
    try {
      controller.connect(null, id, startNewChat);
      await vi.waitFor(() =>
        expect(controller.read().scope).toBeGreaterThan(0)
      );
      expect(choose).toHaveBeenCalledExactlyOnceWith({
        kind: startNewChat ? "new" : "saved",
        id,
      });
      // Chats belong to the workspace, so the remembered chat reopens under
      // the chosen connection only after that connection is active.
      expect(controller.read().selected).toBe("old-default");
      expect(choose.mock.invocationCallOrder[0]).toBeLessThan(
        load.mock.invocationCallOrder[0] ?? Infinity
      );
    } finally {
      controller.disconnect();
    }
  }
);

it("inspects the current chat's hooks and removes only an observed saved revision", async () => {
  const f = fixture();
  const hook = {
    id: "check",
    source: "user-selected:check.json",
    event: "before_tool",
    enabled: true,
    mode: "required",
    executable: "/usr/bin/printf",
    arguments: [],
    timeoutMs: 1000,
    revision: "a".repeat(64),
  } as const;
  const inspection = {
    supportedEvents: ["before_tool"],
    active: [],
    saved: [hook],
    activation: "restart_required",
  } as const;
  const inspect = vi.fn<NonNullable<DesktopNativeChat["inspectHooks"]>>(
    async () => inspection
  );
  const remove = vi.fn<NonNullable<DesktopNativeChat["removeHook"]>>(
    async () => ({ ...inspection, saved: [] })
  );
  f.bridge.inspectHooks = inspect;
  f.bridge.importHook = async () => null;
  f.bridge.removeHook = remove;
  try {
    await f.controller.select("chat");
    await f.controller.toggleHooks();
    expect(inspect).toHaveBeenCalledWith("chat");
    await f.controller.removeHook(hook.id, "stale");
    expect(remove).not.toHaveBeenCalled();
    await f.controller.removeHook(hook.id, hook.revision);
    expect(remove).toHaveBeenCalledWith(hook.id, hook.revision);
    expect(f.controller.read().hooks?.saved).toEqual([]);
  } finally {
    f.controller.disconnect();
  }
});

it("ignores a hook inspection from a chat that has been replaced", async () => {
  const f = fixture();
  const pending =
    Promise.withResolvers<
      import("@grida/desktop-bridge").NativeHookInspection
    >();
  f.bridge.inspectHooks = async () => pending.promise;
  f.bridge.importHook = async () => null;
  f.bridge.removeHook = async () => pending.promise;
  try {
    await f.controller.select("first");
    const read = f.controller.toggleHooks();
    await f.controller.select("second");
    pending.resolve({
      supportedEvents: [],
      active: [],
      saved: [],
      activation: "current",
    });
    await read;
    expect(f.controller.read()).toMatchObject({
      hooksOpen: false,
      hooks: null,
      hooksBusy: false,
    });
  } finally {
    f.controller.disconnect();
  }
});

it("sends an exact dollar cap only when the attached Goal advertises enforcement", async () => {
  for (const supported of [false, true]) {
    const f = fixture();
    const observe = f.bridge.observe.bind(f.bridge);
    f.bridge.observe = async (id) => {
      const value = await observe(id);
      return {
        ...value,
        snapshot: {
          ...value.snapshot,
          ...(supported && { goalSpendingAvailable: true as const }),
        },
      };
    };
    f.bridge.goal = async () => ({ observationId: null, goal: null });
    const start = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>(
      async (sessionId, inputId) => ({
        sessionId,
        inputId,
        disposition: "claimed",
        inputPosition: 1,
        turnId: "goal-work",
      })
    );
    f.bridge.startGoal = start;
    try {
      await f.controller.select("chat");
      const request = {
        objective: "Inspect the file",
        criteria: ["Read the original"],
        allowance: { workTurns: 1, inferenceSteps: 8 },
        automatic: false,
      };
      expect(await f.controller.startGoal(request, "0.001001")).toBe(supported);
      expect(start).toHaveBeenCalledTimes(Number(supported));
      expect(start.mock.calls[0]?.[0]).toBe(supported ? "chat" : undefined);
      expect(start.mock.calls[0]?.[2].maxCostMills).toBe(
        supported ? "1.001" : undefined
      );
    } finally {
      f.controller.disconnect();
    }
  }
});

it("offers recovery for an unpaused saved queue only when Main advertises it", async () => {
  const { bridge, controller } = fixture();
  const observe = bridge.observe.bind(bridge);
  bridge.observe = async (id) => {
    const result = await observe(id);
    return {
      ...result,
      snapshot: {
        ...result.snapshot,
        queuedInputs: 1,
        admissionPaused: id === "held-by-older-main",
        ...(id === "idle-on-new-main" && {
          idleQueueResumeAvailable: true as const,
        }),
      },
    };
  };
  const editQueue = vi.fn<NonNullable<DesktopNativeChat["editQueue"]>>();
  bridge.editQueue = editQueue;
  try {
    await controller.select("idle-on-older-main");
    expect(controller.canResumeQueue).toBe(false);
    await controller.select("held-by-older-main");
    expect(controller.canResumeQueue).toBe(true);
    await controller.select("idle-on-new-main");
    expect(controller.canResumeQueue).toBe(true);
    expect(editQueue).not.toHaveBeenCalled();

    await controller.editQueue({ action: "resume" });
    expect(editQueue).toHaveBeenCalledExactlyOnceWith(
      "idle-on-new-main",
      expect.objectContaining({
        action: "resume",
        observationId: "observation-idle-on-new-main",
        requestId: expect.any(String),
      })
    );
  } finally {
    controller.disconnect();
  }
});

it("prepends earlier pages to one transcript and ignores a page from a previous chat", async () => {
  const { bridge, controller } = fixture();
  const page = (
    text: string,
    older: string | null
  ): NativeChatTranscriptPage => ({
    view: 1,
    messages: [{ messageId: text, role: "assistant", text }],
    older,
  });
  const delayed = Promise.withResolvers<NativeChatTranscriptPage>();
  const read = vi.fn<NonNullable<DesktopNativeChat["transcriptPage"]>>();
  read.mockResolvedValueOnce(page("latest-a", "older-a"));
  read.mockResolvedValueOnce(page("earlier-a", "oldest-a"));
  read.mockReturnValueOnce(delayed.promise);
  read.mockResolvedValueOnce(page("latest-b", null));
  bridge.transcriptPage = read;
  await controller.select("chat-a");
  expect(controller.read()).toMatchObject({
    messages: [{ text: "latest-a" }],
    canReadEarlier: true,
  });
  await controller.loadEarlierMessages();
  expect(read).toHaveBeenNthCalledWith(2, "chat-a", "older-a");
  // The older page joins above the latest messages; nothing is swapped out.
  expect(controller.read()).toMatchObject({
    messages: [{ text: "earlier-a" }, { text: "latest-a" }],
    canReadEarlier: true,
  });
  const waiting = controller.loadEarlierMessages();
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3));
  expect(read).toHaveBeenNthCalledWith(3, "chat-a", "oldest-a");
  await controller.select("chat-b");
  delayed.resolve(page("late-a", "other-a"));
  await waiting;
  expect(controller.read()).toMatchObject({
    messages: [{ text: "latest-b" }],
    canReadEarlier: false,
    readingEarlier: false,
  });
  controller.disconnect();
});

it("streams turn activity live and adopts recorded turns from each page", async () => {
  const { bridge, controller, running, updates } = fixture();
  running.add("chat-a");
  const call = (outcome: "running" | "succeeded") =>
    ({
      callId: "call-1",
      title: "read_file",
      kind: "read",
      outcome,
    }) as const;
  const latest: NativeChatTranscriptPage = {
    view: 1,
    older: "older-a",
    messages: [],
    turns: [],
  };
  const earlier: NativeChatTranscriptPage = {
    view: 1,
    older: null,
    messages: [
      {
        messageId: "old",
        role: "assistant",
        text: "Earlier",
        turnId: "t0",
        phase: "answer",
      },
    ],
    turns: [
      { turnId: "t0", status: "succeeded", startedAtMs: 1, settledAtMs: 2 },
    ],
  };
  const read = vi.fn<NonNullable<DesktopNativeChat["transcriptPage"]>>();
  read.mockResolvedValueOnce(latest).mockResolvedValueOnce(earlier);
  read.mockResolvedValue(latest);
  bridge.transcriptPage = read;
  await controller.select("chat-a");
  const live = updates.get("chat-a")!;
  live({
    kind: "activity",
    messageId: "work",
    turnId: "turn-chat-a",
    activity: call("running"),
  });
  live({
    kind: "text",
    role: "assistant",
    messageId: "work",
    turnId: "turn-chat-a",
    text: "Reading the note.",
    offsetBytes: 0,
    replace: true,
  });
  live({
    kind: "activity",
    messageId: "work",
    turnId: "turn-chat-a",
    activity: call("succeeded"),
  });
  // A call from another turn is not attached to the current transcript.
  live({
    kind: "activity",
    messageId: "stale",
    turnId: "turn-other",
    activity: call("succeeded"),
  });
  expect(controller.read().messages).toEqual([
    {
      messageId: "work",
      role: "assistant",
      text: "Reading the note.",
      turnId: "turn-chat-a",
      bytes: expect.any(Number),
      activity: [call("succeeded")],
    },
  ]);
  await controller.loadEarlierMessages();
  expect(controller.read().turnRecords).toEqual(earlier.turns);
  expect(controller.read().messages.map(({ messageId }) => messageId)).toEqual([
    "old",
    "work",
  ]);
  controller.disconnect();
});

it("keeps an earlier page above latest messages that settle during its read", async () => {
  vi.useFakeTimers();
  const { bridge, controller, running } = fixture();
  running.add("chat-a");
  const earlier = Promise.withResolvers<NativeChatTranscriptPage>();
  const prior = message("prior", "Before settlement");
  const settled = message("settled", "Settled result");
  const older = message("older", "Earlier transcript");
  const read = vi.fn<NonNullable<DesktopNativeChat["transcriptPage"]>>();
  read.mockResolvedValueOnce({ view: 1, messages: [prior], older: "older-a" });
  read.mockReturnValueOnce(earlier.promise);
  read.mockResolvedValueOnce({
    view: 1,
    messages: [settled],
    older: "older-a",
  });
  bridge.transcriptPage = read;
  try {
    await controller.select("chat-a");
    const loading = controller.loadEarlierMessages();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenNthCalledWith(2, "chat-a", "older-a");

    running.delete("chat-a");
    await vi.advanceTimersByTimeAsync(500);
    expect(controller.read().observation?.snapshot.current).toBeNull();
    expect(read).toHaveBeenCalledTimes(2);

    earlier.resolve({ view: 1, messages: [older], older: null });
    await loading;
    expect(controller.read().messages).toEqual([older, prior]);
    await vi.advanceTimersByTimeAsync(0);
    // The settlement held back by the earlier read lands below the older page.
    expect(controller.read().messages).toEqual([older, settled]);
    expect(read).toHaveBeenNthCalledWith(3, "chat-a");
  } finally {
    controller.disconnect();
    vi.useRealTimers();
  }
});

it("publishes editor updates only while the selected chat attachment is owned", async () => {
  const { bridge } = fixture();
  const publish = vi.fn<
    NonNullable<DesktopNativeChat["publishEditorSurfaces"]>
  >(async () => {});
  bridge.publishEditorSurfaces = publish;
  const open = ["/a.svg", "/b.canvas"];
  let snapshot: NativeEditorSurfaceSnapshot = {
    active: open[0],
    open,
    truncated: false,
  };
  const listeners = new Set<() => void>();
  const controller = new NativeChatController(bridge, undefined, undefined, {
    readEditorSurfaces: () => snapshot,
    subscribeToEditorSurfaces: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  try {
    controller.connect("first");
    await vi.waitFor(() =>
      expect(publish).toHaveBeenCalledExactlyOnceWith("first", snapshot)
    );
    const original = [...listeners][0];
    snapshot = { ...snapshot, active: open[1] };
    original();
    expect(publish).toHaveBeenLastCalledWith("first", snapshot);
    await controller.select("second");
    expect(publish).toHaveBeenLastCalledWith("second", snapshot);
    expect(listeners.size).toBe(1);
    expect(listeners.has(original)).toBe(false);
    original();
    expect(publish).toHaveBeenCalledTimes(3);
  } finally {
    controller.disconnect();
  }
  expect(listeners.size).toBe(0);
});

it("fences presentation by the current attachment, tab revision, and delivery lifetime", async () => {
  const { bridge } = fixture();
  const publish = vi.fn<
    NonNullable<DesktopNativeChat["publishEditorSurfaces"]>
  >(async () => {});
  bridge.publishEditorSurfaces = publish;
  const unsubscribe = vi.fn<() => void>();
  let delivery:
    | ((request: NativeEditorSurfaceOpen, isCurrent: () => boolean) => void)
    | undefined;
  bridge.onEditorSurfaceOpen = (attachment, open) => {
    expect(attachment).toBe("workbench");
    delivery = open;
    return unsubscribe;
  };
  let change: (() => void) | undefined;
  const open = vi.fn<
    (path: string, requireCurrent: () => boolean) => Promise<void>
  >(async () => {});
  const snapshot = { active: null, open: [], truncated: false };
  const controller = new NativeChatController(bridge, undefined, undefined, {
    readEditorSurfaces: () => snapshot,
    subscribeToEditorSurfaces: (listener) => {
      change = listener;
      return () => {};
    },
    open,
  });
  try {
    controller.connect("workbench");
    await vi.waitFor(() =>
      expect(publish).toHaveBeenCalledExactlyOnceWith("workbench", snapshot, 1)
    );
    const request = {
      path: "/result.svg",
      revision: 1,
      expiresAtMs: Date.now() + 5000,
    };
    delivery!({ ...request, expiresAtMs: 0 }, () => true);
    delivery!(request, () => false);
    expect(open).not.toHaveBeenCalled();
    delivery!(request, () => true);
    expect(open).toHaveBeenCalledTimes(1);
    const current = open.mock.calls[0][1];
    expect(current()).toBe(true);
    change!();
    expect(publish).toHaveBeenLastCalledWith("workbench", snapshot, 2);
    expect(current()).toBe(false);
    delivery!(request, () => true);
    expect(open).toHaveBeenCalledTimes(1);
    delivery!({ ...request, revision: 2 }, () => true);
    expect(open).toHaveBeenCalledTimes(2);
  } finally {
    controller.disconnect();
  }
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(open.mock.calls[1][1]()).toBe(false);
});

it("keeps the captured SVG target when the same submission reply is lost", async () => {
  const { bridge } = fixture();
  bridge.publishEditorSurfaces = async () => {};
  bridge.onEditorSvgText = () => () => {};
  const send = vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
    async (_action, sessionId, inputId) => ({
      sessionId,
      inputId,
      disposition: "claimed",
      inputPosition: 1,
      turnId: "turn-workbench",
    })
  );
  send.mockRejectedValueOnce(new Error("fixture lost reply"));
  bridge.submitInRegime = send;
  const target = crypto.randomUUID();
  const capture = vi.fn<() => string>();
  capture.mockReturnValueOnce(target);
  capture.mockReturnValue(crypto.randomUUID());
  const controller = new NativeChatController(bridge, undefined, undefined, {
    readEditorSurfaces: () => ({
      active: "/poster.svg",
      open: ["/poster.svg"],
      truncated: false,
    }),
    subscribeToEditorSurfaces: () => () => {},
    svgText: { capture, invoke: () => ({ kind: "unavailable" }) },
  });
  try {
    await controller.select("workbench");
    await expect(controller.submit("Read this SVG selection.")).rejects.toThrow(
      "fixture lost reply"
    );
    await controller.submit("Read this SVG selection.");
    expect(send.mock.calls[0]?.at(-1)).toBe(target);
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
    expect(capture).toHaveBeenCalledTimes(1);
  } finally {
    controller.disconnect();
  }
});

it("replaces a retry wait when the same turn's new observation clears it", async () => {
  const { bridge, controller, running } = fixture();
  running.add("retry-chat");
  const original = bridge.observe.bind(bridge);
  const deadline = 1_800_000_000_000;
  let retrying = true;
  bridge.observe = async (id) => {
    const result = await original(id);
    return retrying
      ? {
          ...result,
          snapshot: { ...result.snapshot, retryNotBeforeMs: deadline },
        }
      : result;
  };
  controller.connect(null);
  await controller.select("retry-chat");
  expect(controller.read().observation?.snapshot).toMatchObject({
    retryNotBeforeMs: deadline,
    current: { turnId: "turn-retry-chat" },
  });
  retrying = false;
  await controller.repair();
  const next = controller.read().observation?.snapshot;
  expect(next?.current?.turnId).toBe("turn-retry-chat");
  expect(next).not.toHaveProperty("retryNotBeforeMs");
  controller.disconnect();
});

it("keeps check-in permission bound to the same Act send after a lost acknowledgement", async () => {
  const { bridge, controller, waiting } = fixture();
  const receipt = vi.spyOn(bridge, "inputReceipt");
  const scheduled = vi.fn<NonNullable<DesktopNativeChat["submitWithWakeup"]>>(
    async (id, inputId, text) => {
      waiting.add(id);
      return bridge.submit(id, inputId, text);
    }
  );
  bridge.submitInRegime = (_action, id, inputId, text) =>
    bridge.submit(id, inputId, text);
  bridge.acceptsWakeups = async () => true;
  bridge.submitWithWakeup = scheduled.mockRejectedValueOnce(
    new Error("native_agent_acknowledgement_lost")
  );
  bridge.scheduledWakeup = async () => null;
  bridge.controlWakeup = async () => {
    throw new Error("fixture");
  };
  await controller.select("chat");
  await vi.waitFor(() => expect(controller.canAllowWakeup).toBe(true));
  controller.selectOperatingRegime("plan");
  controller.setAllowWakeup(true);
  expect(controller.read().allowWakeup).toBe(false);
  controller.selectOperatingRegime("act");
  controller.setAllowWakeup(true);
  await expect(controller.submit("Check once")).rejects.toThrow(
    "native_agent_acknowledgement_lost"
  );
  expect(receipt).not.toHaveBeenCalled();
  controller.setAllowWakeup(false);
  await expect(controller.submit("Check once")).rejects.toThrow(
    "original check-in permission"
  );
  waiting.add("chat");
  await controller.repair();
  controller.setAllowWakeup(true);
  expect(controller.read().allowWakeup).toBe(true);
  await expect(controller.submit("Check something different")).rejects.toThrow(
    "idle Act chat"
  );
  await controller.submit("Check once");
  expect(scheduled.mock.calls[0]).toEqual(scheduled.mock.calls[1]);
  expect(controller.read().allowWakeup).toBe(false);
  controller.disconnect();
});

it("restores and cancels an observed check-in, then continues its exact task", async () => {
  const { bridge, controller, waiting } = fixture();
  waiting.add("chat");
  let schedule: NativeChatWakeup = {
    turnId: "turn-chat",
    waitId: "wait",
    dueAtMs: 1_800_000_000_000,
    reason: "Check the export",
    status: "waiting",
    armed: false,
  };
  bridge.acceptsWakeups = async () => true;
  bridge.submitWithWakeup = bridge.submit;
  bridge.scheduledWakeup = async (id) => (id === "chat" ? schedule : null);
  bridge.controlWakeup = vi.fn<NonNullable<DesktopNativeChat["controlWakeup"]>>(
    async (_id, _observation, _wait, action) => {
      schedule =
        action === "recover"
          ? { ...schedule, armed: true }
          : { ...schedule, status: "cancelled", armed: false };
      return schedule;
    }
  );
  const control = vi.spyOn(bridge, "control");
  await controller.select("chat");
  await vi.waitFor(() =>
    expect(controller.canControlWakeup("recover")).toBe(true)
  );
  await controller.controlWakeup("recover");
  expect(controller.read().scheduledWakeup?.armed).toBe(true);
  await controller.controlWakeup("cancel");
  expect(controller.read().scheduledWakeup?.status).toBe("cancelled");
  await controller.control("resume");
  await controller.control("resume");
  expect(control.mock.calls[0]).toEqual(control.mock.calls[1]);
  expect(control.mock.calls[0]).toEqual([
    "chat",
    {
      action: "resume",
      observationId: "observation-chat",
      requestId: expect.any(String),
      cancelledWakeupId: "wait",
    },
  ]);
  expect(bridge.controlWakeup).toHaveBeenNthCalledWith(
    1,
    "chat",
    "observation-chat",
    "wait",
    "recover"
  );
  expect(bridge.controlWakeup).toHaveBeenNthCalledWith(
    2,
    "chat",
    "observation-chat",
    "wait",
    "cancel"
  );
  await controller.select("other");
  expect(controller.read().scheduledWakeup).toBeNull();
  expect(controller.canControlWakeup("recover")).toBe(false);
  controller.disconnect();
});

it("revises the exact earlier message and keeps the same receipt request after a lost reply", async () => {
  const { bridge, controller, transcripts, running } = fixture();
  const source = "revision-chat";
  const first = {
    messageId: "first",
    role: "user",
    text: "Original wording beyond the short preview. ".repeat(16),
  } as const;
  const later = {
    messageId: "later",
    role: "user",
    text: "Later original input",
  } as const;
  transcripts.set(source, [first, later]);
  const observe = bridge.observe.bind(bridge);
  let supported = false;
  let effortAvailable = false;
  bridge.acceptsEffort = async () => effortAvailable;
  bridge.submitInRegime = (_action, attachment, id, text) =>
    bridge.submit(attachment, id, text);
  bridge.observe = async (id) => {
    const observation = await observe(id);
    return supported
      ? {
          ...observation,
          snapshot: { ...observation.snapshot, historyRevisionAvailable: true },
        }
      : observation;
  };
  const prepare = vi.fn<NonNullable<DesktopNativeChat["prepareRevision"]>>();
  prepare.mockResolvedValue({
    reviewId: "exact-review",
    messageId: first.messageId,
    text: first.text,
    subsequentMessages: 1,
    effort: "ultra",
  });
  bridge.prepareRevision = prepare;
  const revise =
    vi.fn<
      (
        attachmentId: string,
        input: NativeChatRevisionInput
      ) => Promise<NativeChatRevisionReceipt>
    >();
  revise.mockRejectedValueOnce(new Error("native_chat_revision_unverified"));
  revise.mockImplementationOnce(async () => {
    transcripts.set(source, [
      { messageId: "replacement", role: "user", text: "Revised first" },
    ]);
    return {
      sessionId: source,
      view: 4,
      inputId: "replacement",
      inputPosition: 3,
    };
  });
  bridge.revise = revise;
  controller.connect(null);
  await controller.select(source);
  expect(controller.canReviseHistory).toBe(false);
  await controller.prepareRevision(first.messageId);
  expect(prepare).not.toHaveBeenCalled();
  supported = true;
  await controller.repair();
  expect(controller.canReviseHistory).toBe(true);
  await controller.prepareRevision(first.messageId);
  expect(prepare).toHaveBeenCalledWith(
    source,
    "observation-revision-chat",
    first.messageId
  );
  expect(controller.read().revisionDraft?.text).toBe(first.text);
  controller.changeRevisionText("Revised first");
  await controller.submitRevision();
  expect(revise).not.toHaveBeenCalled();
  expect(controller.read().error).toContain("Ultra effort is unavailable");
  effortAvailable = true;
  await controller.repair();
  await controller.submitRevision();
  expect(revise.mock.calls[0]?.[1].effort).toBe("ultra");
  expect(controller.read().revisionDraft?.unverified).toBe(true);
  controller.changeRevisionText("Do not change the request");
  controller.cancelRevision();
  expect(controller.read().revisionDraft?.text).toBe("Revised first");
  running.add(source);
  await vi.waitFor(async () => {
    await controller.repair();
    expect(controller.read().observation?.snapshot.current?.turnId).toBe(
      "turn-revision-chat"
    );
    expect(controller.canReviseHistory).toBe(false);
  });
  await controller.submitRevision();
  expect(revise.mock.calls[1]).toEqual(revise.mock.calls[0]);
  await vi.waitFor(() =>
    expect(controller.read().messages).toMatchObject([
      { messageId: "replacement" },
    ])
  );
  expect(controller.read().selected).toBe(source);
  expect(controller.read().revisionDraft).toBeNull();
  controller.disconnect();
});

it("runs only exact slash commands, preserves a lost fork identity and keeps the source selected", async () => {
  const { bridge, controller } = fixture();
  const submit = vi.spyOn(bridge, "submit");
  bridge.commands = async () => ["compact", "fork"];
  const run =
    vi.fn<
      (
        attachment: string,
        command: NativeChatCommand,
        requestId: string
      ) => Promise<NativeChatCommandResult>
    >();
  run.mockRejectedValueOnce(new Error("native_chat_command_unverified"));
  run.mockResolvedValueOnce({ command: "fork", sessionId: "forked" });
  bridge.runCommand = run;
  controller.connect(null);
  await controller.select("source");
  await vi.waitFor(() =>
    expect(controller.read().commands).toEqual(["compact", "fork"])
  );
  await expect(controller.submit(" /fork ")).rejects.toThrow(
    "native_chat_command_unverified"
  );
  await expect(controller.runCommand("compact")).rejects.toThrow(
    "native_chat_command_pending"
  );
  await controller.runCommand("fork");
  expect(run.mock.calls[0]).toEqual(run.mock.calls[1]);
  expect(submit).not.toHaveBeenCalled();
  expect(controller.read()).toMatchObject({
    selected: "source",
    commandFork: "forked",
  });
  controller.disconnect();
});

it("keeps a cancelled deletion open and ignores replay after a confirmed retirement", async () => {
  const { bridge, controller, updates, transcripts } = fixture();
  const entries = new Set(["chat-a", "chat-b"]);
  bridge.list = async () => ({ sessionIds: [...entries], nextCursor: null });
  bridge.listArchived = async () => ({ sessionIds: [], nextCursor: null });
  bridge.catalogEntry = async (sessionId) => ({
    sessionId,
    revision: 4,
    title: null,
    archived: false,
    deletionAvailable: true,
  });
  bridge.organize = async (sessionId, change) => ({ sessionId, ...change });
  const remove =
    vi.fn<
      (
        attachmentId: string,
        observationId: string,
        catalogRevision: number
      ) => Promise<boolean>
    >();
  remove.mockResolvedValueOnce(false).mockImplementationOnce(async () => {
    entries.delete("chat-a");
    updates.get("chat-a")?.({ kind: "closed", reason: "session_deleted" });
    return true;
  });
  bridge.deleteSavedChat = remove;
  transcripts.set("chat-a", [
    { messageId: "old", role: "user", text: "Old transcript" },
  ]);
  controller.connect(null);
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.canDeleteSavedChat).toBe(true));
  const late = updates.get("chat-a")!;
  await controller.deleteSavedChat();
  expect(controller.read().messages[0]?.text).toBe("Old transcript");
  expect(controller.read().selected).toBe("chat-a");
  await controller.deleteSavedChat();
  expect(remove.mock.calls).toEqual([
    ["chat-a", "observation-chat-a", 4],
    ["chat-a", "observation-chat-a", 4],
  ]);
  late({
    kind: "text",
    messageId: "late",
    turnId: "old-turn",
    role: "assistant",
    text: "Stale reply",
    offsetBytes: 0,
    replace: false,
  });
  expect(controller.read().selected).toBeNull();
  expect(controller.read().messages).toEqual([]);
  await vi.waitFor(() =>
    expect(controller.read().sessions).toEqual(["chat-b"])
  );
  controller.disconnect();
});

it("keeps the original mode and input identity when a draft is retried", async () => {
  const { bridge, controller } = fixture();
  const send = vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
    async (_action, sessionId, inputId) => ({
      sessionId,
      inputId,
      disposition: "claimed",
      inputPosition: 1,
      turnId: "turn-a",
    })
  );
  send.mockRejectedValueOnce(new Error("fixture lost reply"));
  bridge.submitInRegime = send;
  await controller.select("chat-a");
  controller.selectOperatingRegime("plan");
  await expect(controller.submit("Investigate")).rejects.toThrow("lost reply");
  const first = send.mock.calls[0];
  expect(first).toEqual([
    "submit",
    "chat-a",
    expect.any(String),
    "Investigate",
    "plan",
  ]);
  controller.selectOperatingRegime("act");
  await expect(controller.submit("Investigate")).rejects.toThrow(
    "native_chat_pending_regime_changed"
  );
  expect(send).toHaveBeenCalledTimes(1);
  controller.selectOperatingRegime("plan");
  await controller.submit("Investigate");
  expect(send.mock.calls[1]).toEqual(first);
  controller.disconnect();
});

it("reviews the exact pending request and removes authority on chat switch", async () => {
  const { bridge, controller, waiting } = fixture();
  waiting.add("chat-a");
  const review = {
    reviewId: "review-a",
    tool: "read_file",
    root: "/chosen",
    relativePath: "note.txt",
  } as const;
  const approvals = vi.fn<NonNullable<DesktopNativeChat["approvals"]>>(
    async () => [review]
  );
  const answer = vi.fn<NonNullable<DesktopNativeChat["answerApproval"]>>(
    async () => {
      waiting.delete("chat-a");
      return {
        sessionId: "chat-a",
        turnId: "turn-chat-a",
        requestId: "decision",
        sessionRevision: 3,
        journalPosition: 2,
      };
    }
  );
  bridge.approvals = approvals;
  bridge.answerApproval = answer;
  await controller.select("chat-a");
  expect(controller.read().approvals).toEqual([review]);
  expect(approvals).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    "observation-chat-a"
  );
  await controller.answerApproval("review-a", "approve_once");
  expect(answer).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    "review-a",
    "approve_once"
  );
  expect(controller.read().approvals).toEqual([]);
  await controller.select("chat-b");
  await controller.answerApproval("review-a", "decline");
  expect(answer).toHaveBeenCalledTimes(1);
  controller.disconnect();
});

it("drops a late review from the previous chat", async () => {
  const { bridge, controller, waiting } = fixture();
  waiting.add("chat-a");
  const pending =
    Promise.withResolvers<
      Awaited<ReturnType<NonNullable<DesktopNativeChat["approvals"]>>>
    >();
  const approvals = vi.fn<NonNullable<DesktopNativeChat["approvals"]>>(
    () => pending.promise
  );
  bridge.approvals = approvals;
  bridge.answerApproval = async () => {
    throw new Error("unexpected review");
  };
  const old = controller.select("chat-a");
  await vi.waitFor(() => expect(approvals).toHaveBeenCalledTimes(1));
  await controller.select("chat-b");
  pending.resolve([
    {
      reviewId: "old",
      tool: "read_file",
      root: "/chosen",
      relativePath: "note.txt",
    },
  ]);
  await old;
  expect(controller.read().selected).toBe("chat-b");
  expect(controller.read().approvals).toEqual([]);
  controller.disconnect();
});

it("queues separately and uses the new review token for the same question", async () => {
  const { bridge, controller, waiting } = fixture();
  waiting.add("chat-a");
  let queued = 0;
  const observe = bridge.observe.bind(bridge);
  bridge.observe = async (id) => {
    const prior = await observe(id);
    return {
      observationId: `${prior.observationId}-${queued}`,
      snapshot: { ...prior.snapshot, queuedInputs: queued },
    };
  };
  const question = {
    questionId: "question",
    style: "answer_dependent",
    question: "Which edition?",
    options: ["Screen", "Print"],
  } as const;
  bridge.questions = async () =>
    waiting.size ? [{ ...question, reviewId: `review-${queued}` }] : [];
  const enqueue = vi.fn<NonNullable<DesktopNativeChat["enqueue"]>>(
    async (sessionId, inputId) => {
      queued++;
      return {
        sessionId,
        inputId,
        disposition: "queued",
        inputPosition: 2,
        turnId: null,
      };
    }
  );
  const answer = vi.fn<NonNullable<DesktopNativeChat["answerQuestion"]>>(
    async () => {
      waiting.clear();
      return {
        sessionId: "chat-a",
        turnId: "turn-chat-a",
        requestId: "answer",
        sessionRevision: 3,
        journalPosition: 2,
      };
    }
  );
  bridge.enqueue = enqueue;
  bridge.answerQuestion = answer;
  await controller.select("chat-a");
  expect(controller.read().questions[0]?.reviewId).toBe("review-0");
  await controller.submit("Check the page numbers.");
  expect(enqueue).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    expect.any(String),
    "Check the page numbers."
  );
  expect(controller.read().questions[0]).toEqual({
    ...question,
    reviewId: "review-1",
  });
  expect(
    await controller.answerQuestion(question.questionId, {
      kind: "choice",
      index: 1,
    })
  ).toBe(true);
  expect(answer).toHaveBeenCalledExactlyOnceWith("chat-a", "review-1", {
    kind: "choice",
    index: 1,
  });
  await controller.select("chat-b");
  expect(
    await controller.answerQuestion(question.questionId, { kind: "skipped" })
  ).toBe(false);
  expect(answer).toHaveBeenCalledTimes(1);
  controller.disconnect();
});

it("keeps ordinary turns quiet when question inspection is absent or fails", async () => {
  const { bridge, controller, running } = fixture();
  running.add("chat-a");
  const questions = vi.fn<NonNullable<DesktopNativeChat["questions"]>>(
    async () => {
      throw new Error("fixture question method unavailable");
    }
  );
  bridge.questions = questions;
  await controller.select("chat-a");
  expect(questions).not.toHaveBeenCalled();
  expect(controller.read().questionError).toBeNull();

  bridge.answerQuestion = async () => {
    throw new Error("unexpected answer");
  };
  await controller.repair();
  expect(questions).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    "observation-chat-a"
  );
  expect(controller.read().questions).toEqual([]);
  expect(controller.read().questionError).toBeNull();
  expect(controller.read().error).toBeNull();
  controller.disconnect();
});

it("keeps a Library-enabled send's identity and submission path after a lost reply", async () => {
  const { bridge, waiting } = fixture();
  const controller = new NativeChatController(
    bridge,
    undefined,
    undefined,
    undefined,
    true
  );
  const plain = vi.spyOn(bridge, "submit");
  let supported = true;
  bridge.acceptsLibrarySelection = async () => supported;
  bridge.librarySelections = async () => [];
  bridge.answerLibrarySelection = async () => {
    throw new Error("unexpected Library answer");
  };
  const send = vi.fn<
    NonNullable<DesktopNativeChat["submitWithLibrarySelection"]>
  >(async (sessionId, inputId) => ({
    sessionId,
    inputId,
    disposition: "claimed",
    inputPosition: 1,
    turnId: `turn-${sessionId}`,
  }));
  send.mockRejectedValueOnce(new Error("fixture lost send"));
  bridge.submitWithLibrarySelection = send;
  await controller.select("chat-a");
  await expect(controller.submit("Find a reference.")).rejects.toThrow(
    "fixture lost send"
  );
  supported = false;
  waiting.add("chat-a");
  await controller.repair();
  await controller.submit("Find a reference.");
  expect(send.mock.calls[0]).toEqual([
    "chat-a",
    expect.any(String),
    "Find a reference.",
    undefined,
    undefined,
  ]);
  expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
  expect(plain).not.toHaveBeenCalled();
  controller.disconnect();
});

it("retries a Library answer with its original review and exact selected PNG", async () => {
  const { bridge, waiting } = fixture();
  const controller = new NativeChatController(
    bridge,
    undefined,
    undefined,
    undefined,
    true
  );
  waiting.add("chat-a");
  const selectionId = "reference-request";
  let reviewId = "review-first";
  const observe = bridge.observe.bind(bridge);
  bridge.observe = async (id) => ({
    ...(await observe(id)),
    observationId: `${id}/${reviewId}`,
  });
  bridge.acceptsLibrarySelection = async () => true;
  bridge.submitWithLibrarySelection = bridge.submit;
  bridge.librarySelections = async (id) =>
    waiting.has(id)
      ? [{ selectionId, reviewId, initialSearchQuery: "Printmaking" }]
      : [];
  const answer = vi.fn<
    NonNullable<DesktopNativeChat["answerLibrarySelection"]>
  >(async (sessionId) => {
    waiting.clear();
    return {
      sessionId,
      turnId: `turn-${sessionId}`,
      requestId: "answer",
      sessionRevision: 3,
      journalPosition: 2,
    };
  });
  answer.mockImplementationOnce(async () => {
    reviewId = "review-refreshed";
    throw new Error("fixture lost answer");
  });
  bridge.answerLibrarySelection = answer;
  const bytes = new Uint8Array([5, 17, 29]);
  const readPng = vi.fn<() => Promise<ArrayBuffer>>(async () => bytes.buffer);
  await controller.select("chat-a");
  expect(controller.read().librarySelection).toMatchObject({
    selectionId,
    reviewId,
  });
  expect(
    await controller.answerLibrarySelection(selectionId, {
      id: "pin",
      readPng,
    })
  ).toBe(false);
  expect(controller.read()).toMatchObject({
    librarySelection: { selectionId, reviewId: "review-refreshed" },
    librarySelectionRetry: true,
  });
  bytes.fill(0);
  expect(await controller.answerLibrarySelection(selectionId, "retry")).toBe(
    true
  );
  expect(readPng).toHaveBeenCalledTimes(1);
  expect(answer.mock.calls).toEqual(
    Array.from({ length: 2 }, () => [
      "chat-a",
      "review-first",
      { kind: "selected", id: "pin", png: new Uint8Array([5, 17, 29]) },
    ])
  );
  expect(controller.read().librarySelection).toBeNull();
  controller.disconnect();
});

it("does not send a Library image materialized after changing chats", async () => {
  const { bridge, waiting } = fixture();
  const controller = new NativeChatController(
    bridge,
    undefined,
    undefined,
    undefined,
    true
  );
  waiting.add("chat-a");
  bridge.acceptsLibrarySelection = async () => true;
  bridge.submitWithLibrarySelection = bridge.submit;
  bridge.librarySelections = async (id) =>
    waiting.has(id)
      ? [
          {
            selectionId: "library-a",
            reviewId: "review-a",
            initialSearchQuery: "Printmaking",
          },
        ]
      : [];
  const answer =
    vi.fn<NonNullable<DesktopNativeChat["answerLibrarySelection"]>>();
  bridge.answerLibrarySelection = answer;
  await controller.select("chat-a");
  const bytes = Promise.withResolvers<ArrayBuffer>();
  const reading = controller.answerLibrarySelection("library-a", {
    id: "pin",
    readPng: () => bytes.promise,
  });
  await controller.select("chat-b");
  bytes.resolve(new Uint8Array([5, 17, 29]).buffer);
  expect(await reading).toBe(false);
  expect(answer).not.toHaveBeenCalled();
  expect(controller.read()).toMatchObject({
    selected: "chat-b",
    librarySelection: null,
    librarySelectionRetry: false,
  });
  controller.disconnect();
});

it("keeps a queued edit draft across a stale revision and requires an explicit retry", async () => {
  const { bridge, controller, running } = fixture();
  running.add("chat-a");
  let revision = 2;
  const base = bridge.observe.bind(bridge);
  bridge.observe = async (id) => {
    const value = await base(id);
    return {
      observationId: `${id}-${revision}`,
      snapshot: {
        ...value.snapshot,
        sessionRevision: revision,
        queuedInputs: id === "chat-a" ? 1 : 0,
      },
    };
  };
  bridge.queue = async () => ({
    items: [{ inputId: "queued", preview: "Original" }],
    offset: 0,
    previousOffset: null,
    nextOffset: null,
  });
  bridge.queuedText = async () => "Original";
  const edits = vi.fn<NonNullable<DesktopNativeChat["editQueue"]>>(
    async (sessionId, change) => {
      revision++;
      if (revision === 3) throw new Error("stale_session_revision");
      return {
        sessionId,
        requestId: change.requestId,
        sessionRevision: revision,
      };
    }
  );
  bridge.editQueue = edits;
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  await controller.editQueuedText("queued");
  controller.changeQueueDraft("Revised draft");
  await controller.saveQueueDraft();
  expect(controller.read().queueDraft).toEqual({
    inputId: "queued",
    text: "Revised draft",
  });
  expect(edits).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  await controller.saveQueueDraft();
  expect(edits).toHaveBeenLastCalledWith(
    "chat-a",
    expect.objectContaining({
      action: "replace",
      observationId: "chat-a-3",
      text: "Revised draft",
    })
  );
  expect(edits.mock.calls[1][1].requestId).not.toBe(
    edits.mock.calls[0][1].requestId
  );
  expect(controller.read().queueDraft).toBeNull();
  controller.disconnect();
});

it("retries steering exactly after a lost reply and never falls through to the queue", async () => {
  const { bridge, controller, running } = fixture();
  running.add("chat-a");
  const enqueue = vi.fn<NonNullable<DesktopNativeChat["enqueue"]>>(
    async (sessionId, inputId) => ({
      sessionId,
      inputId,
      disposition: "queued",
      inputPosition: 2,
      turnId: null,
    })
  );
  const steer = vi.fn<NonNullable<DesktopNativeChat["steer"]>>(
    async (sessionId, input) => ({
      sessionId,
      requestId: input.requestId,
      turnId: "turn-chat-a",
      sessionRevision: 3,
      journalPosition: 2,
    })
  );
  steer.mockRejectedValueOnce(new Error("fixture lost reply"));
  bridge.enqueue = enqueue;
  bridge.steer = steer;
  await controller.select("chat-a");
  controller.toggleSteering();
  await expect(controller.submit("Correction")).rejects.toThrow(
    "fixture lost reply"
  );
  expect(controller.read().steering).toBe(true);
  expect(enqueue).not.toHaveBeenCalled();
  await controller.submit("Correction");
  expect(steer.mock.calls[1]).toEqual(steer.mock.calls[0]);
  expect(controller.read().steering).toBe(false);
  await controller.submit("Next task");
  expect(enqueue).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    expect.any(String),
    "Next task"
  );
  controller.disconnect();
});

it("sending while a turn is paused stops it and plays the new message next", async () => {
  const { bridge, controller } = fixture();
  // A paused turn with one message already waiting behind it.
  let state: "paused" | "stopped" | "running" = "paused";
  let queue = ["earlier"];
  const calls: string[] = [];
  bridge.observe = async (id) => ({
    observationId: `observation-${id}-${calls.length}`,
    snapshot: {
      sessionId: id,
      sessionRevision: 2 + calls.length,
      queuedInputs: queue.length,
      admissionPaused: state === "stopped",
      current:
        state === "stopped"
          ? null
          : {
              turnId: `turn-${state}`,
              epoch: 1,
              journalPosition: 1,
              historyPosition: 1,
              controlRevision: 1,
              paused: state === "paused",
              cancelled: false,
              disposition: state === "paused" ? "suspended" : "running",
              status: null,
            },
      latest: null,
    },
  });
  bridge.control = async (id, input) => {
    calls.push(`control:${input.action}`);
    if (input.action === "resume") throw new Error("fixture only");
    if (input.action === "stop") state = "stopped";
    return {
      action: input.action,
      receipt: {
        sessionId: id,
        turnId: "turn-paused",
        requestId: input.requestId,
        sessionRevision: 3,
        journalPosition: 1,
      },
    };
  };
  bridge.enqueue = async (id, inputId) => {
    calls.push("enqueue");
    queue = [...queue, inputId];
    return {
      sessionId: id,
      inputId,
      disposition: "queued",
      inputPosition: 2,
      turnId: null,
    };
  };
  bridge.queue = async () => ({
    items: queue.map((inputId) => ({ inputId, preview: inputId })),
    offset: 0,
    previousOffset: null,
    nextOffset: null,
  });
  bridge.editQueue = async (id, change) => {
    calls.push(
      change.action === "place" ? `place:${change.index}` : change.action
    );
    if (change.action === "place")
      queue = [change.inputId, ...queue.filter((i) => i !== change.inputId)];
    if (change.action === "resume") state = "running";
    return { sessionId: id, requestId: change.requestId, sessionRevision: 9 };
  };
  await controller.select("chat-a");
  await vi.waitFor(() =>
    expect(controller.read().observation?.snapshot.current?.paused).toBe(true)
  );
  await controller.submit("Try the other layout");
  expect(calls).toEqual(["control:stop", "enqueue", "place:0", "resume"]);
  expect(queue[1]).toBe("earlier");
  controller.disconnect();
});

it("steers with a queued message only after it leaves the queue, and returns its text if the turn refuses", async () => {
  const { bridge, controller, running } = fixture();
  running.add("chat-a");
  let queued = [{ inputId: "queued", preview: "Use the blue palette" }];
  bridge.queue = async () => ({
    items: queued,
    offset: 0,
    previousOffset: null,
    nextOffset: null,
  });
  const base = bridge.observe.bind(bridge);
  bridge.observe = async (id) => {
    const value = await base(id);
    return {
      ...value,
      snapshot: { ...value.snapshot, queuedInputs: queued.length },
    };
  };
  bridge.queuedText = async () => "Use the blue palette";
  const order: string[] = [];
  bridge.editQueue = vi.fn<NonNullable<DesktopNativeChat["editQueue"]>>(
    async (sessionId, change) => {
      order.push(change.action);
      queued = [];
      return { sessionId, requestId: change.requestId, sessionRevision: 3 };
    }
  );
  const steer = vi.fn<NonNullable<DesktopNativeChat["steer"]>>(
    async (sessionId, input) => {
      order.push(`steer:${input.text}`);
      return {
        sessionId,
        requestId: input.requestId,
        turnId: "turn-chat-a",
        sessionRevision: 4,
        journalPosition: 2,
      };
    }
  );
  bridge.steer = steer;
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  const item = controller.read().queue!.items[0];
  expect(controller.canSteerQueued(item)).toBe(true);
  // Goals, Plan and Ultra messages keep their own turn.
  expect(controller.canSteerQueued({ ...item, operatingRegime: "plan" })).toBe(
    false
  );
  expect(controller.canSteerQueued({ ...item, effort: "ultra" })).toBe(false);
  expect(await controller.steerQueued("queued")).toBeNull();
  expect(order).toEqual(["withdraw", "steer:Use the blue palette"]);

  queued = [{ inputId: "again", preview: "Use the blue palette" }];
  await controller.showQueuePage(0);
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  steer.mockRejectedValueOnce(new Error("turn settled"));
  expect(await controller.steerQueued("again")).toBe("Use the blue palette");
  expect(controller.read().error).toMatch(/back in the composer/);
  controller.disconnect();
});

it.each(["standard", "ultra", "scheduled standard", "standard plan"] as const)(
  "starts a %s goal only on explicit acceptance and reuses its exact input on retry",
  async (effort) => {
    const { bridge, controller } = fixture();
    const request = {
      objective: "Prepare the export",
      criteria: ["Verify the output"],
      allowance: { workTurns: 3, inferenceSteps: 32 },
      automatic: false,
      ...(effort === "ultra" && { effort }),
      ...(effort === "scheduled standard" && { allowWakeup: true as const }),
    };
    let goalId: string | null = null;
    const observe = bridge.observe.bind(bridge);
    bridge.observe = async (id) => {
      const observation = await observe(id);
      return {
        ...observation,
        observationId: goalId ? "goal-started" : observation.observationId,
        snapshot: { ...observation.snapshot, sessionRevision: goalId ? 3 : 2 },
      };
    };
    bridge.goal = async () =>
      goalId
        ? {
            observationId: "goal-3",
            goal: {
              ...request,
              goalId,
              state: { status: "active" },
              paused: false,
              progress: "Preparing the export",
              spent: { workTurns: 0, inferenceSteps: 0 },
              remaining: request.allowance,
              reservation: null,
            },
          }
        : { observationId: null, goal: null };
    const start = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>(
      async (sessionId, inputId) => {
        goalId = inputId;
        return {
          sessionId,
          inputId,
          disposition: "queued",
          inputPosition: 1,
          turnId: null,
        };
      }
    );
    start.mockRejectedValueOnce(new Error("fixture lost reply"));
    bridge.startGoal = start;
    bridge.acceptsGoalEffort = async () => effort === "ultra";
    if (effort === "scheduled standard") {
      bridge.acceptsWakeups = async () => true;
      bridge.submitWithWakeup =
        vi.fn<NonNullable<DesktopNativeChat["submitWithWakeup"]>>();
      bridge.scheduledWakeup = async () => null;
      bridge.controlWakeup =
        vi.fn<NonNullable<DesktopNativeChat["controlWakeup"]>>();
    }
    const regime = effort === "standard plan" ? "plan" : "act";
    bridge.submitInRegime =
      vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>();
    await controller.select("chat-a");
    controller.selectOperatingRegime(regime);
    expect(controller.read().goalEffortAvailable).toBe(effort === "ultra");
    expect(start).not.toHaveBeenCalled();
    expect(await controller.startGoal(request)).toBe(false);
    expect(controller.read().error).toContain("Your draft is still here");
    expect(await controller.startGoal(request)).toBe(true);
    expect(start.mock.calls[1]).toEqual(start.mock.calls[0]);
    expect(start.mock.calls[0][2]).toEqual({
      ...request,
      operatingRegime: regime,
    });
    expect(controller.read().goal?.goal?.state).toEqual({ status: "active" });
    expect(
      controller.read().observation?.snapshot.pendingGoalId
    ).toBeUndefined();
    expect(controller.canStartGoal).toBe(false);
    controller.disconnect();
  }
);

it.each([
  [{ effort: "ultra" as const }, "Ultra is unavailable"],
  [{ allowWakeup: true as const }, "check-ins are unavailable"],
  [
    { effort: "ultra" as const, allowWakeup: true as const },
    "Choose Standard effort",
  ],
])(
  "refuses unsupported Goal options %j before sending",
  async (options, error) => {
    const { bridge, controller } = fixture();
    bridge.goal = async () => ({ observationId: null, goal: null });
    const start = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>();
    bridge.startGoal = start;
    try {
      await controller.select("chat-a");
      expect(
        await controller.startGoal({
          objective: "Check the export",
          criteria: ["The export opens"],
          allowance: { workTurns: 1, inferenceSteps: 7 },
          automatic: false,
          ...options,
        })
      ).toBe(false);
      expect(start).not.toHaveBeenCalled();
      expect(controller.read().error).toContain(error);
    } finally {
      controller.disconnect();
    }
  }
);

it("retries an accepted Goal revision exactly and refuses a stale changed draft", async () => {
  const { bridge, controller } = fixture();
  const original = {
    description: "Check the export",
    criteria: ["The export opens"],
  };
  const objective = {
    description: "Check the revised export",
    criteria: ["The page fits"],
  };
  const allowance = { workTurns: 3, inferenceSteps: 8 };
  let goalRevision = 1;
  const observe = bridge.observe.bind(bridge);
  bridge.observe = async (id) => {
    const value = await observe(id);
    return {
      ...value,
      snapshot: { ...value.snapshot, sessionRevision: goalRevision + 1 },
    };
  };
  bridge.startGoal = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>();
  bridge.goal = async () => ({
    observationId: `observed-goal-${goalRevision}`,
    goalRevision,
    goal: {
      goalId: "goal",
      objective: (goalRevision === 1 ? original : objective).description,
      criteria: (goalRevision === 1 ? original : objective).criteria,
      state: { status: "active" },
      automatic: false,
      paused: false,
      progress: null,
      allowance,
      spent: { workTurns: 1, inferenceSteps: 2 },
      remaining: { workTurns: 2, inferenceSteps: 6 },
      reservation: null,
    },
  });
  const control = vi.fn<NonNullable<DesktopNativeChat["controlGoal"]>>(
    async (sessionId, change) => ({
      sessionId,
      requestId: change.requestId,
      sessionRevision: 3,
      stateRevision: 2,
      turnId: null,
      journalPosition: null,
    })
  );
  control.mockImplementationOnce(async () => {
    goalRevision = 2;
    throw new Error("fixture lost the revision receipt");
  });
  bridge.controlGoal = control;
  try {
    await controller.select("chat-a");
    const basis = {
      scope: controller.read().scope,
      goalId: "goal",
      goalRevision: 1,
    };
    expect(await controller.reviseGoal(basis, objective)).toBe(false);
    expect(controller.read().goal?.goalRevision).toBe(2);
    expect(await controller.reviseGoal(basis, original)).toBe(false);
    expect(control).toHaveBeenCalledTimes(1);
    expect(controller.read().error).toContain("The goal changed");
    expect(await controller.reviseGoal(basis, objective)).toBe(true);
    expect(control.mock.calls[1]).toEqual(control.mock.calls[0]);
    expect(control.mock.calls[0]?.[1]).toMatchObject({
      observationId: "observed-goal-1",
      action: "revise",
      objective,
    });
  } finally {
    controller.disconnect();
  }
});

it.each([
  {
    phase: "active",
    supported: true,
    automatic: false,
    manual: true,
    enabled: true,
  },
  {
    phase: "paused",
    supported: true,
    automatic: false,
    manual: true,
    enabled: true,
  },
  {
    phase: "blocked",
    supported: true,
    automatic: false,
    manual: true,
    enabled: true,
  },
  {
    phase: "active",
    supported: false,
    automatic: false,
    manual: false,
    enabled: false,
  },
  {
    phase: "blocked",
    supported: false,
    automatic: false,
    manual: false,
    enabled: false,
  },
  {
    phase: "active",
    supported: true,
    automatic: true,
    manual: false,
    enabled: false,
  },
  {
    phase: "blocked",
    supported: false,
    automatic: true,
    manual: false,
    enabled: true,
  },
  {
    phase: "exhausted",
    supported: true,
    automatic: false,
    manual: false,
    enabled: false,
  },
  {
    phase: "held queue",
    supported: true,
    automatic: false,
    manual: true,
    enabled: false,
  },
] as const)(
  "gates $phase Goal continuation (manual capability $supported, automatic $automatic)",
  async ({ phase, supported, automatic, manual, enabled }) => {
    const { bridge, controller } = fixture();
    const observe = bridge.observe.bind(bridge);
    bridge.observe = async (id) => {
      const result = await observe(id);
      return {
        ...result,
        snapshot: {
          ...result.snapshot,
          ...(supported && { goalManualContinuationAvailable: true as const }),
          admissionPaused: phase === "held queue",
        },
      };
    };
    const goal: NativeChatGoal = {
      goalId: "goal",
      objective: "Check the export",
      criteria: ["The export opens"],
      automatic,
      allowance: { workTurns: 3, inferenceSteps: 8 },
      spent: { workTurns: 1, inferenceSteps: 2 },
      remaining:
        phase === "exhausted"
          ? { workTurns: 0, inferenceSteps: 0 }
          : { workTurns: 2, inferenceSteps: 6 },
      paused: phase === "paused",
      progress: "First export checked",
      state:
        phase === "blocked"
          ? { status: "blocked", reason: "needs_input" }
          : { status: phase === "exhausted" ? "exhausted" : "active" },
      reservation: null,
    };
    bridge.startGoal = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>();
    bridge.goal = async () => ({ observationId: "goal-observation", goal });
    bridge.controlGoal = vi.fn<NonNullable<DesktopNativeChat["controlGoal"]>>();
    try {
      await controller.select("chat-a");
      expect(controller.showsManualGoalContinuation).toBe(manual);
      expect(controller.canControlGoal("resume")).toBe(enabled);
    } finally {
      controller.disconnect();
    }
  }
);

it("retries the exact lost manual Resume receipt after observing queued continuation", async () => {
  const { bridge, controller } = fixture();
  let queued = false;
  const observe = bridge.observe.bind(bridge);
  bridge.observe = async (id) => {
    const result = await observe(id);
    return {
      ...result,
      snapshot: {
        ...result.snapshot,
        sessionRevision: queued ? 3 : 2,
        admissionPaused: queued,
        goalManualContinuationAvailable: true,
      },
    };
  };
  bridge.startGoal = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>();
  bridge.goal = async () => ({
    observationId: queued
      ? "queued-goal-observation"
      : "manual-goal-observation",
    goal: {
      goalId: "manual-goal",
      objective: "Check the export",
      criteria: ["The export opens"],
      automatic: false,
      allowance: { workTurns: 3, inferenceSteps: 8 },
      spent: { workTurns: 1, inferenceSteps: 2 },
      remaining: { workTurns: 2, inferenceSteps: 6 },
      paused: false,
      progress: "First export checked",
      state: { status: "active" },
      reservation: null,
      ...(queued && { continuationPending: true as const }),
    },
  });
  const first = Promise.withResolvers<void>();
  const control = vi.fn<NonNullable<DesktopNativeChat["controlGoal"]>>(
    async (sessionId, change) => ({
      sessionId,
      requestId: change.requestId,
      sessionRevision: 3,
      stateRevision: 2,
      turnId: null,
      journalPosition: null,
    })
  );
  control.mockImplementationOnce(async () => {
    await first.promise;
    queued = true;
    throw new Error("fixture lost the Resume receipt");
  });
  bridge.controlGoal = control;
  try {
    await controller.select("chat-a");
    const submitted = controller.controlGoal("resume");
    await controller.controlGoal("resume");
    expect(control).toHaveBeenCalledTimes(1);
    expect(controller.canControlGoal("resume")).toBe(false);
    first.resolve();
    await submitted;
    expect(controller.read().goal?.goal?.continuationPending).toBe(true);
    expect(controller.canRetryManualGoalConfirmation).toBe(true);
    expect(controller.canControlGoal("resume")).toBe(true);
    await controller.controlGoal("resume");
    expect(control.mock.calls[1]).toEqual(control.mock.calls[0]);
    expect(control.mock.calls[0]?.[1]).toMatchObject({
      observationId: "manual-goal-observation",
      action: "resume",
    });
    expect(controller.canRetryManualGoalConfirmation).toBe(false);
    expect(controller.canControlGoal("resume")).toBe(false);
    await controller.controlGoal("resume");
    expect(control).toHaveBeenCalledTimes(2);
  } finally {
    first.resolve();
    controller.disconnect();
  }
});

it.each(["blocked", "cleared"] as const)(
  "uses task controls for funded Goal work and accounts for its exact held review when %s",
  async (heldStatus) => {
    const { bridge, controller, running } = fixture();
    const session = "funded";
    running.add(session);
    bridge.acceptsGoalEffort = async () => true;
    bridge.startGoal = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>();
    const observe = bridge.observe.bind(bridge);
    bridge.observe = async (id) => {
      const observation = await observe(id);
      return {
        ...observation,
        observationId: running.has(id) ? "running" : "held",
        snapshot: {
          ...observation.snapshot,
          sessionRevision: running.has(id) ? 2 : 3,
        },
      };
    };
    bridge.goal = async () => ({
      observationId: running.has(session) ? "active-goal" : "held-goal",
      goal: {
        goalId: "goal",
        objective: "Check the export",
        criteria: ["The export opens"],
        automatic: true,
        effort: "ultra",
        allowance: { workTurns: 2, inferenceSteps: 7 },
        spent: { workTurns: 0, inferenceSteps: 0 },
        remaining: { workTurns: 1, inferenceSteps: 0 },
        paused: false,
        progress: null,
        state: running.has(session)
          ? { status: "active" }
          : heldStatus === "cleared"
            ? { status: "cleared" }
            : { status: "blocked", reason: "uncertain_work" },
        reservation: {
          turnId: `turn-${session}`,
          inferenceSteps: 7,
          reviewInferenceSteps: 2,
          uncertain: !running.has(session),
        },
      },
    });
    const control = vi.fn<NonNullable<DesktopNativeChat["controlGoal"]>>();
    bridge.controlGoal = control;
    control.mockRejectedValueOnce(new Error("goal_review_still_held"));
    try {
      await controller.select(session);
      expect(controller.canControlGoal("pause")).toBe(false);
      expect(controller.canControlGoal("clear")).toBe(false);
      expect(controller.canControlGoal("reconcile_review")).toBe(false);
      running.delete(session);
      await controller.repair();
      expect(controller.canControlGoal("reconcile_review")).toBe(true);
      await controller.controlGoal("reconcile_review");
      expect(controller.read().error).toContain("allowance stays held");
      await controller.controlGoal("reconcile_review");
      expect(control.mock.calls[1]).toEqual(control.mock.calls[0]);
      expect(control.mock.calls[0][1]).toMatchObject({
        action: "reconcile_review",
        observationId: "held-goal",
      });
    } finally {
      controller.disconnect();
    }
  }
);

it("reads the pending goal from a reopened chat and withholds text replacement", async () => {
  const { bridge, controller } = fixture();
  const goalStart = {
    objective: "Prepare the export",
    criteria: ["Verify the output"],
    allowance: { workTurns: 3, inferenceSteps: 32 },
    automatic: false,
  };
  const observe = bridge.observe.bind(bridge);
  bridge.observe = async (id) => {
    const observation = await observe(id);
    return {
      ...observation,
      snapshot: {
        ...observation.snapshot,
        queuedInputs: 1,
        pendingGoalId: "saved-goal",
      },
    };
  };
  bridge.goal = async () => ({ observationId: null, goal: null });
  bridge.queue = async () => ({
    items: [{ inputId: "saved-goal", preview: goalStart.objective, goalStart }],
    offset: 0,
    previousOffset: null,
    nextOffset: null,
  });
  const queuedText = vi.fn<NonNullable<DesktopNativeChat["queuedText"]>>();
  const edit = vi.fn<NonNullable<DesktopNativeChat["editQueue"]>>();
  const start = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>();
  bridge.queuedText = queuedText;
  bridge.editQueue = edit;
  bridge.startGoal = start;
  await controller.select("chat-a");
  expect(controller.read().observation?.snapshot.pendingGoalId).toBe(
    "saved-goal"
  );
  await vi.waitFor(() =>
    expect(controller.read().queue?.items[0]?.goalStart).toEqual(goalStart)
  );
  expect(controller.canStartGoal).toBe(false);
  await controller.editQueuedText("saved-goal");
  await controller.editQueue({
    action: "replace",
    inputId: "saved-goal",
    text: "Unrelated.",
  });
  expect(queuedText).not.toHaveBeenCalled();
  expect(edit).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  controller.disconnect();
});

it("keeps side retries exact, parent input independent, and late answers out of the next chat", async () => {
  const { bridge, controller } = fixture();
  const context = {
    sourceRevision: 2,
    compacted: true,
    truncated: false,
    omitted: true,
  };
  const open = vi.fn<NonNullable<DesktopNativeChat["openSideChat"]>>(
    async () => context
  );
  open.mockRejectedValueOnce(new Error("fixture lost open reply"));
  const response = {
    turnId: "side-turn",
    status: "succeeded",
    text: "Side answer.",
    textTruncated: false,
  } as const;
  const ask = vi.fn<NonNullable<DesktopNativeChat["askSideChat"]>>(
    async () => response
  );
  ask.mockRejectedValueOnce(new Error("fixture lost answer"));
  const close = vi.fn<NonNullable<DesktopNativeChat["closeSideChat"]>>(
    async () => {}
  );
  const submit = vi.spyOn(bridge, "submit");
  bridge.openSideChat = open;
  bridge.askSideChat = ask;
  bridge.closeSideChat = close;

  await controller.select("chat-a");
  controller.openSideChat();
  const side = controller.read().sideChat!;
  await side.open();
  expect(side.read().phase).toBe("unavailable");
  await side.open();
  expect(side.read().context).toEqual(context);
  expect(open.mock.calls[0]).toEqual(open.mock.calls[1]);
  side.setDraft("Explain the decision.");
  await side.ask();
  expect(side.read().draft).toBe("Explain the decision.");
  const answer = Promise.withResolvers<typeof response>();
  ask.mockReturnValueOnce(answer.promise);
  const pending = side.ask();
  expect(side.read().asking).toBe(true);
  expect(controller.canSubmit).toBe(true);
  await controller.submit("Continue the parent.");
  expect(submit).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    expect.any(String),
    "Continue the parent."
  );
  expect(ask.mock.calls[0]).toEqual(ask.mock.calls[1]);
  answer.resolve(response);
  await pending;
  expect(side.read().exchanges).toEqual([
    { question: "Explain the decision.", answer: response },
  ]);
  expect(controller.read().messages).toEqual([]);

  const late = Promise.withResolvers<typeof response>();
  ask.mockReturnValueOnce(late.promise);
  side.setDraft("Follow up.");
  const unfinished = side.ask();
  await controller.select("chat-b");
  late.resolve(response);
  await unfinished;
  expect(controller.read().sideChat).toBeNull();
  expect(side.read().exchanges).toEqual([]);
  expect(close).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    open.mock.calls[0][1]
  );
  controller.disconnect();
});

it("stages only a selected current side answer and leaves parent actions untouched", async () => {
  const { bridge, controller, running } = fixture();
  bridge.openSideChat = async () => ({
    sourceRevision: 2,
    compacted: false,
    truncated: false,
    omitted: false,
  });
  const ask = vi.fn<NonNullable<DesktopNativeChat["askSideChat"]>>();
  ask
    .mockResolvedValueOnce({
      turnId: "first",
      status: "succeeded",
      text: "A different answer.",
      textTruncated: false,
    })
    .mockResolvedValueOnce({
      turnId: "selected",
      status: "succeeded",
      text: `<literal>\n${"🙂".repeat(10_000)}`,
      textTruncated: false,
    })
    .mockResolvedValueOnce({
      turnId: "failed",
      status: "failed",
      text: "A partial result.",
      textTruncated: false,
    });
  bridge.askSideChat = ask;
  bridge.closeSideChat = async () => {};
  const submit = vi.spyOn(bridge, "submit");
  const steer = vi.fn<NonNullable<DesktopNativeChat["steer"]>>();
  bridge.steer = steer;
  running.add("chat-a");
  await controller.select("chat-a");
  controller.openSideChat();
  const side = controller.read().sideChat!;
  await side.open();
  for (const question of ["First", "Selected", "Failed"]) {
    side.setDraft(question);
    await side.ask();
  }

  let draft = "Existing parent draft.";
  const append = vi.fn<(quote: string) => boolean>((quote) => {
    draft += `\n${quote}`;
    return true;
  });
  controller.stageSideAnswer(side, "unknown", append);
  controller.stageSideAnswer(side, "failed", append);
  controller.toggleSteering();
  expect(controller.read().steering).toBe(true);
  controller.stageSideAnswer(side, "selected", append);
  expect(append).not.toHaveBeenCalled();
  controller.toggleSteering();

  controller.stageSideAnswer(side, "selected", append);
  const quote = append.mock.calls[0]?.[0];
  expect(quote).toMatch(/^Side chat answer \(excerpt\)\n> <literal>\n> 🙂+$/u);
  expect(new TextEncoder().encode(quote).length).toBeLessThan(16_420);
  expect(draft).toBe(`Existing parent draft.\n${quote}`);

  await controller.select("chat-b");
  controller.stageSideAnswer(side, "selected", append);
  expect(append).toHaveBeenCalledTimes(1);
  expect(submit).not.toHaveBeenCalled();
  expect(steer).not.toHaveBeenCalled();
  controller.disconnect();
});

it("reads one summary per observed terminal turn and drops replies after switching chats", async () => {
  const { bridge, controller } = fixture();
  const summaries = new Map<string, NativeChatTurn>();
  const observe = bridge.observe;
  vi.spyOn(bridge, "observe").mockImplementation(async (id) => {
    const observation = await observe(id);
    return {
      observationId: `basis-${id}-${summaries.get(id)?.turnId ?? "idle"}`,
      snapshot: { ...observation.snapshot, latest: summaries.get(id) ?? null },
    };
  });
  const read = vi.fn<NonNullable<DesktopNativeChat["turnSummary"]>>();
  bridge.turnSummary = read;
  await controller.select("chat-a");
  expect(read).not.toHaveBeenCalled();

  const latest = {
    turnId: "finished-one",
    epoch: 1,
    journalPosition: 8,
    historyPosition: 2,
    controlRevision: 1,
    paused: false,
    cancelled: false,
    disposition: "settled",
    status: "succeeded",
  } as const;
  const account = {
    turnId: latest.turnId,
    status: latest.status,
    text: "Completed result.",
    textTruncated: false,
    steps: 2,
    unresolvedOperations: 0,
    toolActivity: { succeeded: 1, failed: 0, cancelled: 0, unresolved: 0 },
    checks: ["allowed"],
  } satisfies NativeChatTurnSummary;
  read.mockResolvedValueOnce(account);
  summaries.set("chat-a", latest);
  await controller.repair();
  expect(controller.read().turnSummary).toEqual(account);
  await controller.repair();
  expect(read).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    "basis-chat-a-finished-one"
  );

  const late = Promise.withResolvers<NativeChatTurnSummary>();
  read.mockReturnValueOnce(late.promise);
  summaries.set("chat-a", { ...latest, turnId: "finished-two" });
  await controller.repair();
  expect(controller.read().turnSummary).toBeNull();
  expect(read).toHaveBeenLastCalledWith("chat-a", "basis-chat-a-finished-two");
  await controller.select("chat-b");
  late.resolve({ ...account, turnId: "finished-two" });
  await late.promise;
  expect(controller.read().turnSummary).toBeNull();
  expect(read).toHaveBeenCalledTimes(2);
  controller.disconnect();
});

it.each(["rejected read", "mismatched turn"] as const)(
  "keeps the verified terminal outcome after a %s and can retry details",
  async (failure) => {
    const { bridge, controller } = fixture();
    const submit = vi.spyOn(bridge, "submit");
    const latest = {
      turnId: "stopped-turn",
      epoch: 1,
      journalPosition: 8,
      historyPosition: 2,
      controlRevision: 1,
      paused: false,
      cancelled: true,
      disposition: "settled",
      status: "cancelled",
    } as const;
    const observe = bridge.observe;
    vi.spyOn(bridge, "observe").mockImplementation(async (id) => {
      const observation = await observe(id);
      return {
        ...observation,
        snapshot: { ...observation.snapshot, latest },
      };
    });
    const detail = {
      turnId: latest.turnId,
      status: latest.status,
      text: "Work was stopped after the first change.",
      textTruncated: false,
      steps: 1,
      unresolvedOperations: 0,
      toolActivity: { succeeded: 1, failed: 0, cancelled: 0, unresolved: 0 },
      checks: [],
    } satisfies NativeChatTurnSummary;
    const read = vi.fn<NonNullable<DesktopNativeChat["turnSummary"]>>();
    if (failure === "rejected read")
      read.mockRejectedValueOnce(new Error("Private transport detail"));
    else read.mockResolvedValueOnce({ ...detail, turnId: "other-turn" });
    const recovered = Promise.withResolvers<NativeChatTurnSummary>();
    read.mockReturnValueOnce(recovered.promise);
    bridge.turnSummary = read;

    await controller.select("chat-a");
    await vi.waitFor(() =>
      expect(controller.read().turnSummary).toEqual({
        turnId: latest.turnId,
        status: latest.status,
        text: "The turn was stopped.",
        textTruncated: false,
        steps: null,
        unresolvedOperations: null,
        toolActivity: null,
        checks: [],
        detailsUnavailable: true,
      })
    );
    expect(read).toHaveBeenCalledTimes(1);
    controller.retryTurnSummary();
    controller.retryTurnSummary();
    expect(read).toHaveBeenCalledTimes(2);
    expect(controller.read().turnSummary).toMatchObject({
      turnId: latest.turnId,
      detailsUnavailable: true,
    });
    recovered.resolve(detail);
    await vi.waitFor(() =>
      expect(controller.read().turnSummary).toEqual(detail)
    );
    expect(submit).not.toHaveBeenCalled();
    controller.disconnect();
  }
);

it.each(["turn", "review"] as const)(
  "refreshes the exact displayed %s request only when asked",
  async (section) => {
    const { bridge, controller } = fixture();
    const latest = {
      turnId: "billing-turn",
      epoch: 1,
      journalPosition: 8,
      historyPosition: 2,
      controlRevision: 1,
      paused: false,
      cancelled: false,
      disposition: "settled",
      status: "succeeded",
    } as const;
    const observe = bridge.observe;
    vi.spyOn(bridge, "observe").mockImplementation(async (id) => {
      const observation = await observe(id);
      return {
        ...observation,
        snapshot: {
          ...observation.snapshot,
          latest: id === "chat-a" ? latest : null,
        },
      };
    });
    const selected = { operationId: "op", attemptId: "first" };
    const another = { operationId: "op", attemptId: "second" };
    const sibling = {
      operationId: "sibling-op",
      attemptId: "sibling-attempt",
      kind: "settled",
      chargedMills: "0.5",
      refreshable: false,
    } as const;
    const billingOf = (
      attempts: readonly NativeChatGatewayBillingAttempt[]
    ) => {
      const group = { attempts, omittedAttempts: 0 };
      const other = { attempts: [sibling], omittedAttempts: 0 };
      return section === "turn"
        ? { ...group, review: other }
        : { ...other, review: group };
    };
    const detail: NativeChatTurnSummary = {
      turnId: latest.turnId,
      status: latest.status,
      text: "Finished.",
      textTruncated: false,
      steps: 1,
      unresolvedOperations: 0,
      toolActivity: null,
      checks: [],
      gatewayBilling: billingOf([
        { ...selected, kind: "pending", refreshable: true },
        { ...another, kind: "pending", refreshable: true },
      ]),
    };
    const read = vi
      .fn<NonNullable<DesktopNativeChat["turnSummary"]>>()
      .mockResolvedValueOnce(detail);
    bridge.turnSummary = read;
    await controller.select("chat-a");
    await vi.waitFor(() =>
      expect(controller.read().turnSummary).toEqual(detail)
    );
    await controller.refreshGatewayBilling(latest.turnId, {
      ...selected,
      attemptId: "stale",
    });
    expect(read).toHaveBeenCalledTimes(1);
    const settled = {
      ...selected,
      kind: "settled",
      chargedMills: "0.125",
      refreshable: false,
    } as const;
    read.mockResolvedValueOnce({
      ...detail,
      gatewayBilling: billingOf([settled]),
    });
    await controller.refreshGatewayBilling(latest.turnId, selected);
    expect(read.mock.calls[1]?.[2]).toEqual(selected);
    expect(controller.read().turnSummary?.gatewayBilling).toEqual(
      billingOf([settled, { ...another, kind: "pending", refreshable: true }])
    );
    const late = Promise.withResolvers<NativeChatTurnSummary>();
    read.mockReturnValueOnce(late.promise);
    const refresh = controller.refreshGatewayBilling(latest.turnId, another);
    expect(controller.read().gatewayBillingRefresh).toEqual({
      ...another,
      status: "loading",
    });
    await controller.select("chat-b");
    late.resolve(detail);
    await refresh;
    expect(controller.read().turnSummary).toBeNull();
    expect(controller.read().gatewayBillingRefresh).toBeNull();
    controller.disconnect();
  }
);

it("reads and refreshes only the selected child assignment on the current page", async () => {
  const { bridge, controller } = fixture();
  const latest = {
    turnId: "parent-turn",
    epoch: 1,
    journalPosition: 8,
    historyPosition: 2,
    controlRevision: 1,
    paused: false,
    cancelled: false,
    disposition: "settled",
    status: "succeeded",
  } as const;
  const observe = bridge.observe;
  vi.spyOn(bridge, "observe").mockImplementation(async (id) => {
    const observation = await observe(id);
    return {
      ...observation,
      snapshot: {
        ...observation.snapshot,
        latest: id === "chat-a" ? latest : null,
      },
    };
  });
  const child = { childId: "child", inputId: "second" };
  const cursor = { childId: "child", inputId: "first" };
  const attempt = { operationId: "op", attemptId: "attempt" };
  const pending = { ...attempt, kind: "pending", refreshable: true } as const;
  const page = {
    assignments: [
      {
        ...child,
        name: "Research",
        disposition: { kind: "completed", turn: "child-turn" } as const,
        billing: { attempts: [pending], omittedAttempts: 0 },
      },
    ],
    coverageIncomplete: true,
  };
  const detail: NativeChatTurnSummary = {
    turnId: latest.turnId,
    status: latest.status,
    text: "Finished.",
    textTruncated: false,
    steps: 1,
    unresolvedOperations: 0,
    toolActivity: null,
    checks: [],
    gatewayBilling: {
      attempts: [pending],
      omittedAttempts: 0,
      children: {
        assignments: [],
        nextAfter: cursor,
        coverageIncomplete: true,
      },
    },
  };
  const read = vi.fn<NonNullable<DesktopNativeChat["turnSummary"]>>();
  read.mockResolvedValueOnce(detail).mockResolvedValueOnce({
    ...detail,
    gatewayBilling: { ...detail.gatewayBilling!, children: page },
  });
  bridge.turnSummary = read;
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.read().turnSummary).toEqual(detail));
  await controller.readGatewayChildBilling(latest.turnId, "next");
  expect(read.mock.calls[1]?.[3]).toEqual(cursor);
  expect(controller.read().gatewayChildPage.hasPrevious).toBe(true);
  await controller.refreshGatewayBilling(latest.turnId, {
    ...attempt,
    child: { ...child, inputId: "other" },
  });
  expect(read).toHaveBeenCalledTimes(2);
  const settled = {
    ...attempt,
    kind: "settled",
    chargedMills: "0",
    refreshable: false,
  } as const;
  read.mockResolvedValueOnce({
    ...detail,
    gatewayBilling: {
      ...detail.gatewayBilling!,
      children: {
        ...page,
        assignments: [
          {
            ...page.assignments[0],
            billing: { attempts: [settled], omittedAttempts: 0 },
          },
        ],
      },
    },
  });
  await controller.refreshGatewayBilling(latest.turnId, { ...attempt, child });
  expect(read.mock.calls[2]?.slice(2)).toEqual([{ ...attempt, child }, cursor]);
  expect(controller.read().turnSummary?.gatewayBilling?.attempts).toEqual([
    pending,
  ]);
  expect(
    controller.read().turnSummary?.gatewayBilling?.children?.assignments[0]
      ?.billing?.attempts
  ).toEqual([settled]);
  const late = Promise.withResolvers<NativeChatTurnSummary>();
  read.mockReturnValueOnce(late.promise);
  const loading = controller.readGatewayChildBilling(latest.turnId, "first");
  await controller.select("chat-b");
  late.resolve(detail);
  await loading;
  expect(controller.read().turnSummary).toBeNull();
  expect(controller.read().gatewayChildPage.status).toBe("idle");
  controller.disconnect();
});

it("reads a listed PNG on demand and discards its bytes after switching chats", async () => {
  const { bridge, controller } = fixture();
  const latest = {
    turnId: "crop-turn",
    epoch: 1,
    journalPosition: 8,
    historyPosition: 2,
    controlRevision: 1,
    paused: false,
    cancelled: false,
    disposition: "settled",
    status: "succeeded",
  } as const;
  const observe = bridge.observe;
  vi.spyOn(bridge, "observe").mockImplementation(async (id) => {
    const observed = await observe(id);
    return {
      ...observed,
      snapshot: {
        ...observed.snapshot,
        latest: id === "chat-a" ? latest : null,
      },
    };
  });
  const data = new Uint8Array([1, 2, 3]).buffer;
  const artifact = {
    id: "crop",
    kind: "image",
    mimeType: "image/png",
    label: "Cropped PNG",
    width: 1,
    height: 2,
    bytes: data.byteLength,
  } as const;
  bridge.turnSummary = async () => ({
    turnId: latest.turnId,
    status: latest.status,
    text: "Cropped.",
    textTruncated: false,
    steps: 2,
    unresolvedOperations: 0,
    toolActivity: null,
    checks: [],
    artifacts: [artifact],
  });
  const read = vi.fn<NonNullable<DesktopNativeChat["readArtifact"]>>();
  bridge.readArtifact = read;
  read.mockResolvedValueOnce(data);
  await controller.select("chat-a");
  expect(read).not.toHaveBeenCalled();
  await expect(
    controller.readTurnArtifact(latest.turnId, "other")
  ).rejects.toThrow("native_chat_artifact_unavailable");
  expect(read).not.toHaveBeenCalled();
  const image = await controller.readTurnArtifact(latest.turnId, artifact.id);
  expect(image.type).toBe("image/png");
  expect(await image.arrayBuffer()).toEqual(data);
  expect(read).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    "observation-chat-a",
    artifact.id
  );
  expect(controller.canSaveTurnArtifact).toBe(false);
  const save = vi.fn<NonNullable<DesktopNativeChat["saveArtifact"]>>();
  bridge.saveArtifact = save;
  expect(controller.canSaveTurnArtifact).toBe(true);
  save.mockResolvedValueOnce("failed").mockResolvedValueOnce("saved");
  await expect(
    controller.saveTurnArtifact(latest.turnId, artifact.id)
  ).resolves.toBe("failed");
  await expect(
    controller.saveTurnArtifact(latest.turnId, artifact.id)
  ).resolves.toBe("saved");
  expect(save.mock.calls).toEqual([
    ["chat-a", "observation-chat-a", artifact.id],
    ["chat-a", "observation-chat-a", artifact.id],
  ]);

  const late = Promise.withResolvers<ArrayBuffer>();
  const lateSave = Promise.withResolvers<"saved">();
  save.mockReturnValueOnce(lateSave.promise);
  const saving = controller.saveTurnArtifact(latest.turnId, artifact.id);
  read.mockReturnValueOnce(late.promise);
  const preview = controller.readTurnArtifact(latest.turnId, artifact.id);
  await controller.select("chat-b");
  late.resolve(data);
  lateSave.resolve("saved");
  await expect(preview).rejects.toThrow("native_chat_artifact_unavailable");
  await expect(saving).rejects.toThrow("native_chat_artifact_unavailable");
  controller.disconnect();
});

it("keeps Plan and an attachment with each chat's draft across reattachment", async () => {
  const { bridge, controller } = fixture();
  bridge.acceptsPng = async () => true;
  bridge.submitImage = vi.fn<NonNullable<DesktopNativeChat["submitImage"]>>();
  bridge.submitInRegime =
    vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>();
  const blobs = new Map<string, ComposerDraftAttachment>();
  const drafts = new ComposerDrafts(null, {
    get: async (key) => blobs.get(key) ?? null,
    put: async (key, value) => void blobs.set(key, value),
    delete: async (key) => void blobs.delete(key),
  });
  controller.keepDrafts(drafts, "workspace");
  await controller.select("chat-a");
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
  await controller.pickAttachment(controller.read().scope, "png", {
    name: "sketch.png",
    size: png.byteLength,
    arrayBuffer: async () => png,
  });
  controller.selectOperatingRegime("plan");
  await vi.waitFor(() => expect(blobs.has("workspace:chat-a")).toBe(true));

  // Another chat starts from its own, empty draft.
  await controller.select("chat-b");
  await vi.waitFor(() => expect(controller.read().loading).toBe(false));
  expect(controller.read().attachmentDraft).toBeNull();

  // Returning restores exactly what was left.
  await controller.select("chat-a");
  await vi.waitFor(() =>
    expect(controller.read().attachmentDraft?.name).toBe("sketch.png")
  );
  expect(controller.read().operatingRegime).toBe("plan");

  // Removing it is the person's choice and forgets it.
  controller.removeAttachment(controller.read().scope);
  await vi.waitFor(() => expect(blobs.has("workspace:chat-a")).toBe(false));
  controller.disconnect();
});

it("keeps PNG retries exact and drops replaced or navigated file reads", async () => {
  const { bridge, controller, running } = fixture();
  const textSend = vi.spyOn(bridge, "submit");
  const send = vi.fn<NonNullable<DesktopNativeChat["submitImage"]>>(
    async (sessionId, input) => ({
      sessionId,
      inputId: input.inputId,
      inputPosition: 2,
      turnId: null,
      disposition: "queued",
    })
  );
  send.mockRejectedValueOnce(new Error("fixture lost image acknowledgement"));
  bridge.acceptsPng = async () => true;
  bridge.submitImage = send;
  bridge.submitInRegime =
    vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>();
  bridge.enqueue = async (id, inputId, text) =>
    bridge.submit(id, inputId, text);
  running.add("chat-a");
  await controller.select("chat-a");
  expect(controller.canAttach("png")).toBe(true);
  const scope = controller.read().scope;
  const previous = Promise.withResolvers<ArrayBuffer>();
  const first = controller.pickAttachment(scope, "png", {
    name: "chosen.png",
    size: 8,
    arrayBuffer: () => previous.promise,
  });
  expect(controller.canSubmit).toBe(false);
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
  await controller.pickAttachment(scope, "png", {
    name: "chosen.png",
    size: png.byteLength,
    arrayBuffer: async () => png,
  });
  previous.resolve(new ArrayBuffer(8));
  await first;
  expect(controller.read().attachmentDraft?.name).toBe("chosen.png");
  await expect(controller.submit(" ")).rejects.toThrow("native_chat_not_ready");
  expect(send).not.toHaveBeenCalled();
  await expect(controller.submit("Describe it.")).rejects.toThrow(
    "fixture lost image acknowledgement"
  );
  expect(controller.read().attachmentDraft?.name).toBe("chosen.png");
  controller.selectOperatingRegime("plan");
  await expect(controller.submit("Describe it.")).rejects.toThrow(
    "native_chat_pending_regime_changed"
  );
  expect(send).toHaveBeenCalledTimes(1);
  controller.selectOperatingRegime("act");
  await controller.pickAttachment(scope, "png", {
    name: "same-bytes.png",
    size: png.byteLength,
    arrayBuffer: async () => png.slice(0),
  });
  await controller.submit("Describe it.");
  expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  expect(send.mock.calls[1]).toEqual([
    "chat-a",
    {
      action: "enqueue",
      inputId: expect.any(String),
      text: "Describe it.",
      png,
      operatingRegime: "act",
    },
  ]);
  expect(controller.read().attachmentDraft).toBeNull();
  expect(textSend).not.toHaveBeenCalled();

  const late = Promise.withResolvers<ArrayBuffer>();
  const reading = controller.pickAttachment(scope, "png", {
    name: "stale.png",
    size: png.byteLength,
    arrayBuffer: () => late.promise,
  });
  await controller.select("chat-b");
  late.resolve(png);
  await reading;
  await controller.pickAttachment(scope, "png", {
    name: "old-chooser.png",
    size: png.byteLength,
    arrayBuffer: async () => png,
  });
  expect(controller.read().attachmentDraft).toBeNull();
  expect(controller.read().attachmentReading).toBe(false);
  controller.disconnect();
});

it("uses the latest same-named PNG and blocks a failed replacement", async () => {
  const { bridge, controller } = fixture();
  const send = vi.fn<NonNullable<DesktopNativeChat["submitImage"]>>(
    async (sessionId, input) =>
      bridge.submit(sessionId, input.inputId, input.text)
  );
  const textSend = vi.spyOn(bridge, "submit");
  bridge.acceptsPng = async () => true;
  bridge.submitImage = send;
  await controller.select("chat-a");
  const scope = controller.read().scope;
  const png = (pixel: number) => new Uint8Array([137, pixel]).buffer;
  const choose = (bytes: ArrayBuffer) =>
    controller.pickAttachment(scope, "png", {
      name: "same.png",
      size: bytes.byteLength,
      arrayBuffer: async () => bytes,
    });
  const first = png(1);
  const second = png(2);
  await choose(first);
  send.mockRejectedValueOnce(new Error("fixture lost image acknowledgement"));
  await expect(controller.submit("Describe it.")).rejects.toThrow(
    "fixture lost image acknowledgement"
  );
  await controller.pickAttachment(scope, "png", {
    name: "same.png",
    size: second.byteLength,
    arrayBuffer: async () => {
      throw new Error("fixture read failure");
    },
  });
  expect(controller.read().attachmentDraft).toMatchObject({
    name: "same.png",
    error: "Couldn't read the selected PNG.",
  });
  expect(controller.canSubmit).toBe(false);
  await expect(controller.submit("Describe it.")).rejects.toThrow(
    "native_chat_not_ready"
  );
  expect(send).toHaveBeenCalledTimes(1);
  expect(textSend).not.toHaveBeenCalled();

  await choose(second);
  await controller.submit("Describe it.");
  expect(send.mock.calls[0]?.[1].png).toBe(first);
  expect(send.mock.calls[1]?.[1].png).toBe(second);
  expect(send.mock.calls[0]?.[1].inputId).not.toBe(
    send.mock.calls[1]?.[1].inputId
  );
  controller.disconnect();
});

it("keeps an attached file and its input identity through an unconfirmed queued send", async () => {
  const { bridge, controller, running } = fixture();
  const sendText = vi.spyOn(bridge, "submit");
  bridge.enqueue = async (id, inputId, text) =>
    bridge.submit(id, inputId, text);
  bridge.acceptsPng = async () => false;
  let fileAvailable = true;
  bridge.acceptsFile = async () => fileAvailable;
  const sendFile = vi.fn<NonNullable<DesktopNativeChat["submitFile"]>>(
    async (sessionId, input) => ({
      sessionId,
      inputId: input.inputId,
      inputPosition: 1,
      turnId: null,
      disposition: "queued",
    })
  );
  bridge.submitFile = sendFile;
  running.add("chat-a");
  await controller.select("chat-a");
  expect(controller.canAttach("file")).toBe(true);
  expect(controller.canAttach("png")).toBe(false);
  const scope = controller.read().scope;
  const bytes = new Uint8Array([1, 3, 7]).buffer;
  const pick = () =>
    controller.pickTransferredAttachment(scope, [
      {
        kind: "file",
        file: {
          name: "record.bin",
          type: "application/octet-stream",
          size: bytes.byteLength,
          arrayBuffer: async () => bytes.slice(0),
        },
      },
    ]);
  await pick();
  sendFile.mockRejectedValueOnce(new Error("lost selected-file reply"));
  await expect(controller.submit("Inspect this file.")).rejects.toThrow(
    "lost selected-file reply"
  );
  fileAvailable = false;
  await expect(controller.submit("Inspect this file.")).rejects.toThrow(
    "file_attachment_unavailable"
  );
  expect(controller.read().attachmentDraft).toMatchObject({
    kind: "file",
    name: "record.bin",
  });
  expect(sendFile).toHaveBeenCalledTimes(1);
  fileAvailable = true;
  await controller.submit("Inspect this file.");
  expect(sendFile.mock.calls[0]).toEqual(sendFile.mock.calls[1]);
  expect(sendFile.mock.calls[1]).toEqual([
    "chat-a",
    {
      action: "enqueue",
      inputId: expect.any(String),
      text: "Inspect this file.",
      name: "record.bin",
      bytes,
      operatingRegime: "act",
    },
  ]);
  expect(sendText).not.toHaveBeenCalled();
  expect(controller.read().attachmentDraft).toBeNull();
  controller.disconnect();
});

it("keeps one selected file when a transfer is rejected and replaces it with a PNG explicitly", async () => {
  const { bridge, controller } = fixture();
  bridge.acceptsFile = async () => true;
  bridge.acceptsPng = async () => true;
  const sendFile = vi.fn<NonNullable<DesktopNativeChat["submitFile"]>>(
    (sessionId, input) => bridge.submit(sessionId, input.inputId, input.text)
  );
  const sendImage = vi.fn<NonNullable<DesktopNativeChat["submitImage"]>>(
    (sessionId, input) => bridge.submit(sessionId, input.inputId, input.text)
  );
  bridge.submitFile = sendFile;
  bridge.submitImage = sendImage;
  await controller.select("chat-a");
  const scope = controller.read().scope;
  const file = (name: string, type: string) => ({
    kind: "file" as const,
    file: {
      name,
      type,
      size: 8,
      arrayBuffer: vi.fn<() => Promise<ArrayBuffer>>(
        async () => new Uint8Array(8).buffer
      ),
    },
  });
  const svg = file("drawing.svg", "image/svg+xml");
  const jpeg = file("reference.jpg", "image/jpeg");
  await controller.pickTransferredAttachment(scope, [svg]);
  expect(controller.read().attachmentDraft).toMatchObject({
    kind: "file",
    name: "drawing.svg",
  });
  await controller.pickTransferredAttachment(scope, [svg, jpeg]);
  expect(controller.read().attachmentNotice).toBe("Attach one file at a time.");
  await controller.pickTransferredAttachment(scope, [{ kind: "directory" }]);
  expect(controller.read().attachmentNotice).toBe(
    "Choose a file instead of a folder."
  );
  await controller.pickTransferredAttachment(scope, [jpeg]);
  expect(controller.read()).toMatchObject({
    attachmentNotice: "Use a PNG to send an image to this chat.",
    attachmentDraft: { kind: "file", name: "drawing.svg" },
  });
  expect(jpeg.file.arrayBuffer).not.toHaveBeenCalled();
  expect(svg.file.arrayBuffer).toHaveBeenCalledTimes(1);

  const png = file("Clipboard image", "image/png");
  await controller.pickTransferredAttachment(scope, [png]);
  expect(controller.read()).toMatchObject({
    attachmentNotice: null,
    attachmentDraft: { kind: "png", name: "Clipboard image" },
  });
  await controller.submit("Describe the selected image.");
  expect(sendImage.mock.calls[0]?.[1]).toMatchObject({
    text: "Describe the selected image.",
    png: await png.file.arrayBuffer.mock.results[0].value,
  });
  expect(sendFile).not.toHaveBeenCalled();
  expect(controller.read().attachmentDraft).toBeNull();
  controller.disconnect();
});

it("preserves an existing attachment on Library failure and submits only captured PNG bytes", async () => {
  const { bridge, controller } = fixture();
  let pngAvailable = false;
  bridge.acceptsPng = async () => pngAvailable;
  bridge.acceptsFile = async () => true;
  bridge.submitFile = vi.fn<NonNullable<DesktopNativeChat["submitFile"]>>();
  const submitImage = vi.fn<NonNullable<DesktopNativeChat["submitImage"]>>(
    (sessionId, input) => bridge.submit(sessionId, input.inputId, input.text)
  );
  bridge.submitImage = submitImage;
  await controller.select("chat-a");
  const scope = controller.read().scope;
  const bytes = Uint8Array.of(137, 80, 78, 71).buffer;
  const available = vi.fn<(limit: number) => Promise<ArrayBuffer>>(
    async () => bytes
  );
  await controller.pickLibraryImage(scope, "Library: Cedar", available);
  expect(available).not.toHaveBeenCalled();

  pngAvailable = true;
  await controller.repair();
  await controller.pickAttachment(scope, "file", {
    name: "current.txt",
    size: 1,
    arrayBuffer: async () => Uint8Array.of(1).buffer,
  });
  const unavailable = Promise.withResolvers<ArrayBuffer>();
  const loading = controller.pickLibraryImage(
    scope,
    "Library: Cedar",
    () => unavailable.promise
  );
  expect(controller.canSubmit).toBe(false);
  unavailable.reject(new Error("fixture Library object unavailable"));
  await loading;
  expect(controller.read()).toMatchObject({
    attachmentDraft: { name: "current.txt", kind: "file" },
    attachmentNotice:
      "Couldn't add this Library image. Your current draft is still here.",
    attachmentReading: false,
  });
  expect(controller.canSubmit).toBe(true);

  await controller.pickLibraryImage(scope, "Library: Cedar", available);
  expect(available).toHaveBeenCalledExactlyOnceWith(256 * 1024);
  expect(controller.read()).toMatchObject({
    attachmentDraft: { name: "Library: Cedar", kind: "png" },
    attachmentNotice: null,
  });
  await controller.submit("Use this reference.");
  expect(submitImage).toHaveBeenCalledExactlyOnceWith("chat-a", {
    action: "submit",
    inputId: expect.any(String),
    text: "Use this reference.",
    png: bytes,
    operatingRegime: "act",
  });
  expect(bridge.submitFile).not.toHaveBeenCalled();

  const late = Promise.withResolvers<ArrayBuffer>();
  const oldSelection = controller.pickLibraryImage(
    scope,
    "Library: Late",
    () => late.promise
  );
  await controller.select("chat-b");
  late.resolve(bytes);
  await oldSelection;
  expect(controller.read().attachmentDraft).toBeNull();
  controller.disconnect();
});

it("rechecks PNG capability before sending and only looks up an exact existing receipt after capability loss", async () => {
  const { bridge, controller } = fixture();
  let supportsPng = true;
  const normal = vi.spyOn(bridge, "submit");
  const receipt = vi.spyOn(bridge, "inputReceipt");
  const send = vi.fn<NonNullable<DesktopNativeChat["submitImage"]>>();
  bridge.acceptsPng = async () => supportsPng;
  bridge.submitImage = send;
  await controller.select("chat-a");
  const scope = controller.read().scope;
  await controller.pickAttachment(scope, "png", {
    name: "chosen.png",
    size: 8,
    arrayBuffer: async () => new ArrayBuffer(8),
  });
  supportsPng = false;
  await expect(controller.submit("Describe it.")).rejects.toThrow(
    "image_input_unavailable"
  );
  expect(controller.read()).toMatchObject({
    imageInput: false,
    attachmentDraft: { name: "chosen.png" },
  });
  expect(controller.canSubmit).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(receipt).not.toHaveBeenCalled();

  supportsPng = true;
  await controller.repair();
  send.mockRejectedValueOnce(new Error("fixture lost image acknowledgement"));
  await expect(controller.submit("Describe it.")).rejects.toThrow(
    "fixture lost image acknowledgement"
  );
  const inputId = send.mock.calls[0]![1].inputId;
  expect(receipt).toHaveBeenLastCalledWith("chat-a", inputId);

  supportsPng = false;
  await controller.repair();
  expect(controller.read().imageInput).toBe(false);
  receipt.mockResolvedValueOnce({
    sessionId: "chat-a",
    inputId,
    disposition: "queued",
    inputPosition: 1,
    turnId: null,
  });
  await controller.submit("Describe it.");
  expect(send).toHaveBeenCalledTimes(1);
  expect(receipt.mock.calls).toEqual([
    ["chat-a", inputId],
    ["chat-a", inputId],
  ]);
  expect(normal).not.toHaveBeenCalled();
  expect(controller.read().attachmentDraft).toBeNull();
  controller.disconnect();
});

it("ignores an older PNG capability result after a newer refresh", async () => {
  const { bridge, controller } = fixture();
  const capability = vi.fn<NonNullable<DesktopNativeChat["acceptsPng"]>>();
  bridge.acceptsPng = capability.mockResolvedValue(true);
  bridge.submitImage = vi.fn<NonNullable<DesktopNativeChat["submitImage"]>>();
  await controller.select("chat-a");
  const old = Promise.withResolvers<boolean>();
  capability.mockReturnValueOnce(old.promise).mockResolvedValueOnce(false);
  const refresh = controller.repair();
  await vi.waitFor(() => expect(capability).toHaveBeenCalledTimes(2));
  await controller.repair();
  old.resolve(true);
  await refresh;
  expect(controller.read().imageInput).toBe(false);
  controller.disconnect();
});

it("keeps reviewed configuration separate from normal and Plan sends", async () => {
  const { bridge, controller } = fixture();
  let value: number | null = 4096;
  let exactCounting = false;
  bridge.contextLimit = async () => ({
    reviewId: "config-basis",
    limit: value,
    exactCounting,
    source: "active",
  });
  const save = vi.fn<NonNullable<DesktopNativeChat["saveContextLimit"]>>(
    async (_id, limit) => {
      value = limit;
      return { limit, disposition: "applied" };
    }
  );
  const normal = vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
    async (_mode, attachment, id, text) => bridge.submit(attachment, id, text)
  );
  const reviewed = vi.fn<
    NonNullable<DesktopNativeChat["submitWithConfigurationReview"]>
  >(async (attachment, input) =>
    bridge.submit(attachment, input.inputId, input.text)
  );
  bridge.saveContextLimit = save;
  bridge.submitInRegime = normal;
  bridge.submitWithConfigurationReview = reviewed;
  await controller.select("chat-a");
  await controller.toggleContextLimit();
  expect(controller.read().contextLimit?.limit).toBe(4096);
  expect(controller.canReviewConfiguration).toBe(false);
  controller.changeContextLimitDraft("8192");
  await controller.saveContextLimit();
  expect(save).not.toHaveBeenCalled();
  await controller.saveContextLimit(true);
  expect(save).toHaveBeenCalledExactlyOnceWith("config-basis", null);

  exactCounting = true;
  await controller.refreshContextLimit();
  controller.changeContextLimitDraft("64000");
  await controller.saveContextLimit();
  expect(save).toHaveBeenLastCalledWith("config-basis", 64000);
  controller.selectOperatingRegime("plan");
  controller.setConfigurationReview(true);
  await controller.submit("Explain the limit.");
  expect(reviewed).not.toHaveBeenCalled();
  expect(normal).toHaveBeenCalledExactlyOnceWith(
    "submit",
    "chat-a",
    expect.any(String),
    "Explain the limit.",
    "plan"
  );
  controller.selectOperatingRegime("act");
  controller.setConfigurationReview(true);
  reviewed.mockRejectedValueOnce(new Error("fixture lost review reply"));
  await expect(
    controller.submit("Use Automatic for future messages.")
  ).rejects.toThrow("fixture lost review reply");
  controller.setConfigurationReview(false);
  await expect(
    controller.submit("Use Automatic for future messages.")
  ).rejects.toThrow("native_context_limit_pending_review_changed");
  controller.setConfigurationReview(true);
  await controller.submit("Use Automatic for future messages.");
  expect(reviewed.mock.calls[0]).toEqual(reviewed.mock.calls[1]);
  expect(controller.read().reviewConfiguration).toBe(false);
  expect(normal).toHaveBeenCalledTimes(1);
  controller.disconnect();
});

it("captures effort separately from Plan or Act and preserves it across a lost send", async () => {
  const { bridge, controller, running } = fixture();
  let effortAvailable = true;
  bridge.acceptsEffort = async () => effortAvailable;
  bridge.enqueue = (attachment, id, text) =>
    bridge.submit(attachment, id, text);
  const send = vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
    async (_action, attachment, id, text) => bridge.submit(attachment, id, text)
  );
  send.mockRejectedValueOnce(new Error("fixture lost send"));
  bridge.submitInRegime = send;
  running.add("chat-a");
  await controller.select("chat-a");
  expect(controller.read().effortAvailable).toBe(true);
  controller.selectEffort("ultra");
  controller.selectOperatingRegime("plan");
  await expect(controller.submit("Review this plan.")).rejects.toThrow(
    "fixture lost send"
  );
  controller.selectEffort("medium");
  await expect(controller.submit("Review this plan.")).rejects.toThrow(
    "native_chat_pending_effort_changed"
  );
  controller.selectEffort("ultra");
  await controller.submit("Review this plan.");
  expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  expect(send.mock.calls[1]).toEqual([
    "enqueue",
    "chat-a",
    expect.any(String),
    "Review this plan.",
    "plan",
    "ultra",
  ]);
  effortAvailable = false;
  await controller.select("chat-b");
  controller.selectEffort("ultra");
  expect(controller.read()).toMatchObject({
    effortAvailable: false,
    effort: "medium",
  });
  await controller.submit("Send on the earlier connection.");
  expect(send.mock.calls[2]).toEqual([
    "submit",
    "chat-b",
    expect.any(String),
    "Send on the earlier connection.",
    "act",
  ]);
  // Reasoning levels need no extended harness.
  controller.selectEffort("high");
  expect(controller.read().effort).toBe("high");
  await controller.submit("Think harder.");
  expect(send.mock.calls[3]).toEqual([
    "submit",
    "chat-b",
    expect.any(String),
    "Think harder.",
    "act",
    "high",
  ]);
  controller.disconnect();
});

it.each([
  ["native-unavailable", "native-unavailable"],
  ["native-provider-key-required", "native-provider-key-required"],
  ["native-gateway-unavailable", "native-gateway-unavailable"],
  ["native-provider-model-unavailable", "native-provider-model-unavailable"],
  [
    "native-provider-endpoint-https-required",
    "native-provider-endpoint-https-required",
  ],
  [
    "native-provider-endpoint-approval-required",
    "native-provider-endpoint-approval-required",
  ],
  ["legacy", "native-unavailable"],
  ["native-future-status", "native-unavailable"],
] as const)(
  "keeps native mode when startup returns %s",
  async (result, expected) => {
    const { bridge } = fixture();
    const availability = vi.spyOn(bridge, "available");
    const publish = vi.fn<(state: string | null) => void>();
    const status = vi.fn<NonNullable<DesktopNativeChat["status"]>>();
    status
      .mockResolvedValueOnce("native-starting")
      .mockResolvedValueOnce(result as Awaited<ReturnType<typeof status>>);
    const stop = NativeChatController.watchReadiness(
      { ...bridge, status },
      publish
    );
    await vi.waitFor(() => {
      expect(publish.mock.calls).toEqual([["native-starting"], [expected]]);
    });
    expect(status.mock.calls).toEqual([[], [true]]);
    expect(availability).not.toHaveBeenCalled();
    stop();
  }
);

it("keeps the old bridge's legacy selection and drops a disposed startup reply", async () => {
  const { bridge } = fixture();
  const publish = vi.fn<(state: string | null) => void>();
  vi.spyOn(bridge, "available").mockResolvedValue(false);
  const stopLegacy = NativeChatController.watchReadiness(bridge, publish);
  await vi.waitFor(() =>
    expect(publish).toHaveBeenCalledExactlyOnceWith("legacy")
  );
  stopLegacy();
  publish.mockClear();

  const started = Promise.withResolvers<"native-ready">();
  const status = vi.fn<NonNullable<DesktopNativeChat["status"]>>();
  status
    .mockResolvedValueOnce("native-starting")
    .mockReturnValueOnce(started.promise);
  const stopNative = NativeChatController.watchReadiness(
    { ...bridge, status },
    publish
  );
  await vi.waitFor(() => expect(status).toHaveBeenCalledTimes(2));
  stopNative();
  started.resolve("native-ready");
  await started.promise;
  expect(publish).toHaveBeenCalledExactlyOnceWith("native-starting");
});

it("uses catalog membership, retains an exact rename draft on conflict, and ignores a retired mutation reply", async () => {
  const { bridge, running, transcripts } = fixture();
  const entries = new Map<string, NativeChatCatalogEntry>([
    [
      "chat-a",
      { sessionId: "chat-a", revision: 1, title: "First", archived: false },
    ],
    [
      "chat-b",
      {
        sessionId: "chat-b",
        revision: 1,
        title: "Saved archive",
        archived: true,
      },
    ],
  ]);
  const listing = (archived: boolean) => ({
    sessionIds: [...entries.values()]
      .filter((entry) => entry.archived === archived)
      .map((entry) => entry.sessionId),
    nextCursor: null,
  });
  const list = vi.fn<DesktopNativeChat["list"]>(async () => listing(false));
  bridge.list = list;
  bridge.listArchived = async () => listing(true);
  bridge.catalogEntry = async (sessionId) => entries.get(sessionId)!;
  const organize = vi.fn<NonNullable<DesktopNativeChat["organize"]>>(
    async (sessionId, change) => {
      const current = entries.get(sessionId)!;
      if (change.revision !== current.revision)
        throw new Error("session_catalog_revision_changed");
      const next = { ...change, sessionId, revision: current.revision + 1 };
      entries.set(sessionId, next);
      return next;
    }
  );
  bridge.organize = organize;
  const memory = {
    getItem: () =>
      JSON.stringify({ selected: "chat-a", sessions: ["chat-b", "chat-a"] }),
    setItem: () => {},
  };
  const controller = new NativeChatController(bridge, memory, "fixture");
  running.add("chat-a");
  transcripts.set("chat-a", [
    { messageId: "kept", role: "user", text: "Working request." },
  ]);
  controller.connect(null);
  await vi.waitFor(() =>
    expect(controller.read().catalogEntry?.title).toBe("First")
  );
  expect(controller.read().sessions).toEqual(["chat-a"]);
  controller.beginRename();
  controller.changeTitle("My rename");
  entries.set("chat-a", {
    ...entries.get("chat-a")!,
    revision: 2,
    title: "Changed elsewhere",
  });
  await controller.saveTitle();
  expect(controller.chatTitle("chat-a")).toBe("Changed elsewhere");
  expect(controller.read().catalogDraft?.text).toBe("My rename");
  expect(organize).toHaveBeenCalledExactlyOnceWith("chat-a", {
    revision: 1,
    title: "My rename",
    archived: false,
  });
  await controller.saveTitle();
  expect(controller.chatTitle("chat-a")).toBe("My rename");
  expect(organize).toHaveBeenLastCalledWith("chat-a", {
    revision: 2,
    title: "My rename",
    archived: false,
  });
  const stalePage = Promise.withResolvers<NativeChatPage>();
  list.mockReturnValueOnce(stalePage.promise);
  const refresh = controller.listChats();
  await vi.waitFor(() =>
    expect(list.mock.results.at(-1)?.value).toBe(stalePage.promise)
  );
  await controller.setChatArchived(true);
  stalePage.resolve({ sessionIds: ["chat-a"], nextCursor: null });
  await refresh;
  expect(controller.read().sessions).not.toContain("chat-a");
  expect(controller.read().selected).toBe("chat-a");
  expect(controller.read().observation?.snapshot.current?.turnId).toBe(
    "turn-chat-a"
  );
  expect(controller.read().messages[0]?.text).toBe("Working request.");
  await controller.listChats(null, true);
  expect(controller.read().sessions).toContain("chat-a");

  const late = Promise.withResolvers<NativeChatCatalogEntry>();
  organize.mockReturnValueOnce(late.promise);
  const restore = controller.setChatArchived(false);
  await controller.select("chat-b");
  late.resolve({ ...entries.get("chat-a")!, archived: false });
  await restore;
  expect(controller.read().catalogEntry).toMatchObject({
    sessionId: "chat-b",
    title: "Saved archive",
    archived: true,
  });
  controller.disconnect();
});

it("picks up the title the host writes for an untitled chat as its turn settles", async () => {
  const { bridge, running, transcripts } = fixture();
  let entry: NativeChatCatalogEntry = {
    sessionId: "chat-a",
    revision: 0,
    title: null,
    archived: false,
  };
  const read = vi.fn(async () => entry);
  bridge.catalogEntry = read;
  bridge.organize = async (sessionId, change) => ({ sessionId, ...change });
  bridge.listArchived = async () => ({ sessionIds: [], nextCursor: null });
  running.add("chat-a");
  transcripts.set("chat-a", [
    { messageId: "first", role: "user", text: "Plan the spring launch kit." },
  ]);
  await controller_select(bridge, "chat-a", async (controller) => {
    await vi.waitFor(() =>
      expect(controller.read().catalogEntry).toMatchObject({ title: null })
    );
    // The fallback is the first request's first line.
    expect(controller.chatTitle("chat-a")).toBe("Plan the spring launch kit.");
    entry = { ...entry, revision: 1, title: "Spring launch kit" };
    running.delete("chat-a");
    await vi.waitFor(
      () => expect(controller.chatTitle("chat-a")).toBe("Spring launch kit"),
      { timeout: 3_000 }
    );
    // A rename in progress is never replaced by the background title.
    controller.beginRename();
    controller.changeTitle("Mine");
    entry = { ...entry, revision: 2, title: "Other" };
    expect(controller.read().catalogDraft?.text).toBe("Mine");
  });
});

async function controller_select(
  bridge: DesktopNativeChat,
  sessionId: string,
  body: (controller: NativeChatController) => Promise<void>
) {
  const controller = new NativeChatController(
    bridge,
    { getItem: () => null, setItem: () => {} },
    "fixture"
  );
  controller.connect(null);
  try {
    await controller.select(sessionId);
    await body(controller);
  } finally {
    controller.disconnect();
  }
}

it("browses saved pages without opening a chat until it is selected", async () => {
  const { bridge } = fixture();
  const load = vi.spyOn(bridge, "load");
  const create = vi.spyOn(bridge, "create");
  const list = vi
    .spyOn(bridge, "list")
    .mockImplementation(async (cursor) =>
      cursor === "older"
        ? { sessionIds: ["old"], nextCursor: null }
        : { sessionIds: ["newest"], nextCursor: "older" }
    );
  const storage = {
    getItem: () => JSON.stringify({ selected: null, sessions: ["recent"] }),
    setItem: vi.fn<Storage["setItem"]>(),
  };
  const controller = new NativeChatController(bridge, storage, "fixture");
  controller.connect(null);
  await vi.waitFor(() => {
    expect(controller.read().sessions).toEqual(["recent", "newest"]);
    expect(controller.read().catalogLoading).toBe(false);
  });
  await controller.listChats(controller.read().nextCatalogCursor);
  expect(list.mock.calls).toEqual([[null], ["older"]]);
  expect(controller.read().sessions).toEqual(["recent", "old"]);
  expect(controller.read().selected).toBeNull();
  expect(load).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();

  await controller.select("old");
  expect(load).toHaveBeenCalledExactlyOnceWith("old");
  await controller.listChats();
  expect(controller.read().sessions).toEqual(["old", "recent", "newest"]);
  expect(storage.setItem).toHaveBeenLastCalledWith(
    "fixture",
    JSON.stringify({ selected: "old", sessions: ["old", "recent"] })
  );
  controller.disconnect();
});

it("drops an obsolete page and serializes the next connection's request", async () => {
  const { bridge, controller } = fixture();
  const old =
    Promise.withResolvers<Awaited<ReturnType<DesktopNativeChat["list"]>>>();
  const list = vi
    .spyOn(bridge, "list")
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({ sessionIds: ["current"], nextCursor: null });
  controller.connect(null);
  await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  controller.disconnect();
  controller.connect(null);
  expect(list).toHaveBeenCalledTimes(1);
  old.resolve({ sessionIds: ["obsolete"], nextCursor: "obsolete-cursor" });
  await vi.waitFor(() => {
    expect(controller.read().sessions).toEqual(["current"]);
    expect(controller.read().nextCatalogCursor).toBeNull();
  });
  expect(list).toHaveBeenCalledTimes(2);
  controller.disconnect();
});

function text(
  id: string,
  content: string,
  offsetBytes: number,
  replace = false
): NativeChatUpdate {
  return {
    kind: "text",
    role: "assistant",
    messageId: `message-${id}`,
    turnId: `turn-${id}`,
    text: content,
    offsetBytes,
    replace,
  };
}

function message(id: string, content: string): NativeChatMessage {
  return { messageId: `message-${id}`, role: "assistant", text: content };
}

describe("Native workspace chat controller", () => {
  it("preserves the selected PNG when a different model is chosen", async () => {
    const { bridge, controller } = fixture();
    const id = "b".repeat(64);
    const choose = vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
      async () => {}
    );
    bridge.selectProfile = choose;
    bridge.acceptsPng = async () => true;
    const send = vi.fn<NonNullable<DesktopNativeChat["submitImage"]>>(
      async (sessionId, input) =>
        bridge.submit(sessionId, input.inputId, input.text)
    );
    bridge.submitImage = send;
    const read = Promise.withResolvers<ArrayBuffer>();
    const png = new Uint8Array([137, 1]).buffer;
    try {
      controller.connect("chat-a");
      await vi.waitFor(() => expect(controller.read().imageInput).toBe(true));
      const scope = controller.read().scope;
      const picking = controller.pickAttachment(scope, "png", {
        name: "selected.png",
        size: png.byteLength,
        arrayBuffer: () => read.promise,
      });
      await controller.selectProfile({ kind: "new", id });
      expect(choose).not.toHaveBeenCalled();
      expect(controller.read().profileError).toContain("Send or remove");
      read.resolve(png);
      await picking;
      await controller.selectProfile({ kind: "new", id });
      expect(choose).not.toHaveBeenCalled();
      expect(controller.read().scope).toBe(scope);
      expect(controller.read().attachmentDraft).toMatchObject({
        name: "selected.png",
      });
      await controller.submit("Describe the selected image.", scope);
      expect(send).toHaveBeenCalledExactlyOnceWith(
        "chat-a",
        expect.objectContaining({ png })
      );
      await controller.selectProfile({ kind: "new", id });
      expect(choose).toHaveBeenCalledExactlyOnceWith({ kind: "new", id });
      expect(controller.read().profileError).toBeNull();
    } finally {
      read.resolve(png);
      controller.disconnect();
    }
  });

  it("keeps the open chat and chat list when the model changes between turns", async () => {
    const { bridge, running, controller, transcripts } = fixture();
    let profile: string | null = null;
    const id = "b".repeat(64);
    const choices: NativeChatProfileSelection[] = [];
    transcripts.set("workspace-chat", [
      { messageId: "kept", role: "assistant", text: "Earlier answer" },
    ]);
    bridge.profiles = async () => ({
      active: profile,
      choices: [{ id, connection: "Local", model: "Fixture" }],
      saved: [{ id, connection: "Local", model: "Fixture", available: true }],
    });
    bridge.selectProfile = async (selection) => {
      choices.push(selection);
      profile = selection.kind === "default" ? null : selection.id;
    };
    // One workspace store: every connection lists the same chats.
    bridge.list = async () => ({
      sessionIds: ["workspace-chat", "other-chat"],
      nextCursor: null,
    });
    try {
      controller.connect("workspace-chat");
      await vi.waitFor(() =>
        expect(controller.read().messages[0]?.text).toBe("Earlier answer")
      );
      await controller.selectProfile({ kind: "saved", id });
      expect(choices).toEqual([{ kind: "saved", id }]);
      expect(controller.read().selected).toBe("workspace-chat");
      expect(controller.read().messages[0]?.text).toBe("Earlier answer");
      await vi.waitFor(() =>
        expect(controller.read().sessions).toEqual([
          "workspace-chat",
          "other-chat",
        ])
      );
      expect(controller.read().profiles?.active).toBe(id);

      // A turn in progress keeps its model until it finishes or stops.
      running.add("workspace-chat");
      await controller.select("other-chat");
      await controller.select("workspace-chat");
      await vi.waitFor(() =>
        expect(controller.read().observation?.snapshot.current).toBeTruthy()
      );
      await controller.selectProfile({ kind: "default" });
      expect(choices).toHaveLength(1);
      expect(controller.read().profileError).toMatch(/current turn/);
    } finally {
      controller.disconnect();
    }
  });

  it.each(["remains open", "disconnects"] as const)(
    "handles the latest notification target when a switching pane %s",
    async (pane) => {
      const { bridge, controller } = fixture();
      const id = "b".repeat(64);
      const switching = Promise.withResolvers<void>();
      let active: string | null = null;
      bridge.selectProfile = vi.fn<
        NonNullable<DesktopNativeChat["selectProfile"]>
      >(async (selection) => {
        if (selection.kind === "new") await switching.promise;
        active = selection.kind === "default" ? null : selection.id;
      });
      const load = bridge.load.bind(bridge);
      const loaded = vi
        .spyOn(bridge, "load")
        .mockImplementation(async (sessionId) => {
          if (active && sessionId.startsWith("background-"))
            throw new Error("wrong_owner");
          return await load(sessionId);
        });
      const submit = vi.spyOn(bridge, "submit");
      const closes = pane === "disconnects";
      try {
        controller.connect("current");
        await vi.waitFor(() => expect(controller.read().loading).toBe(false));
        const selected = controller.selectProfile({ kind: "new", id });
        expect(controller.read().profileBusy).toBe(true);
        await controller.focusChat("background-first");
        await controller.focusChat("background-latest");
        expect(loaded.mock.calls).toEqual([["current"]]);
        if (closes) controller.disconnect();
        switching.resolve();
        await selected;
        await vi.waitFor(() => {
          expect(controller.read()).toMatchObject({
            selected: closes ? "current" : "background-latest",
            loading: false,
          });
          expect(loaded.mock.calls).toEqual(
            closes ? [["current"]] : [["current"], ["background-latest"]]
          );
        });
        expect(bridge.selectProfile).toHaveBeenCalledTimes(closes ? 1 : 2);
        expect(active).toBe(closes ? id : null);
        expect(submit).not.toHaveBeenCalled();
      } finally {
        switching.resolve();
        controller.disconnect();
      }
    }
  );

  it("attaches a reopened workspace directly to the notification's saved connection", async () => {
    const { bridge, controller } = fixture();
    const first = "b".repeat(64);
    const second = "d".repeat(64);
    const selectProfile =
      vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>();
    bridge.selectProfile = selectProfile;
    const load = bridge.load.bind(bridge);
    const loaded = vi
      .spyOn(bridge, "load")
      .mockImplementation(async (sessionId) => {
        expect(selectProfile).toHaveBeenLastCalledWith({
          kind: "saved",
          id: sessionId === "first-chat" ? first : second,
        });
        return await load(sessionId);
      });
    try {
      controller.connect("first-chat", first);
      await vi.waitFor(() =>
        expect(controller.read()).toMatchObject({
          selected: "first-chat",
          loading: false,
        })
      );
      await controller.focusChat("second-chat", second);
      expect(controller.read()).toMatchObject({
        selected: "second-chat",
        loading: false,
      });
      expect(loaded.mock.calls).toEqual([["first-chat"], ["second-chat"]]);
      selectProfile.mockRejectedValueOnce(new Error("unavailable"));
      await controller.focusChat("withdrawn-chat", first);
      expect(controller.read()).toMatchObject({
        selected: "second-chat",
        profileError: expect.stringMatching(/unavailable/),
      });
      expect(loaded).toHaveBeenCalledTimes(2);
    } finally {
      controller.disconnect();
    }
  });

  it("restores the selected connection after a pane reconnects during host selection", async () => {
    const { bridge, controller } = fixture();
    const id = "b".repeat(64);
    const switching = Promise.withResolvers<void>();
    let busy = false;
    bridge.selectProfile = vi.fn<
      NonNullable<DesktopNativeChat["selectProfile"]>
    >(async () => {
      expect(busy).toBe(false);
      busy = true;
      await switching.promise;
      busy = false;
    });
    const load = vi.spyOn(bridge, "create");
    try {
      controller.connect(null, id);
      await vi.waitFor(() => expect(busy).toBe(true));
      controller.disconnect();
      controller.connect(null, id);
      expect(bridge.selectProfile).toHaveBeenCalledTimes(1);
      switching.resolve();
      await vi.waitFor(() => {
        expect(controller.read()).toMatchObject({
          selected: null,
          loading: false,
          profileBusy: false,
          profileError: null,
        });
      });
      expect(bridge.selectProfile).toHaveBeenCalledTimes(2);
      expect(load).not.toHaveBeenCalled();
    } finally {
      switching.resolve();
      controller.disconnect();
    }
  });

  it("projects UTF-8 offsets, duplicate chunks, and a final replacement without repeating text", async () => {
    const { controller, running, updates } = fixture();
    running.add("a");
    try {
      await controller.select("a");
      updates.get("a")!(text("a", "한", 0));
      updates.get("a")!(text("a", "글", 3));
      updates.get("a")!(text("a", "글", 3));
      expect(controller.read().messages.map((entry) => entry.text)).toEqual([
        "한글",
      ]);
      updates.get("a")!(text("a", "Verified", 0, true));
      expect(controller.read().messages.map((entry) => entry.text)).toEqual([
        "Verified",
      ]);
    } finally {
      controller.disconnect();
    }
  });

  it("replaces a gapped stream with committed text and ignores late provisional chunks", async () => {
    const { controller, running, updates, transcripts } = fixture();
    running.add("a");
    try {
      await controller.select("a");
      updates.get("a")!(text("a", "Part", 0));
      transcripts.set("a", [message("a", "Complete durable text")]);
      updates.get("a")!(text("a", "after a gap", 10));
      expect(controller.read().repairing).toBe(true);
      await vi.waitFor(() =>
        expect(controller.read().messages).toEqual([
          message("a", "Complete durable text"),
        ])
      );
      updates.get("a")!(text("a", "Late", 0, true));
      expect(controller.read().messages).toEqual([
        message("a", "Complete durable text"),
      ]);
    } finally {
      controller.disconnect();
    }
  });

  it("never installs a previous chat's delayed replay or live callback after switching", async () => {
    const { controller, bridge, updates, transcripts } = fixture();
    const detach = vi.spyOn(bridge, "detach");
    let finish: ((value: readonly NativeChatMessage[]) => void) | undefined;
    vi.spyOn(bridge, "transcript").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    transcripts.set("b", [message("b", "Second chat")]);
    try {
      const first = controller.select("a");
      await vi.waitFor(() => expect(finish).toBeDefined());
      const stale = updates.get("a")!;
      await controller.select("b");
      finish!([message("a", "First chat")]);
      await first;
      stale(text("a", "Late first chat", 0));
      expect(controller.read().selected).toBe("b");
      expect(controller.read().messages).toEqual([message("b", "Second chat")]);
      expect(detach).toHaveBeenCalledWith("a");
    } finally {
      controller.disconnect();
    }
  });

  it("keeps the same submission identity when a user retries an unconfirmed send", async () => {
    const { controller, bridge } = fixture();
    const submit = vi
      .spyOn(bridge, "submit")
      .mockRejectedValueOnce(new Error("lost_reply"));
    try {
      await controller.select(null);
      await expect(controller.submit("Fixture prompt")).rejects.toThrow(
        "lost_reply"
      );
      expect(controller.read().error).toContain("draft is still here");
      await controller.submit("Fixture prompt");
      expect(submit.mock.calls).toHaveLength(2);
      expect(submit.mock.calls[0]).toEqual(submit.mock.calls[1]);
      expect(controller.read().selected).toBe("new");
    } finally {
      controller.disconnect();
    }
  });

  it("does not refresh or clear the selected chat when another chat's submission finishes", async () => {
    const { controller, bridge, transcripts } = fixture();
    const submit = bridge.submit.bind(bridge);
    let accept: (() => void) | undefined;
    vi.spyOn(bridge, "submit").mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => {
        accept = resolve;
      });
      return submit(...args);
    });
    transcripts.set("b", [message("b", "Keep this chat")]);
    try {
      await controller.select("a");
      const pending = controller.submit("Old chat prompt");
      await vi.waitFor(() => expect(accept).toBeDefined());
      await controller.select("b");
      accept!();
      await pending;
      expect(controller.read()).toEqual(
        expect.objectContaining({
          selected: "b",
          acting: false,
          messages: [message("b", "Keep this chat")],
        })
      );
    } finally {
      controller.disconnect();
    }
  });
});

it("selects planning from a slash command without submitting, then sends only the task", async () => {
  const { bridge, controller } = fixture();
  bridge.submitInRegime = vi.fn<
    NonNullable<DesktopNativeChat["submitInRegime"]>
  >(async (_action, id, inputId) => ({
    sessionId: id,
    inputId,
    disposition: "claimed",
    inputPosition: 1,
    turnId: "planning",
  }));
  await controller.select(null);
  await controller.submit("/plan");
  expect(controller.read().operatingRegime).toBe("plan");
  expect(bridge.submitInRegime).not.toHaveBeenCalled();
  await controller.submit("Inspect the export requirements");
  expect(bridge.submitInRegime).toHaveBeenCalledWith(
    "submit",
    "new",
    expect.any(String),
    "Inspect the export requirements",
    "plan"
  );
  await controller.select("another");
  expect(controller.read().operatingRegime).toBe("act");
  controller.disconnect();
});

it("starts a composer goal only on send and reuses its accepted request after a lost reply", async () => {
  const { bridge, controller, running } = fixture();
  bridge.goal = async () => ({ observationId: null, goal: null });
  const start = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>(
    async (id, inputId) => ({
      sessionId: id,
      inputId,
      disposition: "queued",
      inputPosition: 1,
      turnId: null,
    })
  );
  bridge.startGoal = start;
  const ordinary = vi.spyOn(bridge, "submit");
  await controller.select(null);
  await controller.submit("/goal");
  expect(controller.read().goalIntent).toBe(true);
  expect(start).not.toHaveBeenCalled();
  start.mockImplementationOnce(async () => {
    running.add("new");
    throw new Error("lost acknowledgement");
  });
  await expect(
    controller.submit("Prepare an SVG that opens correctly")
  ).rejects.toThrow(/goal request|goal|start/i);
  expect(controller.read().goalIntent).toBe(true);
  expect(controller.read().observation?.snapshot.current?.disposition).toBe(
    "running"
  );
  await expect(controller.submit("Start a different task")).rejects.toThrow(
    /original goal draft/
  );
  expect(start.mock.calls).toHaveLength(1);
  await controller.submit("Prepare an SVG that opens correctly");
  expect(start.mock.calls).toHaveLength(2);
  expect(start.mock.calls[1]).toEqual(start.mock.calls[0]);
  expect(start).toHaveBeenLastCalledWith("new", expect.any(String), {
    objective: "Prepare an SVG that opens correctly",
    criteria: ["Prepare an SVG that opens correctly"],
    allowance: { workTurns: 8, inferenceSteps: 64 },
    automatic: true,
    operatingRegime: "act",
  });
  expect(ordinary).not.toHaveBeenCalled();
  expect(controller.read().goalIntent).toBe(false);
  controller.disconnect();
});

it("drops an unsent goal intent on chat switch and refuses unavailable goal entry", async () => {
  const { bridge, controller } = fixture();
  bridge.goal = async () => ({ observationId: null, goal: null });
  bridge.startGoal = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>();
  await controller.select(null);
  controller.selectGoalIntent(true);
  expect(controller.read().goalIntent).toBe(true);
  await controller.select("another");
  expect(controller.read().goalIntent).toBe(false);
  bridge.startGoal = undefined;
  const ordinary = vi.spyOn(bridge, "submit");
  await expect(controller.submit("/goal Inspect the file")).rejects.toThrow(
    /cannot start/
  );
  expect(ordinary).not.toHaveBeenCalled();
  controller.disconnect();
});

it("keeps an attachment and refuses literal Goal entry instead of sending an ordinary task", async () => {
  const { bridge, controller } = fixture();
  bridge.goal = async () => ({ observationId: null, goal: null });
  bridge.startGoal = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>();
  bridge.acceptsPng = async () => true;
  bridge.submitImage = vi.fn<NonNullable<DesktopNativeChat["submitImage"]>>();
  const ordinary = vi.spyOn(bridge, "submit");
  await controller.select("chat-a");
  const png = new Uint8Array([137, 1]).buffer;
  await controller.pickAttachment(controller.read().scope, "png", {
    name: "input.png",
    size: png.byteLength,
    arrayBuffer: async () => png,
  });
  await expect(controller.submit("/goal Describe this image")).rejects.toThrow(
    /attachment/
  );
  expect(controller.read().attachmentDraft?.name).toBe("input.png");
  expect(bridge.startGoal).not.toHaveBeenCalled();
  expect(bridge.submitImage).not.toHaveBeenCalled();
  expect(ordinary).not.toHaveBeenCalled();
  controller.disconnect();
});

it("allows a corrected Goal allowance after an explicit pre-admission refusal", async () => {
  const { bridge, controller } = fixture();
  bridge.goal = async () => ({ observationId: null, goal: null });
  bridge.acceptsGoalEffort = async () => true;
  const start = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>(
    async (sessionId, inputId) => ({
      sessionId,
      inputId,
      disposition: "queued",
      inputPosition: 1,
      turnId: null,
    })
  );
  bridge.startGoal = start;
  await controller.select("chat-a");
  const request = {
    objective: "Review the export",
    criteria: ["Collect the review"],
    allowance: { workTurns: 2, inferenceSteps: 1 },
    effort: "ultra" as const,
    automatic: true,
  };
  start.mockRejectedValueOnce(new Error("goal_child_allowance_unavailable"));
  expect(await controller.startGoal(request)).toBe(false);
  expect(
    await controller.startGoal({
      ...request,
      allowance: { workTurns: 2, inferenceSteps: 64 },
    })
  ).toBe(true);
  expect(start).toHaveBeenCalledTimes(2);
  expect(start.mock.calls[1][1]).not.toBe(start.mock.calls[0][1]);
  controller.disconnect();
});
