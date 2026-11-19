import { describe, expect, it, vi } from "vitest";
import type {
  NativeChatProfileSelection,
  NativeChatProfileCatalog,
  DesktopNativeChat,
  NativeChatCommand,
  NativeChatCommandResult,
  NativeChatGatewayBillingAttempt,
  NativeChatCatalogEntry,
  NativeChatGoal,
  NativeChatMessage,
  NativeChatObservation,
  NativeChatPage,
  NativeChatQueueItem,
  NativeChatRevisionInput,
  NativeChatRevisionReceipt,
  NativeChatTranscriptPage,
  NativeChatTurn,
  NativeChatTurnSummary,
  NativeChatUpdate,
  NativeEditorSurfaceOpen,
  NativeEditorSurfaceSnapshot,
} from "@grida/desktop-bridge";
import { NEW_CHAT_TITLE, NativeChatController } from "./native-chat-controller";
import { native_message_parts } from "./native-message-parts";
import { video_attachment } from "./video-attachment";
import { image_attachment_preview } from "./image-attachment-preview";
import { ComposerDrafts, type ComposerDraftBlob } from "./composer-drafts";

function durableDrafts(blobs = new Map<string, ComposerDraftBlob>()) {
  return new ComposerDrafts(null, {
    get: async (key) => blobs.get(key) ?? null,
    put: async (key, value) => {
      blobs.set(key, value);
    },
    delete: async (key) => {
      blobs.delete(key);
    },
  });
}

it("previews queued text without editing the message or locking chat actions", async () => {
  const { bridge, controller } = fixture();
  const observe = bridge.observe.bind(bridge);
  bridge.observe = async (id) => {
    const value = await observe(id);
    return { ...value, snapshot: { ...value.snapshot, queuedInputs: 1 } };
  };
  bridge.queue = async () => ({
    items: [{ inputId: "queued", preview: "First line…" }],
    offset: 0,
    previousOffset: null,
    nextOffset: null,
  });
  const read = vi
    .fn<NonNullable<DesktopNativeChat["queuedText"]>>()
    .mockResolvedValue("First line\n\nSecond paragraph");
  bridge.queuedText = read;
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  await expect(controller.readQueuedText("queued")).resolves.toBe(
    "First line\n\nSecond paragraph"
  );
  expect(read).toHaveBeenCalledWith("chat-a", "observation-chat-a", "queued");
  expect(controller.read().queueDraft).toBeNull();
  expect(controller.read().acting).toBe(false);
  await expect(controller.readQueuedText("missing")).rejects.toThrow(
    "native_chat_queue_input_unavailable"
  );
  expect(read).toHaveBeenCalledOnce();
  controller.disconnect();
});

it("reads image-containing queued messages through the observational capability", async () => {
  const { bridge, controller } = fixture();
  const observe = bridge.observe.bind(bridge);
  bridge.observe = async (id) => {
    const value = await observe(id);
    return { ...value, snapshot: { ...value.snapshot, queuedInputs: 1 } };
  };
  const attachments = [
    {
      name: "reference.jpg",
      mimeType: "image/jpeg",
      previewId: "opaque-image",
    },
  ];
  bridge.queue = async () => ({
    items: [{ inputId: "image-input", preview: "Caption…", attachments }],
    offset: 0,
    previousOffset: null,
    nextOffset: null,
  });
  const inspect = vi
    .fn<NonNullable<DesktopNativeChat["queuedMessage"]>>()
    .mockResolvedValue({
      inputId: "image-input",
      text: "Caption\nSecond line",
      attachments,
    });
  const read = vi
    .fn<NonNullable<DesktopNativeChat["readQueuedAttachmentPreview"]>>()
    .mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
  const editable = vi.fn<NonNullable<DesktopNativeChat["queuedText"]>>();
  bridge.queuedMessage = inspect;
  bridge.readQueuedAttachmentPreview = read;
  bridge.queuedText = editable;
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  await expect(controller.readQueuedText("image-input")).resolves.toBe(
    "Caption\nSecond line"
  );
  expect(inspect).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    "observation-chat-a",
    "image-input"
  );
  expect(editable).not.toHaveBeenCalled();
  const image = await controller.readQueuedAttachmentPreview(
    "image-input",
    "opaque-image"
  );
  expect(image.type).toBe("image/jpeg");
  expect(image.size).toBe(3);
  expect(read).toHaveBeenCalledExactlyOnceWith(
    "chat-a",
    "observation-chat-a",
    "image-input",
    "opaque-image"
  );
  await expect(
    controller.readQueuedAttachmentPreview("image-input", "another-image")
  ).rejects.toThrow("native_chat_queue_input_unavailable");
  expect(read).toHaveBeenCalledOnce();
  expect(controller.read().queueDraft).toBeNull();
  expect(controller.read().acting).toBe(false);
  controller.disconnect();
});

it("discards queued image bytes received after selecting another chat", async () => {
  const { bridge, controller } = fixture();
  const observe = bridge.observe.bind(bridge);
  bridge.observe = async (id) => {
    const value = await observe(id);
    return { ...value, snapshot: { ...value.snapshot, queuedInputs: 1 } };
  };
  bridge.queue = async () => ({
    items: [
      {
        inputId: "image-input",
        preview: null,
        attachments: [
          {
            name: "photo.png",
            mimeType: "image/png",
            previewId: "opaque-image",
          },
        ],
      },
    ],
    offset: 0,
    previousOffset: null,
    nextOffset: null,
  });
  let resolve!: (value: ArrayBuffer) => void;
  bridge.readQueuedAttachmentPreview = () =>
    new Promise<ArrayBuffer>((done) => {
      resolve = done;
    });
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  const preview = controller.readQueuedAttachmentPreview(
    "image-input",
    "opaque-image"
  );
  const rejected = preview.catch((error: unknown) => error);
  await controller.select("chat-b");
  resolve(new Uint8Array([1, 2, 3]).buffer);
  expect(await rejected).toMatchObject({
    message: "native_chat_queue_input_unavailable",
  });
  controller.disconnect();
});

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
    async status() {
      return "native-ready";
    },
    async profiles() {
      return { active: null, modelChanges: true, choices: [], saved: [] };
    },
    async takeNotificationFocus() {
      return null;
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
      throw new Error("input_unavailable");
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

it("reads a recorded user PNG without submitting work and drops a stale chat response", async () => {
  const { bridge, transcripts, controller } = fixture();
  const bytes = new ArrayBuffer(67);
  const read = vi
    .fn<NonNullable<DesktopNativeChat["readAttachmentPreview"]>>()
    .mockResolvedValue(bytes);
  bridge.readAttachmentPreview = read;
  const submit = vi.spyOn(bridge, "submit");
  transcripts.set("chat-a", [
    {
      messageId: "ask",
      role: "user",
      text: "See this.",
      attachments: [
        { name: "image.png", mimeType: "image/png", previewId: "preview" },
      ],
    },
  ]);
  await controller.select("chat-a");
  expect(read).not.toHaveBeenCalled();
  await expect(controller.readAttachmentPreview("other")).rejects.toThrow(
    "input_image_unavailable"
  );
  expect(read).not.toHaveBeenCalled();
  const image = await controller.readAttachmentPreview("preview");
  expect(image.type).toBe("image/png");
  expect(await image.arrayBuffer()).toEqual(bytes);
  expect(read).toHaveBeenCalledExactlyOnceWith("chat-a", "preview");
  const pending = Promise.withResolvers<ArrayBuffer>();
  read.mockReturnValueOnce(pending.promise);
  const loading = controller.readAttachmentPreview("preview");
  await controller.select("chat-b");
  pending.resolve(bytes);
  await expect(loading).rejects.toThrow("input_image_unavailable");
  expect(submit).not.toHaveBeenCalled();
  controller.disconnect();
});

it("reads only an observed successful tool image and refuses changed bytes or a retired chat", async () => {
  const { bridge, transcripts, controller } = fixture();
  const bytes = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    )
  ).buffer;
  const image = {
    previewId: "tool-preview",
    mimeType: "image/png" as const,
    size: bytes.byteLength,
  };
  transcripts.set("chat-a", [
    {
      messageId: "view-result",
      turnId: "turn-chat-a",
      role: "assistant",
      text: "",
      activity: [
        {
          callId: "view-call",
          title: "view_image",
          kind: "read",
          outcome: "succeeded",
          input: { path: "/fixture/workspace/source.png" },
          output: { text: "Viewed image", truncated: false, images: [image] },
        },
      ],
    },
  ]);
  const read = vi
    .fn<NonNullable<DesktopNativeChat["readToolImage"]>>()
    .mockResolvedValue(bytes);
  bridge.readToolImage = read;
  const submit = vi.spyOn(bridge, "submit");
  await controller.select("chat-a");
  await expect(controller.readToolImage("foreign-preview")).rejects.toThrow(
    "tool_image_unavailable"
  );
  expect(read).not.toHaveBeenCalled();
  const blob = await controller.readToolImage(image.previewId);
  expect(blob.type).toBe("image/png");
  expect(await blob.arrayBuffer()).toEqual(bytes);
  expect(read).toHaveBeenCalledExactlyOnceWith("chat-a", image.previewId);

  read.mockResolvedValueOnce(new ArrayBuffer(bytes.byteLength + 1));
  await expect(controller.readToolImage(image.previewId)).rejects.toThrow(
    "tool_image_unavailable"
  );
  const pending = Promise.withResolvers<ArrayBuffer>();
  read.mockReturnValueOnce(pending.promise);
  const loading = controller.readToolImage(image.previewId);
  await controller.select("chat-b");
  pending.resolve(bytes);
  await expect(loading).rejects.toThrow("tool_image_unavailable");
  expect(submit).not.toHaveBeenCalled();
  controller.disconnect();
});

it.each(["running", "failed", "cancelled", "uncertain"] as const)(
  "does not authorize an image attached to a %s tool activity",
  async (outcome) => {
    const { bridge, transcripts, controller } = fixture();
    const read = vi.fn<NonNullable<DesktopNativeChat["readToolImage"]>>();
    bridge.readToolImage = read;
    transcripts.set("chat-a", [
      {
        messageId: "view-result",
        role: "assistant",
        text: "",
        activity: [
          {
            callId: "view-call",
            title: "view_image",
            kind: "read",
            outcome,
            output: {
              text: "Unavailable",
              truncated: false,
              images: [
                { previewId: "tool-preview", mimeType: "image/png", size: 68 },
              ],
            },
          },
        ],
      },
    ]);
    await controller.select("chat-a");
    await expect(controller.readToolImage("tool-preview")).rejects.toThrow(
      "tool_image_unavailable"
    );
    expect(read).not.toHaveBeenCalled();
    controller.disconnect();
  }
);

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

describe("model catalogue refresh", () => {
  const catalog: NativeChatProfileCatalog = {
    active: null,
    choices: [{ id: "a".repeat(64), connection: "Provider", model: "Text" }],
    saved: [],
  };

  it("shares overlapping reads, retains choices on failure, and recovers without clearing selection errors", async () => {
    const { bridge, controller } = fixture();
    const pending = Promise.withResolvers<NativeChatProfileCatalog>();
    const read = vi.fn<NonNullable<DesktopNativeChat["profiles"]>>(
      async () => catalog
    );
    read.mockResolvedValueOnce(catalog);
    read.mockImplementationOnce(() => pending.promise);
    bridge.profiles = read;
    bridge.selectProfile = async () => {
      throw new Error("unavailable");
    };
    try {
      controller.connectForSelection();
      await controller.readProfiles();
      await controller.selectConnection({
        kind: "new",
        id: catalog.choices[0].id,
      });
      const selectionError = controller.read().profileError;
      const first = controller.readProfiles();
      const second = controller.readProfiles();
      expect(read).toHaveBeenCalledTimes(2);
      expect(controller.read().profiles).toBe(catalog);
      pending.reject(new Error("offline"));
      await Promise.all([first, second]);
      expect(controller.read().profiles).toBe(catalog);
      expect(controller.read().profileReadError).toContain("Couldn't load");
      expect(controller.read().profileError).toBe(selectionError);
      await controller.readProfiles();
      expect(read).toHaveBeenCalledTimes(3);
      expect(controller.read().profileReadError).toBeNull();
      expect(controller.read().profileError).toBe(selectionError);
    } finally {
      controller.disconnect();
    }
  });

  it("ignores a prior connection's read after reconnecting", async () => {
    const { bridge, controller } = fixture();
    const pending = Promise.withResolvers<NativeChatProfileCatalog>();
    const read = vi.fn<NonNullable<DesktopNativeChat["profiles"]>>(
      async () => catalog
    );
    read.mockImplementationOnce(() => pending.promise);
    bridge.profiles = read;
    controller.connectForSelection();
    const old = controller.readProfiles();
    controller.disconnect();
    controller.connectForSelection();
    await controller.readProfiles();
    pending.resolve({ active: null, choices: [], saved: [] });
    await old;
    expect(controller.read().profiles).toBe(catalog);
    controller.disconnect();
  });

  it("Welcome shares overlapping reads and retains an explicit choice through failure and retry", async () => {
    const selection = new NativeChatController.ModelSelection();
    const id = catalog.choices[0].id;
    await selection.refresh(async () => catalog);
    selection.choose({ kind: "new", id });
    const pending = Promise.withResolvers<NativeChatProfileCatalog>();
    const read = vi.fn<() => Promise<NativeChatProfileCatalog>>(
      async () => catalog
    );
    read.mockImplementationOnce(() => pending.promise);
    const first = selection.refresh(read);
    const second = selection.refresh(read);
    expect(read).toHaveBeenCalledOnce();
    expect(selection.read().profiles).toBe(catalog);
    pending.reject(new Error("offline"));
    await Promise.all([first, second]);
    expect(selection.read()).toMatchObject({
      profiles: catalog,
      profileId: id,
      error: expect.any(String),
    });
    await selection.refresh(read);
    expect(read).toHaveBeenCalledTimes(2);
    expect(selection.read()).toMatchObject({
      profiles: catalog,
      profileId: id,
      error: null,
    });
  });
});

it("explains pending workspace work when a connection-only selection is refused", async () => {
  const { bridge, controller } = fixture();
  bridge.selectProfile = vi
    .fn<NonNullable<DesktopNativeChat["selectProfile"]>>()
    .mockRejectedValue(new Error("native_chat_model_change_queued_input"));
  const load = vi.spyOn(bridge, "load");
  const create = vi.spyOn(bridge, "create");
  try {
    controller.connectForSelection();
    await expect(
      controller.selectConnection({ kind: "new", id: "b".repeat(64) })
    ).resolves.toBe(false);
    expect(controller.read().profileError).toMatch(
      /queued messages in this workspace/
    );
    expect(load).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  } finally {
    controller.disconnect();
  }
});

it("activates a recovered profile, then reopens the workspace chat", async () => {
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
    controller.connect(null, id);
    await vi.waitFor(() => expect(controller.read().scope).toBeGreaterThan(0));
    expect(choose).toHaveBeenCalledExactlyOnceWith({
      kind: "saved",
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
});

it.each([true, false])(
  "reopens a workspace with the model chosen there before (still available: %s)",
  async (available) => {
    const { bridge } = fixture();
    const id = "e".repeat(64);
    const stored = new Map([
      [
        "project",
        JSON.stringify({
          selected: "old-default",
          sessions: ["old-default"],
          profileId: id,
        }),
      ],
    ]);
    const memory = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    };
    const choose = vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
      async () => {
        if (!available) throw new Error("native_chat_profile_unavailable");
      }
    );
    bridge.selectProfile = choose;
    const controller = new NativeChatController(bridge, memory, "project");
    try {
      controller.connect(null, null);
      await vi.waitFor(() =>
        expect(controller.read().selected).toBe("old-default")
      );
      expect(choose).toHaveBeenCalledExactlyOnceWith({ kind: "saved", id });
      // A choice that can no longer run is forgotten without an error; the
      // workspace opens with the default connection.
      expect(controller.read().profileError).toBeNull();
      expect(JSON.parse(stored.get("project")!).profileId).toBe(
        available ? id : undefined
      );
    } finally {
      controller.disconnect();
    }
  }
);

it("remembers the model chosen for the workspace", async () => {
  const { bridge } = fixture();
  const stored = new Map<string, string>();
  const memory = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
  };
  bridge.selectProfile = async () => {};
  const controller = new NativeChatController(bridge, memory, "project");
  const id = "f".repeat(64);
  try {
    controller.connect(null, null);
    await vi.waitFor(() => expect(controller.read().scope).toBeGreaterThan(0));
    await controller.selectProfile({ kind: "new", id });
    expect(JSON.parse(stored.get("project")!).profileId).toBe(id);
    await controller.selectProfile({ kind: "default" });
    expect(JSON.parse(stored.get("project")!).profileId).toBeUndefined();
  } finally {
    controller.disconnect();
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

it.each(["switch chats", "replace the attachment"] as const)(
  "ignores a pending earlier page when we %s",
  async (transition) => {
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
    if (transition === "switch chats") await controller.select("chat-b");
    else {
      vi.spyOn(bridge, "observe").mockRejectedValueOnce(
        new Error("native_chat_attachment_unavailable")
      );
      vi.spyOn(bridge, "load").mockResolvedValueOnce({
        attachmentId: "replacement-a",
        sessionId: "chat-a",
      });
      controller.checkObservation();
    }
    await vi.waitFor(() => {
      expect(read).toHaveBeenNthCalledWith(
        4,
        transition === "switch chats" ? "chat-b" : "replacement-a"
      );
      expect(controller.read().connectionRecovery).toBeNull();
    });
    delayed.resolve(page("late-a", "other-a"));
    await waiting;
    expect(controller.read()).toMatchObject({
      messages:
        transition === "switch chats"
          ? [{ text: "latest-b" }]
          : [{ text: "earlier-a" }, { text: "latest-b" }],
      canReadEarlier: transition === "replace the attachment",
      readingEarlier: false,
    });
    controller.disconnect();
  }
);

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

it("advances visible progress only for new live output, independently of history and observation reads", async () => {
  const { bridge, controller, running, updates } = fixture();
  running.add("chat-a");
  let latest: NativeChatTranscriptPage = {
    view: 1,
    older: "earlier",
    messages: [],
  };
  const read = vi.fn<NonNullable<DesktopNativeChat["transcriptPage"]>>(
    async (id, before) =>
      id !== "chat-a"
        ? { view: 1, older: null, messages: [] }
        : before
          ? {
              view: 1,
              older: null,
              messages: [{ messageId: "old", role: "assistant", text: "Old" }],
            }
          : latest
  );
  bridge.transcriptPage = read;
  try {
    await controller.select("chat-a");
    const live = updates.get("chat-a")!;
    const text = {
      kind: "text",
      role: "assistant",
      messageId: "work",
      turnId: "turn-chat-a",
      offsetBytes: 0,
      replace: true,
      text: "",
    } as const;
    expect(controller.read().progressRevision).toBe(0);
    live({ ...text, role: "user", messageId: "echo", text: "Request" });
    live(text);
    expect(controller.read().progressRevision).toBe(0);
    live({ ...text, text: "First" });
    expect(controller.read().progressRevision).toBe(1);
    live({ ...text, text: "First", replace: false });
    live({ ...text, text: "First", activityOrder: 1 });
    expect(controller.read().progressRevision).toBe(1);
    live({ ...text, text: " second", replace: false, offsetBytes: 5 });
    expect(controller.read().progressRevision).toBe(2);

    const call = {
      kind: "activity",
      messageId: "work",
      turnId: "turn-chat-a",
      activity: {
        callId: "call",
        title: "read_file",
        kind: "read",
        outcome: "running",
        input: { path: "notes.txt", limit: 20 },
      },
    } as const;
    live(call);
    expect(controller.read().progressRevision).toBe(3);
    live({
      ...call,
      activity: {
        ...call.activity,
        input: { limit: 20, path: "notes.txt" },
        activityOrder: 2,
      },
    });
    expect(controller.read().progressRevision).toBe(3);
    const result = {
      ...call,
      activity: {
        ...call.activity,
        outcome: "succeeded",
        output: { text: "Read content", truncated: false },
      },
    } as const;
    live(result);
    live({ ...result, activity: { ...result.activity } });
    live({ ...text, turnId: "foreign", text: "Stale" });
    live({ ...call, turnId: "foreign" });
    expect(controller.read().progressRevision).toBe(4);

    latest = {
      ...latest,
      messages: controller.read().messages.map((message) => ({
        ...message,
        phase: "progress",
      })),
    };
    live({ kind: "resync" });
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(
        controller
          .read()
          .messages.find((message) => message.messageId === "work")?.phase
      ).toBe("progress")
    );
    expect(controller.read().progressRevision).toBe(4);
    await controller.loadEarlierMessages();
    expect(controller.read().messages[0].messageId).toBe("old");
    expect(controller.read().progressRevision).toBe(4);

    await controller.select("chat-b");
    expect(controller.read().progressRevision).toBe(0);
    live({ ...text, text: "Retired callback" });
    expect(controller.read().progressRevision).toBe(0);
  } finally {
    controller.disconnect();
  }
});

it.each(["valueOf", "toString", "constructor"])(
  "merges changed JSON tool payloads with an own %s data property",
  async (key) => {
    const { controller, running, updates } = fixture();
    running.add("chat-a");
    try {
      await controller.select("chat-a");
      const live = updates.get("chat-a")!;
      const activity = {
        callId: "call",
        title: "search",
        kind: "read",
        outcome: "running",
        input: { [key]: 0, query: "a" },
        output: {
          text: "Result",
          truncated: false,
          structured: { nested: { [key]: 0, text: "a" } },
        },
      } as const;
      const update = {
        kind: "activity",
        messageId: "work",
        turnId: "turn-chat-a",
        activity,
      } as const;
      live(update);
      expect(controller.read().progressRevision).toBe(1);
      live({
        ...update,
        activity: {
          ...activity,
          input: { query: "a", [key]: 0 },
          output: {
            text: "Result",
            truncated: false,
            structured: { nested: { text: "a", [key]: 0 } },
          },
        },
      });
      expect(controller.read().progressRevision).toBe(1);
      live({
        ...update,
        activity: { ...activity, input: { [key]: 0, query: "b" } },
      });
      expect(controller.read().progressRevision).toBe(2);
      const output = {
        text: "Result",
        truncated: false,
        structured: { nested: { [key]: 0, text: "b" } },
      };
      live({
        ...update,
        activity: {
          ...activity,
          input: { [key]: 0, query: "b" },
          output,
        },
      });
      expect(controller.read().progressRevision).toBe(3);
      expect(
        controller
          .read()
          .messages.find((message) => message.messageId === "work")
          ?.activity?.[0].output
      ).toEqual(output);
    } finally {
      controller.disconnect();
    }
  }
);

it("retains native first-publication positions through live text, replacement, call outcomes and replay", async () => {
  const { bridge, controller, running, updates } = fixture();
  running.add("chat-a");
  let latest: NativeChatTranscriptPage = {
    view: 1,
    older: null,
    messages: [],
    turns: [],
  };
  bridge.transcriptPage = async () => latest;
  try {
    await controller.select("chat-a");
    const live = updates.get("chat-a")!;
    const chunk = {
      kind: "text",
      role: "assistant",
      messageId: "work",
      turnId: "turn-chat-a",
      text: "Read",
      offsetBytes: 0,
      replace: false,
    } as const;
    live({ ...chunk, activityOrderIncomplete: true });
    // An exact duplicate may carry the retained coordinate on resubscription.
    live({ ...chunk, activityOrder: 2 });
    expect(controller.read().messages[0]).toMatchObject({ activityOrder: 2 });
    live({ ...chunk, text: "ing", offsetBytes: 4 });
    live({
      kind: "activity",
      messageId: "work",
      turnId: "turn-chat-a",
      activity: {
        callId: "call",
        title: "read_file",
        kind: "read",
        outcome: "running",
        activityOrder: 4,
      },
    });
    live({ ...chunk, text: "Read again", replace: true });
    // A changed coordinate is rejected; the visible fact keeps its first one.
    live({ ...chunk, text: "Read again", replace: true, activityOrder: 99 });
    live({
      kind: "activity",
      messageId: "work",
      turnId: "turn-chat-a",
      activity: {
        callId: "call",
        title: "read_file",
        kind: "read",
        outcome: "succeeded",
      },
    });
    expect(controller.read().messages[0]).toMatchObject({
      text: "Read again",
      activityOrder: 2,
      activity: [{ callId: "call", outcome: "succeeded", activityOrder: 4 }],
    });
    expect(
      controller.read().messages[0].activityOrderIncomplete
    ).toBeUndefined();
    latest = {
      ...latest,
      messages: [{ ...controller.read().messages[0], phase: "progress" }],
    };
    live({ kind: "resync" });
    await vi.waitFor(() =>
      expect(controller.read().messages[0]?.phase).toBe("progress")
    );
    expect(controller.read().messages).toHaveLength(1);
    expect(controller.read().messages[0]).toMatchObject({
      activityOrder: 2,
      activity: [{ activityOrder: 4 }],
    });
  } finally {
    controller.disconnect();
  }
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
    svgText: {
      hasSelection: () => true,
      subscribe: () => () => {},
      capture,
      invoke: () => ({ kind: "unavailable" }),
    },
  });
  try {
    await controller.select("workbench");
    expect(controller.readComposerSvgText()).toBe(true);
    expect(capture).not.toHaveBeenCalled();
    controller.selectOperatingRegime("plan");
    expect(controller.readComposerSvgText()).toBe(false);
    controller.selectOperatingRegime("act");
    await expect(controller.submit("Read this SVG selection.")).rejects.toThrow(
      "fixture lost reply"
    );
    expect(controller.readComposerSvgText()).toBe(false);
    await controller.submit("Read this SVG selection.");
    expect(send.mock.calls[0]?.at(-1)).toBe(target);
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
    expect(capture).toHaveBeenCalledTimes(1);
  } finally {
    controller.disconnect();
  }
});

it("retries the explicitly supplied editor context without sampling a new one", async () => {
  const { bridge } = fixture();
  const id = crypto.randomUUID();
  bridge.captureEditorContext = vi.fn<
    NonNullable<DesktopNativeChat["captureEditorContext"]>
  >(async () => id);
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
  const controller = new NativeChatController(bridge);
  try {
    await controller.select("workbench");
    await expect(
      controller.submit("Read this selection.", undefined, id)
    ).rejects.toThrow("fixture lost reply");
    await controller.submit("Read this selection.");
    expect(send.mock.calls[0]?.at(-1)).toBe(id);
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
    expect(bridge.captureEditorContext).not.toHaveBeenCalled();
  } finally {
    controller.disconnect();
  }
});

it("asks for reselection when the host confirms an expired capture was never accepted", async () => {
  const { bridge, controller } = fixture();
  bridge.captureEditorContext = async () => null;
  bridge.submitInRegime = vi
    .fn<NonNullable<DesktopNativeChat["submitInRegime"]>>()
    .mockRejectedValueOnce(new Error("native_chat_editor_context_unavailable"));
  try {
    await controller.select("workbench");
    await expect(
      controller.submit("Read this selection.", undefined, crypto.randomUUID())
    ).rejects.toThrow("native_chat_editor_context_reselect");
    expect(controller.read().error).toBe(
      "Select the editor item again to send this draft."
    );
  } finally {
    controller.disconnect();
  }
});

it("sends ordinary text but does not strip a pending observation on an older preload", async () => {
  const { bridge, controller } = fixture();
  const send = vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
    async (_action, sessionId, inputId) => ({
      sessionId,
      inputId,
      disposition: "claimed",
      inputPosition: 1,
      turnId: "turn-workbench",
    })
  );
  bridge.submitInRegime = send;
  const drafts = durableDrafts();
  await drafts.writePending("workspace:workbench", {
    text: "Read this selection.",
    inputId: "pending-observation",
    mode: "submit",
    operatingRegime: "act",
    allowLibrarySelection: false,
    editorContextId: crypto.randomUUID(),
  });
  controller.keepDrafts(drafts, "workspace");
  try {
    await controller.select("workbench");
    await expect(controller.submit("Read this selection.")).rejects.toThrow(
      "native_chat_editor_context_reselect"
    );
    expect(controller.read().error).toBe(
      "Select the editor item again to send this draft."
    );
    expect(send).not.toHaveBeenCalled();
    await controller.submit("Send ordinary text.");
    expect(send).toHaveBeenCalledExactlyOnceWith(
      "submit",
      "workbench",
      expect.any(String),
      "Send ordinary text.",
      "act"
    );
    expect(send.mock.calls[0][2]).not.toBe("pending-observation");
  } finally {
    controller.disconnect();
  }
});

it("queues an Act follow-up with the captured SVG target", async () => {
  const { bridge, running } = fixture();
  running.add("workbench");
  bridge.publishEditorSurfaces = async () => {};
  bridge.onEditorSvgText = () => () => {};
  bridge.enqueue = async () => {
    throw new Error("fixture uses submitInRegime");
  };
  const send = vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
    async (_action, sessionId, inputId) => ({
      sessionId,
      inputId,
      disposition: "queued",
      inputPosition: 2,
      turnId: null,
    })
  );
  bridge.submitInRegime = send;
  const target = crypto.randomUUID();
  const controller = new NativeChatController(bridge, undefined, undefined, {
    readEditorSurfaces: () => ({
      active: "/poster.svg",
      open: ["/poster.svg"],
      truncated: false,
    }),
    subscribeToEditorSurfaces: () => () => {},
    svgText: {
      hasSelection: () => true,
      subscribe: () => () => {},
      capture: () => target,
      invoke: () => ({ kind: "unavailable" }),
    },
  });
  try {
    await controller.select("workbench");
    await controller.submit("Then tighten this selection.");
    expect(send.mock.calls[0]?.[0]).toBe("enqueue");
    expect(send.mock.calls[0]?.at(-1)).toBe(target);
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
  // A lifecycle read taken before acceptance can still be in flight when
  // the queue receipt arrives. The new review must come from a later read.
  const prior = await bridge.observe("chat-a");
  const stale = Promise.withResolvers<NativeChatObservation>();
  vi.spyOn(bridge, "observe").mockReturnValueOnce(stale.promise);
  controller.checkObservation();
  const submitted = controller.submit("Check the page numbers.");
  await vi.waitFor(() => expect(enqueue).toHaveBeenCalledOnce());
  stale.resolve(prior);
  await submitted;
  expect(controller.read().observation?.snapshot.queuedInputs).toBe(1);
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

function queuedEditFixture() {
  const value = fixture();
  const state = {
    revision: 2,
    items: [
      {
        inputId: "queued",
        preview: "Original",
        textOnly: true,
        operatingRegime: "plan",
        effort: "ultra",
      },
    ] as readonly NativeChatQueueItem[],
  };
  const observe = value.bridge.observe.bind(value.bridge);
  value.bridge.observe = async (id) => {
    const current = await observe(id);
    return {
      observationId: `${id}-${state.revision}`,
      snapshot: {
        ...current.snapshot,
        sessionRevision: state.revision,
        queuedInputs: id === "chat-a" ? state.items.length : 0,
      },
    };
  };
  value.bridge.queue = async () => ({
    items: state.items,
    offset: 0,
    previousOffset: null,
    nextOffset: null,
  });
  const read = vi
    .fn<NonNullable<DesktopNativeChat["queuedText"]>>()
    .mockResolvedValue("Original\nSecond line");
  const edit = vi.fn<NonNullable<DesktopNativeChat["editQueue"]>>(
    async (sessionId, change) => {
      state.revision++;
      if (change.action === "replace" || change.action === "replaceText")
        state.items = state.items.map((item) =>
          item.inputId === change.inputId
            ? { ...item, inputId: "replacement", preview: change.text }
            : item
        );
      return {
        sessionId,
        requestId: change.requestId,
        sessionRevision: state.revision,
      };
    }
  );
  value.bridge.queuedText = read;
  value.bridge.editQueue = edit;
  return { ...value, state, read, edit };
}

function queuedCaptionFixture(attachment = "photo.jpg") {
  const value = queuedEditFixture();
  const attachments = [
    {
      name: attachment,
      mimeType: attachment.endsWith("jpg") ? "image/jpeg" : "text/plain",
      ...(attachment.endsWith("jpg") && { previewId: "retained-image" }),
    },
  ];
  value.state.items = value.state.items.map((item) => ({
    ...item,
    textOnly: false,
    textEditable: true,
    attachments,
  }));
  const inspect = vi
    .fn<NonNullable<DesktopNativeChat["queuedMessage"]>>()
    .mockResolvedValue({
      inputId: "queued",
      text: "Original caption\nSecond line",
      textOnly: false,
      textEditable: true,
      attachments,
    });
  value.bridge.queuedMessage = inspect;
  value.bridge.acceptsQueuedTextReplacement = async () => true;
  return { ...value, inspect, attachments };
}

it.each(["photo.jpg", "notes.txt"])(
  "edits only the text of a queued %s through negotiated replacement",
  async (name) => {
    const { controller, edit, read, inspect, attachments, state, running } =
      queuedCaptionFixture(name);
    running.add("chat-a");
    await controller.select("chat-a");
    await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
    const item = controller.read().queue!.items[0];
    expect(controller.canEditQueuedText(item)).toBe(true);
    expect(controller.canSteerQueued(item)).toBe(false);
    await controller.editQueuedText("queued");
    expect(inspect).toHaveBeenCalledExactlyOnceWith(
      "chat-a",
      "chat-a-2",
      "queued"
    );
    expect(read).not.toHaveBeenCalled();
    expect(controller.read().queueDraft).toEqual({
      inputId: "queued",
      text: "Original caption\nSecond line",
      replaceText: true,
      allowEmpty: true,
    });
    await expect(controller.saveQueueDraft("Revised\nCaption")).resolves.toBe(
      true
    );
    expect(edit).toHaveBeenCalledExactlyOnceWith("chat-a", {
      action: "replaceText",
      inputId: "queued",
      text: "Revised\nCaption",
      observationId: "chat-a-2",
      requestId: expect.any(String),
    });
    expect(state.items[0]).toMatchObject({
      attachments,
      preview: "Revised\nCaption",
      operatingRegime: "plan",
      effort: "ultra",
      textOnly: false,
    });
    expect(controller.read().queueDraft).toBeNull();
    controller.disconnect();
  }
);

it("can add or clear an image-only message's caption without replacing its image", async () => {
  const { controller, state, inspect, edit } = queuedCaptionFixture();
  state.items = state.items.map((item) => ({ ...item, preview: null }));
  inspect.mockResolvedValue({
    inputId: "queued",
    text: "",
    textEditable: true,
    attachments: state.items[0].attachments,
  });
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  expect(controller.canEditQueuedText(controller.read().queue!.items[0])).toBe(
    true
  );
  await controller.editQueuedText("queued");
  await expect(controller.saveQueueDraft("")).resolves.toBe(true);
  expect(edit.mock.calls[0][1]).toMatchObject({
    action: "replaceText",
    text: "",
  });
  expect(state.items[0].attachments).toHaveLength(1);
  controller.disconnect();
});

it.each(["missing", "false", "rejects", "no-inspection", "no-fact", "refused"])(
  "never falls back to whole-input replacement for an attachment (%s)",
  async (reason) => {
    const { bridge, controller, state, read, inspect, edit } =
      queuedCaptionFixture();
    if (reason === "missing") delete bridge.acceptsQueuedTextReplacement;
    if (reason === "false")
      bridge.acceptsQueuedTextReplacement = async () => false;
    if (reason === "rejects")
      bridge.acceptsQueuedTextReplacement = async () => {
        throw new Error("old-main");
      };
    if (reason === "no-inspection") delete bridge.queuedMessage;
    if (reason === "no-fact" || reason === "refused")
      state.items = state.items.map((item) => ({
        ...item,
        textEditable: reason === "refused" ? false : undefined,
      }));
    await controller.select("chat-a");
    await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
    expect(
      controller.canEditQueuedText(controller.read().queue!.items[0])
    ).toBe(false);
    await controller.editQueuedText("queued");
    expect(controller.read().queueDraft).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
    controller.disconnect();
  }
);

it.each(["wrong-id", "no-fact", "revision", "consumed", "selection"])(
  "refuses an attachment edit whose inspection is no longer valid (%s)",
  async (reason) => {
    const { controller, state, inspect, attachments, edit } =
      queuedCaptionFixture();
    const pending =
      Promise.withResolvers<Awaited<ReturnType<typeof inspect>>>();
    inspect.mockReturnValue(pending.promise);
    await controller.select("chat-a");
    await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
    const opening = controller.editQueuedText("queued");
    if (reason === "selection") await controller.select("chat-b");
    if (reason === "revision" || reason === "consumed") {
      state.revision++;
      if (reason === "consumed") state.items = [];
      await controller.repair();
    }
    pending.resolve({
      inputId: reason === "wrong-id" ? "other" : "queued",
      text: "Caption",
      textEditable: reason !== "no-fact",
      attachments,
    });
    await opening;
    expect(controller.read().queueDraft).toBeNull();
    expect(edit).not.toHaveBeenCalled();
    controller.disconnect();
  }
);

it("retains an attachment caption edit and replays the exact request after a lost receipt", async () => {
  const { bridge, controller, edit, state } = queuedCaptionFixture();
  let receipt: Awaited<ReturnType<typeof edit>>;
  const retry = vi.fn<NonNullable<DesktopNativeChat["editQueue"]>>(
    async (...args) => {
      if (retry.mock.calls.length === 1) {
        receipt = await edit(...args);
        throw new Error("transport_closed");
      }
      return receipt!;
    }
  );
  bridge.editQueue = retry;
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  await controller.editQueuedText("queued");
  await expect(controller.saveQueueDraft("")).resolves.toBe(false);
  expect(controller.read().queueDraft).toMatchObject({
    text: "",
    replaceText: true,
    allowEmpty: true,
  });
  expect(state.items[0].inputId).toBe("replacement");
  await expect(controller.saveQueueDraft()).resolves.toBe(true);
  expect(retry.mock.calls[1]).toEqual(retry.mock.calls[0]);
  expect(edit).toHaveBeenCalledOnce();
  expect(controller.read().queueDraft).toBeNull();
  controller.disconnect();
});

it("does not allow clearing an editable input that has only text", async () => {
  const { bridge, controller, state, inspect, edit } = queuedCaptionFixture();
  state.items = state.items.map((item) => ({ ...item, attachments: [] }));
  inspect.mockResolvedValue({
    inputId: "queued",
    text: "Two text parts",
    textEditable: true,
  });
  bridge.queuedText = undefined;
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  await controller.editQueuedText("queued");
  expect(controller.read().queueDraft?.allowEmpty).toBe(false);
  await expect(controller.saveQueueDraft("")).resolves.toBe(false);
  expect(edit).not.toHaveBeenCalled();
  controller.disconnect();
});

it("confirms explicit main-composer edit text while retaining captured queued settings", async () => {
  const { controller, state, edit } = queuedEditFixture();
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  await controller.editQueuedText("queued");
  expect(controller.read().queueDraft).toEqual({
    inputId: "queued",
    text: "Original\nSecond line",
  });
  await expect(
    controller.saveQueueDraft("Updated\n\nSecond paragraph")
  ).resolves.toBe(true);
  expect(edit).toHaveBeenCalledExactlyOnceWith("chat-a", {
    action: "replace",
    inputId: "queued",
    text: "Updated\n\nSecond paragraph",
    observationId: "chat-a-2",
    requestId: expect.any(String),
  });
  expect(controller.read().queueDraft).toBeNull();
  expect(state.items).toEqual([
    expect.objectContaining({
      preview: "Updated\n\nSecond paragraph",
      operatingRegime: "plan",
      effort: "ultra",
    }),
  ]);
  controller.disconnect();
});

it("retains failed and empty main-composer edit text without reporting a save", async () => {
  const { controller, edit } = queuedEditFixture();
  edit.mockRejectedValue(new Error("queue_change_refused"));
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  await controller.editQueuedText("queued");
  await expect(controller.saveQueueDraft("Keep my revised text")).resolves.toBe(
    false
  );
  expect(controller.read().queueDraft).toEqual({
    inputId: "queued",
    text: "Keep my revised text",
  });
  expect(controller.read().acting).toBe(false);
  await expect(controller.saveQueueDraft("  \n")).resolves.toBe(false);
  expect(controller.read().queueDraft?.text).toBe("  \n");
  expect(edit).toHaveBeenCalledOnce();
  controller.disconnect();
});

it("keeps a queued edit through host replacement and requires a fresh save basis", async () => {
  const { bridge, controller, edit } = queuedEditFixture();
  const observe = bridge.observe.bind(bridge);
  let retired = false;
  bridge.load = async (sessionId) => ({
    sessionId,
    attachmentId: retired ? "replacement-attachment" : sessionId,
  });
  bridge.observe = async (attachmentId) => {
    if (retired && attachmentId === "chat-a")
      throw new Error("native_chat_attachment_unavailable");
    const observed = await observe("chat-a");
    return {
      ...observed,
      observationId:
        attachmentId === "chat-a"
          ? observed.observationId
          : "replacement-observation",
    };
  };
  edit.mockRejectedValueOnce(new Error("transport_closed"));

  try {
    await controller.select("chat-a");
    await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
    await controller.editQueuedText("queued");
    await expect(
      controller.saveQueueDraft("Keep my revised text")
    ).resolves.toBe(false);
    retired = true;
    controller.checkObservation();
    await vi.waitFor(() => {
      expect(controller.read().connectionRecovery).toBeNull();
      expect(controller.read().observation?.observationId).toBe(
        "replacement-observation"
      );
      expect(controller.queueCurrent).toBe(true);
    });

    expect(controller.read().queueDraft).toEqual({
      inputId: "queued",
      text: "Keep my revised text",
    });
    expect(edit).toHaveBeenCalledTimes(1);
    await expect(controller.saveQueueDraft()).resolves.toBe(true);
    expect(edit).toHaveBeenLastCalledWith(
      "replacement-attachment",
      expect.objectContaining({
        action: "replace",
        inputId: "queued",
        text: "Keep my revised text",
        observationId: "replacement-observation",
      })
    );
    expect(edit.mock.calls[1][1].requestId).not.toBe(
      edit.mock.calls[0][1].requestId
    );
  } finally {
    controller.disconnect();
  }
});

it("replays an unconfirmed edit receipt after the original queued input was replaced", async () => {
  const { bridge, controller, state, edit } = queuedEditFixture();
  let receipt: Awaited<ReturnType<typeof edit>>;
  const retry = vi.fn<NonNullable<DesktopNativeChat["editQueue"]>>(
    async (...args) => {
      if (retry.mock.calls.length === 1) {
        receipt = await edit(...args);
        throw new Error("transport_closed");
      }
      return receipt!;
    }
  );
  bridge.editQueue = retry;
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  await controller.editQueuedText("queued");
  await expect(controller.saveQueueDraft("Revised once")).resolves.toBe(false);
  expect(state.items[0].inputId).toBe("replacement");
  expect(controller.read().queueDraft?.text).toBe("Revised once");
  await expect(controller.saveQueueDraft()).resolves.toBe(true);
  expect(retry.mock.calls[1]).toEqual(retry.mock.calls[0]);
  expect(edit).toHaveBeenCalledOnce();
  expect(controller.read().queueDraft).toBeNull();
  controller.disconnect();
});

it("keeps an open edit after its queued input is consumed and refuses a fresh replacement", async () => {
  const { controller, state, edit } = queuedEditFixture();
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  await controller.editQueuedText("queued");
  state.items = [];
  state.revision++;
  await controller.repair();
  await vi.waitFor(() => expect(controller.read().queue).toBeNull());
  await expect(
    controller.saveQueueDraft("Keep the unsaved edit")
  ).resolves.toBe(false);
  expect(controller.read().queueDraft?.text).toBe("Keep the unsaved edit");
  expect(edit).not.toHaveBeenCalled();
  controller.disconnect();
});

it.each(["revision", "consumed", "selection"] as const)(
  "does not open queued text whose %s changed while loading",
  async (change) => {
    const { controller, state, read } = queuedEditFixture();
    const pending = Promise.withResolvers<string>();
    read.mockReturnValue(pending.promise);
    await controller.select("chat-a");
    await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
    const opening = controller.editQueuedText("queued");
    expect(controller.read().acting).toBe(true);
    if (change === "selection") await controller.select("chat-b");
    else {
      state.revision++;
      if (change === "consumed") state.items = [];
      await controller.repair();
    }
    await vi.waitFor(() => expect(controller.read().queueLoading).toBe(false));
    pending.resolve("Text from an older read");
    await opening;
    expect(controller.read().queueDraft).toBeNull();
    expect(controller.read().acting).toBe(false);
    expect(controller.read().error).toBe(
      change === "selection" ? null : "Couldn't open the queued message."
    );
    controller.disconnect();
  }
);

it("does not settle a queued save into a newly selected chat", async () => {
  const { controller, edit } = queuedEditFixture();
  const pending = Promise.withResolvers<Awaited<ReturnType<typeof edit>>>();
  edit.mockReturnValue(pending.promise);
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  await controller.editQueuedText("queued");
  const saving = controller.saveQueueDraft("Edited in chat A");
  await controller.select("chat-b");
  pending.resolve({
    sessionId: "chat-a",
    requestId: edit.mock.calls[0][1].requestId,
    sessionRevision: 3,
  });
  await expect(saving).resolves.toBe(false);
  expect(controller.read()).toMatchObject({
    selected: "chat-b",
    queueDraft: null,
    acting: false,
    error: null,
  });
  controller.disconnect();
});

it.each([
  { inputId: "queued", preview: null },
  { inputId: "queued", preview: "Other parts", textOnly: false },
  { inputId: "queued", preview: "Not editable", textEditable: false },
  { inputId: "queued", preview: "Image", attachments: [{ name: "photo.png" }] },
  {
    inputId: "queued",
    preview: "Goal",
    goalStart: { objective: "Goal", criteria: ["Goal"], automatic: true },
  },
] satisfies NativeChatQueueItem[])(
  "refuses to load a non-editable queued input: %j",
  async (item) => {
    const { controller, state, read } = queuedEditFixture();
    state.items = [item];
    await controller.select("chat-a");
    await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
    await controller.editQueuedText("queued");
    expect(read).not.toHaveBeenCalled();
    expect(controller.read().queueDraft).toBeNull();
    controller.disconnect();
  }
);

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
  await expect(controller.saveQueueDraft()).resolves.toBe(false);
  expect(controller.read().queueDraft).toEqual({
    inputId: "queued",
    text: "Revised draft",
  });
  expect(edits).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  await expect(controller.saveQueueDraft()).resolves.toBe(true);
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

it("keeps other queued steering out of the composer while it holds an edit", async () => {
  const { bridge, controller, running, state, read, edit } =
    queuedEditFixture();
  running.add("chat-a");
  state.items = [
    { inputId: "editing", preview: "Edit this", textOnly: true },
    { inputId: "other", preview: "Steer this", textOnly: true },
  ];
  const steer = vi
    .fn<NonNullable<DesktopNativeChat["steer"]>>()
    .mockRejectedValue(new Error("turn refused steering"));
  bridge.steer = steer;
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.queueCurrent).toBe(true));
  const other = controller.read().queue!.items[1];
  expect(controller.canSteerQueued(other)).toBe(true);
  await controller.editQueuedText("editing");
  const draft = controller.read().queueDraft;
  read.mockClear();

  expect(controller.canSteerQueued(other)).toBe(false);
  await expect(controller.steerQueued("other")).resolves.toBeNull();
  expect(read).not.toHaveBeenCalled();
  expect(edit).not.toHaveBeenCalled();
  expect(steer).not.toHaveBeenCalled();
  expect(controller.read().queueDraft).toBe(draft);
  expect(state.items.map((item) => item.inputId)).toEqual(["editing", "other"]);

  controller.closeQueueDraft();
  expect(controller.canSteerQueued(other)).toBe(true);
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
  expect(controller.canSteerQueued({ ...item, textOnly: false })).toBe(false);
  expect(
    controller.canSteerQueued({
      ...item,
      attachments: [{ name: "photo.png", mimeType: "image/png" }],
    })
  ).toBe(false);
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

it.each(["standard", "ultra", "standard plan"] as const)(
  "starts a %s goal only on explicit acceptance and reuses its exact input on retry",
  async (effort) => {
    const { bridge, controller } = fixture();
    const request = {
      objective: "Prepare the export",
      criteria: ["Verify the output"],
      allowance: { workTurns: 3, inferenceSteps: 32 },
      automatic: false,
      ...(effort === "ultra" && { effort }),
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
    start.mockRejectedValueOnce(new Error("native_chat_goal_start_unverified"));
    bridge.startGoal = start;
    bridge.acceptsGoalEffort = async () => effort === "ultra";
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

it.each([[{ effort: "ultra" as const }, "Ultra is unavailable"]])(
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

const SIDE_REFUSALS = [
  "fork",
  "side_chat",
  "compaction",
  "goals",
  "subagents",
  "delegation",
  "wakeups",
  "catalog",
] as const;

function sideFixture() {
  const f = fixture();
  let opened = 0;
  /** Side chats the host has titled, by attachment. */
  const titles = new Map<string, string>();
  const pendingTitles = new Set<string>();
  const observe = f.bridge.observe.bind(f.bridge);
  f.bridge.observe = async (id) => {
    const observation = await observe(id);
    const title = titles.get(id);
    return id.startsWith("side-")
      ? {
          ...observation,
          snapshot: {
            ...observation.snapshot,
            side: {
              parentSessionId: "chat-a",
              temporary: true as const,
              unavailable: SIDE_REFUSALS,
              ...(title && { title }),
              ...(pendingTitles.has(id) && {
                titleGenerationPending: true as const,
              }),
            },
          },
        }
      : observation;
  };
  const open = vi.fn<NonNullable<DesktopNativeChat["openSideChat"]>>(
    async (parent) => {
      const id = `side-${++opened}`;
      return {
        attachmentId: id,
        sessionId: `side/${id}`,
        parentSessionId: parent,
        compacted: false,
        omitted: false,
      };
    }
  );
  const close = vi.fn<NonNullable<DesktopNativeChat["closeSideChat"]>>(
    async () => {}
  );
  f.bridge.openSideChat = open;
  f.bridge.closeSideChat = close;
  f.bridge.commands = async () => ["compact", "fork"];
  f.bridge.runCommand = vi.fn<NonNullable<DesktopNativeChat["runCommand"]>>();
  return { ...f, open, close, titles, pendingTitles };
}

it("opens a side chat at once on /side, and /side alone shows it again", async () => {
  const { bridge, controller, open } = sideFixture();
  const submit = vi.spyOn(bridge, "submit");
  await controller.select("chat-a");
  await vi.waitFor(() =>
    expect(controller.read().commands).toEqual(["compact", "fork"])
  );
  expect(controller.canOpenSideChat).toBe(true);
  const scope = controller.read().scope;
  await controller.submit("/side");
  const [side] = controller.read().sideChats;
  expect(controller.read().sideChats).toHaveLength(1);
  expect(side.focus).toBe(1);
  expect(open).toHaveBeenCalledExactlyOnceWith("chat-a");
  expect(submit).not.toHaveBeenCalled();
  expect(controller.read().scope).toBe(scope);
  expect(controller.read().selected).toBe("chat-a");

  // The side chat is an ordinary chat bound to the side session.
  await side.chat.opened();
  expect(side.chat.fixedSession).toBe(true);
  expect(side.chat.read().selected).toBe("side/side-1");
  await vi.waitFor(() =>
    expect(side.chat.read().commands).toEqual(["compact", "fork"])
  );

  // /side alone, typed or chosen, shows the open side chat again.
  await controller.submit("/side");
  expect(controller.read().sideChats).toEqual([
    expect.objectContaining({ id: side.id, focus: 2 }),
  ]);
  await controller.runComposerCommand("side");
  expect(controller.read().sideChats).toEqual([
    expect.objectContaining({ id: side.id, focus: 3 }),
  ]);
  expect(open).toHaveBeenCalledTimes(1);
  controller.disconnect();
});

it("opens a new side chat for each /side with a question", async () => {
  const { bridge, controller, open } = sideFixture();
  const submit = vi.spyOn(bridge, "submit");
  await controller.select("chat-a");
  await controller.submit("/side What did we decide?");
  await controller.submit("/side And why?");
  expect(open).toHaveBeenCalledTimes(2);
  expect(submit.mock.calls.map(([id, , text]) => [id, text])).toEqual([
    ["side-1", "What did we decide?"],
    ["side-2", "And why?"],
  ]);
  const [first, second] = controller.read().sideChats;
  expect(controller.read().sideChats).toHaveLength(2);
  expect(first.id).not.toBe(second.id);
  expect(first.chat).not.toBe(second.chat);
  expect(controller.read().messages).toEqual([]);

  // /side alone shows the side chat used last: the newest, until the person
  // sends from an earlier one.
  await controller.submit("/side");
  expect(controller.read().sideChats.map(({ focus }) => focus)).toEqual([1, 2]);
  await first.chat.submit("One more thing.");
  await controller.submit("/side");
  expect(controller.read().sideChats.map(({ focus }) => focus)).toEqual([2, 2]);
  expect(open).toHaveBeenCalledTimes(2);
  controller.disconnect();
});

it("offers in a side chat only what its snapshot does not refuse", async () => {
  const { bridge, controller } = sideFixture();
  bridge.goal = async () => ({ observationId: null, goal: null });
  bridge.startGoal = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>();
  bridge.submitInRegime = vi.fn<
    NonNullable<DesktopNativeChat["submitInRegime"]>
  >(async (_action, id, inputId) => ({
    sessionId: id,
    inputId,
    disposition: "claimed",
    inputPosition: 1,
    turnId: `turn-${id}`,
  }));
  bridge.acceptsEffort = async () => true;
  await controller.select("chat-a");
  await vi.waitFor(() => expect(controller.read().effortAvailable).toBe(true));
  controller.selectEffort("ultra");
  expect(controller.read().effort).toBe("ultra");
  await controller.openSideChat();
  const side = controller.read().sideChats[0].chat;

  // Before its first snapshot a side chat offers nothing it could refuse.
  expect(side.offers("goals")).toBe(false);
  await side.opened();
  expect(side.read().observation?.snapshot.side).toBeDefined();
  for (const refusal of SIDE_REFUSALS) expect(side.offers(refusal)).toBe(false);
  for (const refusal of SIDE_REFUSALS)
    expect(controller.offers(refusal)).toBe(true);
  expect(side.canOpenSideChat).toBe(false);
  expect(side.canStartGoal).toBe(false);
  expect(side.canOrganizeChats).toBe(false);
  await vi.waitFor(() =>
    expect(side.read().commands).toEqual(["compact", "fork"])
  );
  expect(side.commandChoices).toEqual([]);
  expect(controller.commandChoices).toEqual(["compact", "fork"]);
  await expect(side.runCommand("fork")).rejects.toThrow(
    "native_chat_command_unavailable"
  );
  await expect(side.submit("/side Nested?")).rejects.toThrow(
    "Side chats are unavailable in this chat."
  );

  // Effort follows the parent without Ultra; Plan stays available.
  expect(side.read().effort).toBe("xhigh");
  side.selectEffort("ultra");
  expect(side.read().effort).toBe("xhigh");
  side.selectGoalIntent(true);
  expect(side.read().goalIntent).toBe(false);
  await side.submit("/plan Outline the change.");
  expect(bridge.submitInRegime).toHaveBeenLastCalledWith(
    "submit",
    "side-1",
    expect.any(String),
    "Outline the change.",
    "plan",
    "xhigh"
  );

  // A fixed chat never switches to another chat.
  await side.select("chat-b");
  expect(side.read().selected).toBe("side/side-1");
  controller.disconnect();
});

it("closes one side chat at a time and discards all when this chat switches, never by detaching", async () => {
  const { bridge, controller, close } = sideFixture();
  const detach = vi.spyOn(bridge, "detach");
  await controller.select("chat-a");
  await controller.openSideChat();
  await controller.openSideChat();
  const [first, second] = controller.read().sideChats;
  await Promise.all([first.chat.opened(), second.chat.opened()]);
  await controller.closeSideChat(first.id);
  expect(close).toHaveBeenCalledExactlyOnceWith("side-1");
  expect(controller.read().sideChats).toEqual([second]);
  expect(detach).not.toHaveBeenCalledWith("side-1");

  await controller.openSideChat();
  const third = controller.read().sideChats[1];
  await third.chat.opened();
  await controller.select("chat-b");
  expect(controller.read().sideChats).toEqual([]);
  await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(3));
  expect(close).toHaveBeenCalledWith("side-2");
  expect(close).toHaveBeenCalledWith("side-3");
  expect(detach).not.toHaveBeenCalledWith("side-2");
  expect(detach).not.toHaveBeenCalledWith("side-3");
  controller.disconnect();
});

it("reports a side chat that did not close", async () => {
  const { controller, close } = sideFixture();
  await controller.select("chat-a");
  await controller.openSideChat();
  const [side] = controller.read().sideChats;
  await side.chat.opened();
  close.mockRejectedValueOnce(new Error("side_chat_discard_pending"));
  await controller.closeSideChat(side.id);
  expect(controller.read().sideChats).toEqual([]);
  expect(controller.read().error).toBe(
    "Couldn't confirm that the side chat closed yet. Closing continues in the background."
  );
  controller.disconnect();
});

it("reports a refused side chat in this chat and ends it", async () => {
  const { bridge, controller, open } = sideFixture();
  const submit = vi.spyOn(bridge, "submit");
  await controller.select("chat-a");
  await controller.openSideChat();
  const [kept] = controller.read().sideChats;
  open.mockRejectedValueOnce(new Error("side_chat_parent_limit"));
  await controller.submit("/side One too many?");
  expect(controller.read().sideChats).toEqual([kept]);
  expect(controller.read().error).toBe(
    "This chat already has 8 side chats open. Close one to open another."
  );
  expect(submit).not.toHaveBeenCalled();
  open.mockRejectedValueOnce(new Error("side_chat_scope_limit"));
  await controller.openSideChat();
  await vi.waitFor(() =>
    expect(controller.read().error).toBe(
      "Too many side chats are open. Close one to open another."
    )
  );
  expect(controller.read().sideChats).toEqual([kept]);
  controller.disconnect();
});

it("titles a side chat once its snapshot carries the generated title", async () => {
  const { controller, titles } = sideFixture();
  await controller.select("chat-a");
  await controller.submit("/side Which banner sizes?");
  const [side] = controller.read().sideChats;
  expect(side.chat.sideChatTitle()).toBe("Side chat");
  titles.set("side-1", "Banner sizes");
  await side.chat.submit("And for mobile?");
  await vi.waitFor(() =>
    expect(side.chat.sideChatTitle()).toBe("Banner sizes")
  );
  // A side chat's title never names or renames a saved chat.
  expect(side.chat.canOrganizeChats).toBe(false);
  expect(controller.chatTitle("chat-a")).toBe("New chat");
  controller.disconnect();
});

it("follows a provisional side title past the final turn snapshot without rereading its transcript", async () => {
  const { controller, bridge, titles, pendingTitles } = sideFixture();
  titles.set("side-1", "Which banner sizes?");
  pendingTitles.add("side-1");
  vi.useFakeTimers();
  try {
    await controller.select("chat-a");
    await controller.openSideChat();
    const [side] = controller.read().sideChats;
    await side.chat.opened();
    expect(side.chat.sideChatTitle()).toBe("Which banner sizes?");
    const transcript = vi.spyOn(bridge, "transcript");
    await vi.advanceTimersByTimeAsync(6_000);
    titles.set("side-1", "Banner sizes");
    pendingTitles.clear();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(side.chat.sideChatTitle()).toBe("Banner sizes");
    const observe = vi.spyOn(bridge, "observe");
    await vi.advanceTimersByTimeAsync(18_000);
    expect(observe).not.toHaveBeenCalled();
    expect(transcript).not.toHaveBeenCalled();
  } finally {
    controller.disconnect();
    vi.useRealTimers();
  }
});

it("needs an attached chat to open a side chat", async () => {
  const { controller, open } = sideFixture();
  await controller.select(null);
  expect(controller.canOpenSideChat).toBe(false);
  await expect(controller.submit("/side Anything?")).rejects.toThrow(
    "Side chats are unavailable in this chat."
  );
  expect(open).not.toHaveBeenCalled();
  controller.disconnect();

  const unsupported = sideFixture();
  unsupported.bridge.openSideChat = undefined;
  await unsupported.controller.select("chat-a");
  expect(unsupported.controller.canOpenSideChat).toBe(false);
  unsupported.controller.disconnect();
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
  const blobs = new Map<string, ComposerDraftBlob>();
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

it("keeps a new chat's draft with the chat its refused first send created", async () => {
  const { bridge, controller } = fixture();
  bridge.create = async () => ({ attachmentId: "chat-n", sessionId: "chat-n" });
  const accepts = vi.fn<NonNullable<DesktopNativeChat["acceptsPng"]>>(
    async () => true
  );
  bridge.acceptsPng = accepts;
  bridge.submitImage = vi.fn<NonNullable<DesktopNativeChat["submitImage"]>>();
  bridge.submitInRegime =
    vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>();
  const blobs = new Map<string, ComposerDraftBlob>();
  const drafts = new ComposerDrafts(null, {
    get: async (key) => blobs.get(key) ?? null,
    put: async (key, value) => void blobs.set(key, value),
    delete: async (key) => void blobs.delete(key),
  });
  controller.keepDrafts(drafts, "workspace");
  await controller.select(null);
  await vi.waitFor(() => expect(controller.read().imageInput).toBe(true));
  // The composer keeps the text under the same key.
  const text = { type: "doc", content: [] };
  drafts.write("workspace:new", text);
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
  await controller.pickAttachment(controller.read().scope, "png", {
    name: "sketch.png",
    size: png.byteLength,
    arrayBuffer: async () => png,
  });
  await vi.waitFor(() => expect(blobs.has("workspace:new")).toBe(true));

  // The model turns out not to accept images once the chat exists.
  accepts.mockResolvedValue(false);
  await expect(controller.submit("Describe this sketch")).rejects.toThrow(
    "image_input_unavailable"
  );
  expect(controller.read().selected).toBe("chat-n");
  expect(controller.draftKey()).toBe("workspace:chat-n");
  expect(drafts.read("workspace:chat-n")).toEqual(text);
  expect(drafts.read("workspace:new")).toBeNull();
  await vi.waitFor(() => expect(blobs.has("workspace:chat-n")).toBe(true));
  expect(blobs.has("workspace:new")).toBe(false);
  expect(controller.read().attachmentDraft?.name).toBe("sketch.png");
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
  await controller.pickTransferredAttachment(scope, [
    { kind: "directory", file: new File([], "references") },
  ]);
  expect(controller.read().attachmentNotice).toBe(
    "Folder references are unavailable in this chat."
  );
  await controller.pickTransferredAttachment(scope, [jpeg]);
  expect(controller.read()).toMatchObject({
    attachmentNotice: "Keep the original image File to attach it in Desktop.",
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

/** A media element that decodes a 12.5 s 1920×1080 clip on request. */
class StubVideo extends EventTarget implements video_attachment.Element {
  muted = false;
  preload = "";
  playsInline = false;
  duration = Number.NaN;
  videoWidth = 0;
  videoHeight = 0;
  private time = 0;
  private source = "";
  get src() {
    return this.source;
  }
  set src(value: string) {
    this.source = value;
    queueMicrotask(() => {
      this.duration = 12.5;
      this.videoWidth = 1920;
      this.videoHeight = 1080;
      this.dispatchEvent(new Event("loadedmetadata"));
    });
  }
  get currentTime() {
    return this.time;
  }
  set currentTime(value: number) {
    this.time = value;
    queueMicrotask(() => this.dispatchEvent(new Event("seeked")));
  }
  removeAttribute() {}
  load() {}
}

const POSTER = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

function referenceFixture() {
  const context = fixture();
  const { bridge } = context;
  const onDisk = new WeakSet<File>();
  bridge.acceptsPng = async () => true;
  bridge.acceptsFile = async () => true;
  bridge.submitImage = vi.fn<NonNullable<DesktopNativeChat["submitImage"]>>(
    (sessionId, input) => bridge.submit(sessionId, input.inputId, input.text)
  );
  bridge.submitFile = vi.fn<NonNullable<DesktopNativeChat["submitFile"]>>(
    (sessionId, input) => bridge.submit(sessionId, input.inputId, input.text)
  );
  bridge.acceptsFileReference = async () => true;
  bridge.acceptsDirectoryReference = async () => true;
  bridge.canReferenceFile = (file) => onDisk.has(file);
  const sendReference = vi.fn<
    NonNullable<DesktopNativeChat["submitFileReference"]>
  >((sessionId, input) => bridge.submit(sessionId, input.inputId, input.text));
  bridge.submitFileReference = sendReference;
  const dropped = (name: string, type: string, size: number) => {
    const file = new File(
      [
        new Uint8Array(
          (type.startsWith("image/") ||
            /\.(png|jpe?g|webp|gif)$/i.test(name)) &&
            size <= 20 * 1024 * 1024
            ? size
            : Math.min(size, 16)
        ),
      ],
      name,
      {
        type,
      }
    );
    Object.defineProperty(file, "size", { value: size });
    const read = vi.spyOn(file, "arrayBuffer");
    onDisk.add(file);
    return { file, read };
  };
  // The real thumbnail module, reading a stubbed media element.
  const probe = vi.spyOn(video_attachment, "probe").mockImplementation((file) =>
    original(file, {
      video: () => new StubVideo(),
      canvas: (width, height) => ({
        width,
        height,
        draw: () => {},
        toDataURL: () => POSTER,
      }),
      createObjectURL: () => "blob:clip",
      revokeObjectURL: () => {},
    })
  );
  return { ...context, sendReference, dropped, probe };
}
const original = video_attachment.probe;

it("attaches a dropped folder only by its original reference without size, bytes or a media probe", async () => {
  const { bridge, controller, sendReference, dropped, probe } =
    referenceFixture();
  try {
    await controller.select("chat-a");
    // A folder whose name looks like media still never enters perception.
    const directory = dropped("research.mov", "video/quicktime", 4096);
    await controller.pickTransferredAttachment(controller.read().scope, [
      { kind: "directory", file: directory.file },
    ]);
    expect(controller.read().attachmentDraft).toEqual({
      kind: "reference",
      name: "research.mov",
      mimeType: "inode/directory",
    });
    expect(controller.attachmentPreview()).toBeNull();
    expect(probe).not.toHaveBeenCalled();
    expect(directory.read).not.toHaveBeenCalled();
    await controller.submit("Inspect the referenced folder with your tools.");
    expect(sendReference).toHaveBeenCalledExactlyOnceWith("chat-a", {
      action: "submit",
      inputId: expect.any(String),
      text: "Inspect the referenced folder with your tools.",
      file: directory.file,
      mimeType: "inode/directory",
      operatingRegime: "act",
    });
    expect(bridge.submitFile).not.toHaveBeenCalled();
    expect(bridge.submitImage).not.toHaveBeenCalled();
    expect(controller.read().attachmentDraft).toBeNull();
  } finally {
    vi.restoreAllMocks();
    controller.disconnect();
  }
});

it.each(["missing", "false", "failed"] as const)(
  "preserves the current draft when Main's separate folder capability is %s",
  async (support) => {
    const { bridge, controller, sendReference, dropped, probe } =
      referenceFixture();
    if (support === "missing") delete bridge.acceptsDirectoryReference;
    else
      bridge.acceptsDirectoryReference = async () => {
        if (support === "failed") throw new Error("old host unavailable");
        return false;
      };
    try {
      await controller.select("chat-a");
      const existing = dropped("archive.zip", "application/zip", 1_000_000);
      await controller.pickTransferredAttachment(controller.read().scope, [
        { kind: "file", file: existing.file },
      ]);
      const previous = controller.read().attachmentDraft;
      const directory = dropped("references", "", 4096);
      await controller.pickTransferredAttachment(controller.read().scope, [
        { kind: "directory", file: directory.file },
      ]);
      expect(controller.read().attachmentDraft).toBe(previous);
      expect(controller.read().attachmentNotice).toBe(
        "Folder references are unavailable in this chat."
      );
      expect(directory.read).not.toHaveBeenCalled();
      expect(probe).not.toHaveBeenCalled();
      expect(sendReference).not.toHaveBeenCalled();
      expect(bridge.submitFile).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      controller.disconnect();
    }
  }
);

it.each(["new", "paused"] as const)(
  "rechecks folder support before effects in a %s chat and keeps the selected resource on refusal",
  async (state) => {
    const { bridge, controller, sendReference, dropped } = referenceFixture();
    const create = vi.spyOn(bridge, "create");
    const control = vi.spyOn(bridge, "control");
    if (state === "paused") {
      const observe = bridge.observe.bind(bridge);
      bridge.observe = async (id) => {
        const value = await observe(id);
        return {
          ...value,
          snapshot: {
            ...value.snapshot,
            current: {
              turnId: "paused",
              epoch: 1,
              journalPosition: 1,
              historyPosition: 1,
              controlRevision: 1,
              paused: true,
              cancelled: false,
              disposition: "suspended",
              status: null,
            },
          },
        };
      };
      bridge.enqueue = (attachment, input, text) =>
        bridge.submit(attachment, input, text);
    }
    try {
      await controller.select(state === "new" ? null : "chat-a");
      await vi.waitFor(() =>
        expect(controller.read().directoryReferenceInput).toBe(true)
      );
      const directory = dropped("references", "", 4096);
      await controller.pickTransferredAttachment(controller.read().scope, [
        { kind: "directory", file: directory.file },
      ]);
      bridge.acceptsDirectoryReference = async () => false;
      await expect(
        controller.submit("Keep this folder draft.")
      ).rejects.toThrow("native_chat_directory_reference_unavailable");
      expect(create).not.toHaveBeenCalled();
      expect(control).not.toHaveBeenCalled();
      expect(sendReference).not.toHaveBeenCalled();
      expect(controller.read().attachmentDraft).toEqual({
        kind: "reference",
        name: "references",
        mimeType: "inode/directory",
      });
    } finally {
      vi.restoreAllMocks();
      controller.disconnect();
    }
  }
);

it("reconciles a queued folder's exact uncertain input without resending after capability loss", async () => {
  const { bridge, controller, sendReference, dropped, running } =
    referenceFixture();
  bridge.enqueue = (attachment, input, text) =>
    bridge.submit(attachment, input, text);
  const receipts = vi.spyOn(bridge, "inputReceipt");
  sendReference.mockRejectedValueOnce(new Error("lost acceptance response"));
  try {
    running.add("chat-a");
    await controller.select("chat-a");
    const directory = dropped("references", "", 4096);
    await controller.pickTransferredAttachment(controller.read().scope, [
      { kind: "directory", file: directory.file },
    ]);
    await expect(
      controller.submit("Inspect this folder next.")
    ).rejects.toThrow("lost acceptance response");
    const sent = sendReference.mock.calls[0][1];
    expect(sent).toMatchObject({
      action: "enqueue",
      file: directory.file,
      mimeType: "inode/directory",
    });
    bridge.acceptsDirectoryReference = async () => false;
    receipts.mockResolvedValueOnce({
      sessionId: "chat-a",
      inputId: sent.inputId,
      disposition: "queued",
      inputPosition: 2,
      turnId: null,
    });
    await controller.submit("Inspect this folder next.");
    expect(sendReference).toHaveBeenCalledTimes(1);
    expect(receipts).toHaveBeenLastCalledWith("chat-a", sent.inputId);
    expect(controller.read().attachmentDraft).toBeNull();
    expect(directory.read).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    controller.disconnect();
  }
});

it.each(["file", "directory"] as const)(
  "keeps a protected %s reference draft with a resource-neutral refusal",
  async (kind) => {
    const { bridge, controller, sendReference, dropped, probe } =
      referenceFixture();
    sendReference.mockRejectedValueOnce(
      new Error("native_chat_file_reference_protected")
    );
    try {
      await controller.select("chat-a");
      const resource = dropped(
        kind === "directory" ? "private-data" : "private.zip",
        "",
        1_000_000
      );
      await controller.pickTransferredAttachment(controller.read().scope, [
        { kind, file: resource.file },
      ]);
      const draft = controller.read().attachmentDraft;
      await expect(controller.submit("Inspect this item.")).rejects.toThrow(
        "native_chat_file_reference_protected"
      );
      expect(controller.read().error).toBe(
        "This item is in Grida's private data and can't be attached."
      );
      expect(controller.read().attachmentDraft).toBe(draft);
      expect(sendReference.mock.calls[0][1].file).toBe(resource.file);
      expect(resource.read).not.toHaveBeenCalled();
      expect(probe).not.toHaveBeenCalled();
      expect(bridge.submitFile).not.toHaveBeenCalled();
      expect(bridge.submitImage).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      controller.disconnect();
    }
  }
);

it("keeps a folder draft visible on reattachment to an older Main, without a text-only send", async () => {
  const { bridge, controller, sendReference, dropped, probe } =
    referenceFixture();
  const drafts = durableDrafts();
  controller.keepDrafts(drafts, "workspace");
  let reopened: NativeChatController | undefined;
  try {
    await controller.select("chat-a");
    const directory = dropped("references", "", 4096);
    await controller.pickTransferredAttachment(controller.read().scope, [
      { kind: "directory", file: directory.file },
    ]);
    controller.disconnect();
    delete bridge.acceptsDirectoryReference;
    reopened = new NativeChatController(bridge);
    reopened.keepDrafts(drafts, "workspace");
    await reopened.select("chat-a");
    expect(reopened.read().attachmentDraft).toEqual({
      kind: "reference",
      name: "references",
      mimeType: "inode/directory",
      error: "Folder references are unavailable in this chat.",
    });
    expect(reopened.canSubmit).toBe(false);
    await expect(
      reopened.submit("Do not discard my resource.")
    ).rejects.toThrow("native_chat_not_ready");
    expect(await drafts.readAttachment("workspace:chat-a")).toMatchObject({
      file: directory.file,
    });
    expect(sendReference).not.toHaveBeenCalled();
    expect(directory.read).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
    bridge.acceptsDirectoryReference = async () => true;
    await reopened.repair();
    expect(reopened.read().attachmentDraft).not.toHaveProperty(
      "error",
      expect.any(String)
    );
    expect(reopened.canSubmit).toBe(true);
    await reopened.submit("Use the preserved folder.");
    expect(sendReference.mock.calls[0][1].file).toBe(directory.file);
  } finally {
    vi.restoreAllMocks();
    controller.disconnect();
    reopened?.disconnect();
  }
});

it("attaches any file: a large file goes by reference without reading its bytes", async () => {
  const { controller, sendReference, dropped, probe } = referenceFixture();
  try {
    await controller.select("chat-a");
    const scope = controller.read().scope;
    expect(controller.canAttach("reference")).toBe(true);
    const archive = dropped("dataset.zip", "application/zip", 3 * 1024 ** 3);
    await controller.pickTransferredAttachment(scope, [
      { kind: "file", file: archive.file },
    ]);
    expect(controller.read().attachmentDraft).toEqual({
      kind: "reference",
      name: "dataset.zip",
      size: 3 * 1024 ** 3,
      mimeType: "application/zip",
    });
    expect(controller.read().attachmentNotice).toBeNull();
    expect(probe).not.toHaveBeenCalled();
    await controller.submit("Unpack and summarize this.");
    expect(sendReference).toHaveBeenCalledExactlyOnceWith("chat-a", {
      action: "submit",
      inputId: expect.any(String),
      text: "Unpack and summarize this.",
      file: archive.file,
      mimeType: "application/zip",
      operatingRegime: "act",
    });
    expect(archive.read).not.toHaveBeenCalled();
    expect(controller.read().attachmentDraft).toBeNull();
  } finally {
    vi.restoreAllMocks();
    controller.disconnect();
  }
});

it("preserves an explicit image draft on a text-only model without a reference fallback", async () => {
  const { bridge, controller, sendReference, dropped } = referenceFixture();
  bridge.acceptsPng = async () => false;
  try {
    await controller.select("chat-a");
    const png = dropped("poster.png", "image/png", 2048);
    await controller.pickTransferredAttachment(controller.read().scope, [
      { kind: "file", file: png.file },
    ]);
    expect(controller.read().attachmentDraft).toMatchObject({
      kind: "image",
      name: "poster.png",
    });
    expect(controller.read().attachmentNotice).toContain("whole draft is kept");
    expect(controller.canSubmit).toBe(false);
    await expect(controller.submit("Use this poster.")).rejects.toThrow(
      "native_chat_not_ready"
    );
    expect(sendReference).not.toHaveBeenCalled();
    expect(png.read).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    controller.disconnect();
  }
});

it("keeps an image when its model cannot use the selected-file capability", async () => {
  const { bridge, controller } = fixture();
  const id = "d".repeat(64);
  bridge.acceptsPng = async () => false;
  bridge.profiles = async () => ({
    active: id,
    choices: [{ id, connection: "Local", model: "Text Fixture" }],
    saved: [],
  });
  try {
    await controller.select("chat-a");
    await controller.pickTransferredAttachment(controller.read().scope, [
      {
        kind: "file",
        file: new File([new Uint8Array(8)], "poster.png", {
          type: "image/png",
        }),
      },
    ]);
    expect(controller.read().attachmentDraft).toMatchObject({
      kind: "image",
      name: "poster.png",
    });
    expect(controller.read().attachmentNotice).toContain("whole draft is kept");
    expect(controller.canSubmit).toBe(false);
  } finally {
    controller.disconnect();
  }
});

it.each(["image/jpeg", ""])(
  "sends the selected raster File itself without materializing a preview or reference (%s)",
  async (type) => {
    const { bridge, controller, sendReference, dropped } = referenceFixture();
    bridge.acceptsSelectedImage = async () => true;
    const send = vi.fn<NonNullable<DesktopNativeChat["submitSelectedImage"]>>(
      (session, input) => bridge.submit(session, input.inputId, input.text)
    );
    bridge.submitSelectedImage = send;
    const probe = vi.spyOn(image_attachment_preview, "probe");
    try {
      await controller.select("chat-a");
      const selected = dropped("photo.jpg", type, 64 * 1024);
      await controller.pickTransferredAttachment(controller.read().scope, [
        { kind: "file", file: selected.file },
      ]);
      expect(controller.read().attachmentDraft).toMatchObject({
        kind: "image",
        name: "photo.jpg",
        mimeType: "image/jpeg",
      });
      expect(controller.attachmentPreview()?.type).toBe("image/jpeg");
      await controller.submit("Describe the original.");
      expect(send).toHaveBeenCalledExactlyOnceWith("chat-a", {
        action: "submit",
        inputId: expect.any(String),
        text: "Describe the original.",
        file: expect.any(File),
        originalFile: selected.file,
        operatingRegime: "act",
      });
      expect(probe).not.toHaveBeenCalled();
      expect(selected.read).not.toHaveBeenCalled();
      expect(sendReference).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      controller.disconnect();
    }
  }
);

it("shows a dropped .mov as a video card with its poster frame and duration", async () => {
  const { bridge, controller, sendReference, dropped } = referenceFixture();
  try {
    await controller.select("chat-a");
    const scope = controller.read().scope;
    // A small clip still goes by reference: models here do not watch video.
    const clip = dropped("clip.mov", "", 180 * 1024);
    await controller.pickTransferredAttachment(scope, [
      { kind: "file", file: clip.file },
    ]);
    const preview = {
      poster: POSTER,
      durationMs: 12_500,
      width: 1920,
      height: 1080,
    };
    expect(controller.read().attachmentDraft).toEqual({
      kind: "reference",
      name: "clip.mov",
      size: 180 * 1024,
      mimeType: "video/quicktime",
      preview,
    });
    expect(controller.attachmentPreview()).toBeNull();
    await controller.submit("Cut the first two seconds.");
    expect(sendReference.mock.calls[0]?.[1]).toMatchObject({
      file: clip.file,
      mimeType: "video/quicktime",
      preview,
    });
    expect(bridge.submitFile).not.toHaveBeenCalled();
    expect(clip.read).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    controller.disconnect();
  }
});

it("keeps the video card when the chat is reopened", async () => {
  const { controller, transcripts } = referenceFixture();
  try {
    const preview = {
      poster: POSTER,
      durationMs: 12_500,
      width: 1920,
      height: 1080,
    };
    transcripts.set("chat-a", [
      {
        messageId: "cut",
        role: "user",
        text: "Cut the first two seconds.",
        attachments: [
          { name: "clip.mov", mimeType: "video/quicktime", size: 9, preview },
        ],
      },
    ]);
    await controller.select("chat-a");
    const [message] = controller.read().messages;
    expect(native_message_parts.of(message)[0]).toEqual({
      type: "data-user_file_attachments",
      data: {
        files: [
          { name: "clip.mov", poster: POSTER, caption: "0:13 · 1920×1080" },
        ],
      },
    });
  } finally {
    vi.restoreAllMocks();
    controller.disconnect();
  }
});

it("keeps legacy PNG intake while ordinary disk files use references and unsupported images stay in the draft", async () => {
  const { bridge, controller, sendReference, dropped } = referenceFixture();
  try {
    await controller.select("chat-a");
    const scope = controller.read().scope;
    const png = dropped("sketch.png", "image/png", 8);
    await controller.pickTransferredAttachment(scope, [
      { kind: "file", file: png.file },
    ]);
    expect(controller.read().attachmentDraft).toMatchObject({ kind: "png" });
    await controller.submit("Describe it.");
    expect(bridge.submitImage).toHaveBeenCalledTimes(1);
    const notes = dropped("notes.txt", "text/plain", 12);
    await controller.pickTransferredAttachment(scope, [
      { kind: "file", file: notes.file },
    ]);
    expect(controller.read().attachmentDraft).toMatchObject({
      kind: "reference",
    });
    await controller.submit("Summarize it.");
    expect(bridge.submitFile).not.toHaveBeenCalled();
    // Explicit images never fall through to reference intake on an older host.
    for (const [name, type, size] of [
      ["photo.jpg", "image/jpeg", 12],
      ["screenshot.png", "image/png", 4 * 1024 * 1024],
    ] as const) {
      const image = dropped(name, type, size);
      await controller.pickTransferredAttachment(scope, [
        { kind: "file", file: image.file },
      ]);
      expect(controller.read().attachmentDraft).toMatchObject({
        kind: "image",
        name,
      });
      expect(controller.canSubmit).toBe(false);
    }
    expect(sendReference).toHaveBeenCalledTimes(1);
  } finally {
    vi.restoreAllMocks();
    controller.disconnect();
  }
});

it.each([
  ["original.png", "image/png"],
  ["original.jpg", "image/jpeg"],
  ["original.webp", "image/webp"],
  ["original.gif", "image/gif"],
])(
  "sends an explicit %s original through selected-image intake and retries its exact File and input",
  async (name, type) => {
    const { bridge, controller, sendReference, dropped } = referenceFixture();
    bridge.acceptsSelectedImage = async () => true;
    const send = vi.fn<NonNullable<DesktopNativeChat["submitSelectedImage"]>>(
      (session, input) => bridge.submit(session, input.inputId, input.text)
    );
    send.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
    bridge.submitSelectedImage = send;
    try {
      await controller.select("chat-a");
      const selected = dropped(name, type, 5 * 1024 * 1024);
      await controller.pickTransferredAttachment(controller.read().scope, [
        { kind: "file", file: selected.file },
      ]);
      expect(controller.read().attachmentDraft).toMatchObject({
        kind: "image",
        name,
      });
      expect(controller.attachmentPreview()).toBeNull();
      await expect(controller.submit("Describe the original.")).rejects.toThrow(
        "timeout"
      );
      expect(controller.read().attachmentDraft?.name).toBe(name);
      await controller.submit("Describe the original.");
      expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
      expect(send.mock.calls[0][1].file).not.toBe(selected.file);
      expect(send.mock.calls[0][1].originalFile).toBe(selected.file);
      expect(send.mock.calls[0][1]).not.toHaveProperty("preview");
      expect(bridge.submitImage).not.toHaveBeenCalled();
      expect(sendReference).not.toHaveBeenCalled();
      expect(selected.read).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      controller.disconnect();
    }
  }
);

it("keeps an original image with its saved draft when an older host cannot submit it", async () => {
  const { bridge, controller } = fixture();
  const store = new ComposerDrafts(null, null);
  const original = new File(["original-webp"], "same.webp", {
    type: "image/webp",
  });
  await store.writeAttachment("workspace:chat-a", {
    kind: "image",
    name: original.name,
    file: original,
    mimeType: original.type,
  });
  controller.keepDrafts(store, "workspace");
  try {
    await controller.select("chat-a");
    await vi.waitFor(() =>
      expect(controller.read().attachmentDraft).toMatchObject({
        kind: "image",
        name: original.name,
      })
    );
    expect(controller.canSubmit).toBe(false);
    expect(await store.readAttachment("workspace:chat-a")).toMatchObject({
      file: original,
    });
    expect(bridge.submitSelectedImage).toBeUndefined();
  } finally {
    controller.disconnect();
  }
});

it("reads a retained original with its recorded MIME and 20 MiB bound", async () => {
  const { bridge, controller, transcripts } = fixture();
  const bytes = new Uint8Array(300 * 1024).buffer;
  bridge.readAttachmentPreview = async () => bytes;
  transcripts.set("chat-a", [
    {
      messageId: "ask",
      role: "user",
      text: "Look",
      attachments: [
        { name: "photo.jpg", mimeType: "image/jpeg", previewId: "original" },
      ],
    },
  ]);
  try {
    await controller.select("chat-a");
    const image = await controller.readAttachmentPreview("original");
    expect(image.type).toBe("image/jpeg");
    expect(await image.arrayBuffer()).toEqual(bytes);
  } finally {
    controller.disconnect();
  }
});

it("keeps today's limits for a file Desktop cannot name on disk", async () => {
  const { bridge, controller } = referenceFixture();
  try {
    bridge.canReferenceFile = () => false;
    await controller.select("chat-a");
    const scope = controller.read().scope;
    const pasted = new File([new Uint8Array(16)], "Pasted.bin");
    Object.defineProperty(pasted, "size", { value: 300 * 1024 });
    await controller.pickTransferredAttachment(scope, [
      { kind: "file", file: pasted },
    ]);
    expect(controller.read().attachmentDraft).toMatchObject({
      kind: "file",
      error: "Choose a file of at most 256 KiB.",
    });
  } finally {
    vi.restoreAllMocks();
    controller.disconnect();
  }
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

describe("Ultra harness capability", () => {
  const profile = "d".repeat(64);

  async function offered(
    bridge: DesktopNativeChat,
    controller: NativeChatController,
    connection = "Custom connection"
  ) {
    bridge.profiles = async () => ({
      active: profile,
      choices: [{ id: profile, connection, model: "Text model", ultra: true }],
      saved: [],
    });
    controller.connectForSelection();
    await vi.waitFor(() =>
      expect(controller.read().profiles?.active).toBe(profile)
    );
  }

  it.each(["ChatGPT Subscription", "Custom endpoint", "Own provider key"])(
    "submits exact Ultra effort on a negotiated %s harness without requiring model reasoning",
    async (connection) => {
      const { bridge, controller } = fixture();
      bridge.acceptsEffort = async () => true;
      const send = vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
        async (_action, attachment, input, text) =>
          bridge.submit(attachment, input, text)
      );
      bridge.submitInRegime = send;
      try {
        await offered(bridge, controller, connection);
        await controller.select("chat-a");
        expect(controller.ultraAvailability).toBe(true);
        expect(controller.read().profiles?.choices[0]).not.toHaveProperty(
          "reasoning"
        );
        controller.selectEffort("ultra");
        await controller.submit("Complete and independently review the task.");
        expect(send).toHaveBeenCalledExactlyOnceWith(
          "submit",
          "chat-a",
          expect.any(String),
          "Complete and independently review the task.",
          "act",
          "ultra"
        );
      } finally {
        controller.disconnect();
      }
    }
  );

  it("waits for the installed harness before sending a newly chosen Ultra request", async () => {
    const { bridge, controller } = fixture();
    const support = Promise.withResolvers<boolean>();
    bridge.acceptsEffort = () => support.promise;
    const create = vi.fn<DesktopNativeChat["create"]>(
      bridge.create.bind(bridge)
    );
    const send = vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
      async (_action, attachment, input, text) =>
        bridge.submit(attachment, input, text)
    );
    bridge.create = create;
    bridge.submitInRegime = send;
    try {
      await offered(bridge, controller);
      await controller.select(null);
      expect(controller.ultraAvailability).toBeUndefined();
      controller.selectEffort("ultra");
      const sending = controller.submit("Use the harness.");
      expect(create).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      controller.selectEffort("medium");
      expect(controller.read().effort).toBe("ultra");
      support.resolve(true);
      await sending;
      expect(send).toHaveBeenCalledExactlyOnceWith(
        "submit",
        "new",
        expect.any(String),
        "Use the harness.",
        "act",
        "ultra"
      );
      expect(controller.read().effort).toBe("ultra");
    } finally {
      support.resolve(false);
      controller.disconnect();
    }
  });

  it("refuses an unsupported Ultra choice before stopping paused work or sending ordinary work", async () => {
    const { bridge, controller } = fixture();
    const support = Promise.withResolvers<boolean>();
    bridge.acceptsEffort = () => support.promise;
    const observe = bridge.observe.bind(bridge);
    bridge.observe = async (id) => {
      const state = await observe(id);
      return {
        ...state,
        snapshot: {
          ...state.snapshot,
          current: {
            turnId: "paused",
            epoch: 1,
            journalPosition: 1,
            historyPosition: 1,
            controlRevision: 1,
            paused: true,
            cancelled: false,
            disposition: "suspended",
            status: null,
          },
        },
      };
    };
    const control = vi.fn<DesktopNativeChat["control"]>();
    const send = vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>();
    bridge.control = control;
    bridge.submitInRegime = send;
    bridge.enqueue = (attachment, input, text) =>
      bridge.submit(attachment, input, text);
    try {
      await offered(bridge, controller);
      await controller.select("chat-a");
      controller.selectEffort("ultra");
      const sending = controller.submit("Keep this exact Ultra draft.");
      support.resolve(false);
      await expect(sending).rejects.toThrow("Ultra effort is unavailable");
      expect(controller.read().effort).toBe("ultra");
      expect(controller.ultraAvailability).toBe(false);
      expect(controller.read().error).toContain("Ultra effort is unavailable");
      expect(control).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    } finally {
      support.resolve(false);
      controller.disconnect();
    }
  });

  it.each(["missing", "false", "failed"] as const)(
    "does not let optimistic catalogue metadata override %s native support",
    async (kind) => {
      const { bridge, controller } = fixture();
      bridge.submitInRegime =
        vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>();
      if (kind !== "missing")
        bridge.acceptsEffort = async () => {
          if (kind === "failed") throw new Error("host unavailable");
          return false;
        };
      try {
        await offered(bridge, controller);
        await controller.select("chat-a");
        expect(controller.ultraAvailability).toBe(false);
        controller.selectEffort("ultra");
        expect(controller.read().effort).toBe("medium");
        expect(bridge.submitInRegime).not.toHaveBeenCalled();
      } finally {
        controller.disconnect();
      }
    }
  );

  it("uses the separate negotiated Goal harness for a composer's Ultra goal", async () => {
    const { bridge, controller } = fixture();
    bridge.acceptsEffort = async () => true;
    bridge.acceptsGoalEffort = async () => true;
    bridge.goal = async () => ({ observationId: null, goal: null });
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
    bridge.submitInRegime =
      vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>();
    try {
      await offered(bridge, controller, "ChatGPT Subscription");
      await controller.select("chat-a");
      controller.selectGoalIntent(true);
      expect(controller.ultraAvailability).toBe(true);
      controller.selectEffort("ultra");
      await controller.submit("Finish the deliverable");
      expect(start).toHaveBeenCalledExactlyOnceWith(
        "chat-a",
        expect.any(String),
        {
          objective: "Finish the deliverable",
          criteria: ["Finish the deliverable"],
          automatic: true,
          effort: "ultra",
          operatingRegime: "act",
        }
      );
      expect(bridge.submitInRegime).not.toHaveBeenCalled();
    } finally {
      controller.disconnect();
    }
  });

  it("does not infer Goal Ultra from ordinary task support", async () => {
    const { bridge, controller } = fixture();
    bridge.acceptsEffort = async () => true;
    bridge.goal = async () => ({ observationId: null, goal: null });
    const start = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>();
    bridge.startGoal = start;
    bridge.submitInRegime =
      vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>();
    try {
      await offered(bridge, controller);
      await controller.select("chat-a");
      controller.selectEffort("ultra");
      controller.selectGoalIntent(true);
      expect(controller.ultraAvailability).toBe(false);
      await expect(controller.submit("Keep the goal draft")).rejects.toThrow(
        "Ultra is unavailable for goals"
      );
      expect(controller.read().effort).toBe("ultra");
      expect(start).not.toHaveBeenCalled();
    } finally {
      controller.disconnect();
    }
  });

  it("ignores a retired connection's late harness answer", async () => {
    const { bridge, controller } = fixture();
    const stale = Promise.withResolvers<boolean>();
    const support = vi.fn<NonNullable<DesktopNativeChat["acceptsEffort"]>>();
    support.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(false);
    bridge.acceptsEffort = support;
    bridge.submitInRegime =
      vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>();
    try {
      await offered(bridge, controller);
      await controller.select("chat-a");
      await controller.select("chat-b");
      stale.resolve(true);
      await stale.promise;
      expect(controller.ultraAvailability).toBe(false);
      expect(controller.read().effortAvailable).toBe(false);
    } finally {
      stale.resolve(false);
      controller.disconnect();
    }
  });
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
  ["native-workspace-capacity", "native-workspace-capacity"],
  ["native-future-status", "native-unavailable"],
] as const)(
  "keeps native mode when startup returns %s",
  async (result, expected) => {
    const { bridge } = fixture();
    const publish = vi.fn<(state: string | null) => void>();
    const status = vi.fn<DesktopNativeChat["status"]>();
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
    stop();
  }
);

it.each([true, false])(
  "starts a workspace with its remembered model before starting the default (still available: %s)",
  async (available) => {
    const { bridge } = fixture();
    const id = "a".repeat(64);
    const memory = {
      getItem: () =>
        JSON.stringify({ selected: null, sessions: [], profileId: id }),
    };
    const remembered = NativeChatController.rememberedProfile(
      memory,
      "project"
    );
    expect(remembered).toBe(id);
    const publish = vi.fn<(state: string | null) => void>();
    const status = vi.fn<DesktopNativeChat["status"]>();
    status
      .mockResolvedValueOnce("native-starting")
      .mockResolvedValueOnce("native-ready");
    const choose = vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
      async () => {
        if (!available) throw new Error("native_chat_profile_unavailable");
      }
    );
    const stop = NativeChatController.watchReadiness(
      { ...bridge, status, selectProfile: choose },
      publish,
      { kind: "saved", id: remembered! }
    );
    await vi.waitFor(() =>
      expect(publish.mock.calls).toEqual([
        ["native-starting"],
        ["native-ready"],
      ])
    );
    expect(choose).toHaveBeenCalledExactlyOnceWith({ kind: "saved", id });
    // The model is selected before startup, so startup opens it directly.
    expect(choose.mock.invocationCallOrder[0]).toBeLessThan(
      status.mock.invocationCallOrder[1]!
    );
    stop();
  }
);

it("drops a disposed startup reply", async () => {
  const { bridge } = fixture();
  const publish = vi.fn<(state: string | null) => void>();
  const started = Promise.withResolvers<"native-ready">();
  const status = vi.fn<DesktopNativeChat["status"]>();
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

it("retains catalog activity by chat and drops it when a later page omits the metadata", async () => {
  const { bridge, controller } = fixture();
  const atMs = 1_800_000_000_000;
  bridge.list = vi.fn<DesktopNativeChat["list"]>().mockResolvedValue({
    sessionIds: ["chat-a", "chat-b"],
    runningSessionIds: ["chat-a"],
    lastActivity: [{ sessionId: "chat-b", atMs }],
    nextCursor: "v1/chat-b",
  });
  controller.connect(null);
  await controller.listChats();
  expect(controller.chatLastActivityAtMs("chat-a")).toBeUndefined();
  expect(controller.chatLastActivityAtMs("chat-b")).toBe(atMs);
  expect(controller.read().runningSessionIds).toEqual(["chat-a"]);
  expect(controller.read().sessions).toEqual(["chat-a", "chat-b"]);
  bridge.list = async () => ({ sessionIds: ["chat-c"], nextCursor: null });
  await controller.listChats("v1/chat-b");
  expect(controller.chatLastActivityAtMs("chat-b")).toBeUndefined();
  expect(controller.chatLastActivityAtMs("chat-c")).toBeUndefined();
  expect(controller.read().runningSessionIds).toBeUndefined();
  controller.disconnect();
});

it("serializes picker refreshes with page navigation and retires observation when closed", async () => {
  const { bridge, controller } = fixture();
  const recent = {
    sessionIds: ["a"],
    runningSessionIds: ["a"],
    nextCursor: "older",
  };
  const older = {
    sessionIds: ["b"],
    runningSessionIds: ["b"],
    nextCursor: null,
  };
  const list = vi.fn<DesktopNativeChat["list"]>(async (cursor) =>
    cursor === "older" ? older : recent
  );
  bridge.list = list;
  controller.connect(null);
  await controller.listChats();
  list.mockClear();
  vi.useFakeTimers();
  let visible = false;
  const close = controller.observeChatList(() => visible);
  try {
    await vi.advanceTimersByTimeAsync(10_000);
    expect(list).not.toHaveBeenCalled();
    visible = true;
    const pending = Promise.withResolvers<NativeChatPage>();
    list.mockReturnValueOnce(pending.promise);
    await vi.advanceTimersToNextTimerAsync();
    const navigate = controller.listChats("older");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(list).toHaveBeenCalledExactlyOnceWith(null);
    pending.resolve(recent);
    await navigate;
    expect(controller.read().runningSessionIds).toEqual(["b"]);

    list.mockRejectedValueOnce(new Error("disconnected"));
    await vi.advanceTimersToNextTimerAsync();
    expect(list).toHaveBeenLastCalledWith("older");
    expect(controller.read().runningSessionIds).toBeUndefined();
    list.mockRejectedValueOnce(new Error("invalid_session_cursor"));
    await vi.advanceTimersToNextTimerAsync();
    expect(controller.read().catalogError).toContain("Newest chats");
    list.mockClear();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(list).not.toHaveBeenCalled();
    list.mockResolvedValueOnce({ ...recent, runningSessionIds: [] });
    await controller.listChats();
    const late = Promise.withResolvers<NativeChatPage>();
    list.mockReturnValueOnce(late.promise);
    await vi.advanceTimersToNextTimerAsync();
    close();
    list.mockClear();
    late.resolve(recent);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(list).not.toHaveBeenCalled();
    expect(controller.read().runningSessionIds).toEqual([]);
  } finally {
    close();
    controller.disconnect();
    vi.useRealTimers();
  }
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
  await expect(controller.setChatArchived(true)).resolves.toBe(true);
  stalePage.resolve({ sessionIds: ["chat-a"], nextCursor: null });
  await refresh;
  expect(controller.read().sessions).not.toContain("chat-a");
  expect(controller.read().selected).toBeNull();
  expect(controller.read().observation).toBeNull();
  expect(controller.read().messages).toEqual([]);
  expect(running.has("chat-a")).toBe(true);
  await controller.listChats(null, true);
  expect(controller.read().sessions).toContain("chat-a");
  await controller.select("chat-a");

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
  const read = vi.fn<NonNullable<DesktopNativeChat["catalogEntry"]>>(
    async () => entry
  );
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
    // Until the host titles it, the chat is a new chat.
    expect(controller.chatTitle("chat-a")).toBe(NEW_CHAT_TITLE);
    expect(controller.read().titleArrived).toBeNull();
    // Renaming starts from the shown label; leaving it unchanged keeps the
    // chat untitled for its generated title.
    controller.beginRename();
    expect(controller.read().catalogDraft?.text).toBe(NEW_CHAT_TITLE);
    await controller.saveTitle();
    expect(controller.read().catalogDraft).toBeNull();
    expect(controller.read().catalogEntry?.title).toBeNull();
    entry = { ...entry, revision: 1, title: "Spring launch kit" };
    running.delete("chat-a");
    await vi.waitFor(
      () => expect(controller.chatTitle("chat-a")).toBe("Spring launch kit"),
      { timeout: 3_000 }
    );
    // The arrival is marked so the header can reveal it once.
    expect(controller.read().titleArrived).toBe("chat-a");
    controller.acknowledgeTitle();
    expect(controller.read().titleArrived).toBeNull();
    // A rename in progress is never replaced by the background title.
    controller.beginRename();
    controller.changeTitle("Mine");
    entry = { ...entry, revision: 2, title: "Other" };
    expect(controller.read().catalogDraft?.text).toBe("Mine");
  });
});

function titleCatalog(bridge: DesktopNativeChat, title: string | null) {
  let entry: NativeChatCatalogEntry = {
    sessionId: "new",
    revision: title ? 1 : 0,
    title,
    archived: false,
    ...(title && { titleGenerationPending: true as const }),
  };
  const read = vi.fn<NonNullable<DesktopNativeChat["catalogEntry"]>>(
    async () => entry
  );
  bridge.catalogEntry = read;
  bridge.list = async () => ({
    sessionIds: ["new"],
    titles:
      entry.title === null ? [] : [{ sessionId: "new", title: entry.title }],
    nextCursor: null,
  });
  bridge.listArchived = async () => ({ sessionIds: [], nextCursor: null });
  const organize = vi.fn<NonNullable<DesktopNativeChat["organize"]>>(
    async (sessionId, change) => {
      entry = { ...change, sessionId, revision: entry.revision + 1 };
      return entry;
    }
  );
  bridge.organize = organize;
  return {
    read,
    organize,
    update(change: Partial<NativeChatCatalogEntry>) {
      entry = { ...entry, ...change };
    },
  };
}

it("shows the catalog title on first acceptance, keeps a rejected draft untitled, and reopens it from the picker", async () => {
  const { bridge, controller } = fixture();
  const catalog = titleCatalog(bridge, null);
  const send = vi
    .spyOn(bridge, "submit")
    .mockRejectedValueOnce(new Error("session_admission_paused"));
  const accepted = Promise.withResolvers<void>();
  send.mockImplementationOnce(async (sessionId, inputId) => {
    await accepted.promise;
    catalog.update({
      revision: 1,
      title: "Accepted excerpt",
      titleGenerationPending: true,
    });
    return {
      sessionId,
      inputId,
      disposition: "claimed",
      inputPosition: 0,
      turnId: "turn-new",
    };
  });
  controller.connect(null);
  try {
    expect(controller.read().selected).toBeNull();
    await expect(controller.submit("A longer first request")).rejects.toThrow(
      "session_admission_paused"
    );
    expect(controller.chatTitle("new")).toBe(NEW_CHAT_TITLE);
    const retry = controller.submit("A longer first request");
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(controller.chatTitle("new")).toBe(NEW_CHAT_TITLE);
    const stalledHistory =
      Promise.withResolvers<readonly NativeChatMessage[]>();
    vi.spyOn(bridge, "transcript").mockReturnValueOnce(stalledHistory.promise);
    const olderPage = Promise.withResolvers<NativeChatPage>();
    vi.spyOn(bridge, "list").mockReturnValueOnce(olderPage.promise);
    const navigation = controller.listChats("older");
    accepted.resolve();
    try {
      await vi.waitFor(() =>
        expect(controller.chatTitle("new")).toBe("Accepted excerpt")
      );
    } finally {
      stalledHistory.resolve([]);
      olderPage.resolve({ sessionIds: ["old"], nextCursor: null });
      await navigation;
      await retry;
    }
    expect(controller.read().catalogCursor).toBe("older");
    expect(controller.read().sessions).toEqual(["old"]);
    await controller.listChats();
    await controller.select(null);
    expect(controller.read().selected).toBeNull();
    expect(controller.chatTitle("new")).toBe("Accepted excerpt");
    await controller.select("new");
    expect(controller.chatTitle("new")).toBe("Accepted excerpt");
  } finally {
    accepted.resolve();
    controller.disconnect();
  }
});

it.each(["Generated title", null])(
  "follows a reopened chat's pending title without reading history and stops after the titler returns %s",
  async (generated) => {
    const { bridge } = fixture();
    const catalog = titleCatalog(bridge, "First message excerpt");
    const transcript = vi.spyOn(bridge, "transcript");
    vi.useFakeTimers();
    try {
      await controller_select(bridge, "new", async (controller) => {
        expect(controller.chatTitle("new")).toBe("First message excerpt");
        transcript.mockClear();
        await vi.advanceTimersByTimeAsync(6_000);
        expect(controller.read().catalogEntry?.titleGenerationPending).toBe(
          true
        );
        catalog.update({
          titleGenerationPending: undefined,
          ...(generated && { title: generated, revision: 2 }),
        });
        await vi.advanceTimersByTimeAsync(6_000);
        expect(
          controller.read().catalogEntry?.titleGenerationPending
        ).toBeUndefined();
        expect(controller.chatTitle("new")).toBe(
          generated ?? "First message excerpt"
        );
        catalog.read.mockClear();
        await vi.advanceTimersByTimeAsync(18_000);
        expect(catalog.read).not.toHaveBeenCalled();
        expect(transcript).not.toHaveBeenCalled();
      });
    } finally {
      vi.useRealTimers();
    }
  }
);

it("confirms a provisional label as a manual rename while a generated title read is in flight", async () => {
  const { bridge } = fixture();
  const title = "First message excerpt";
  const catalog = titleCatalog(bridge, title);
  vi.useFakeTimers();
  try {
    await controller_select(bridge, "new", async (controller) => {
      controller.beginRename();
      const generated = {
        sessionId: "new",
        revision: 2,
        title: "Generated title",
        archived: false,
      };
      catalog.update(generated);
      const earlier = Promise.withResolvers<NativeChatCatalogEntry>();
      catalog.read.mockReturnValueOnce(earlier.promise);
      await vi.advanceTimersByTimeAsync(6_000);
      await controller.saveTitle();
      expect(catalog.organize).toHaveBeenCalledExactlyOnceWith("new", {
        revision: 1,
        title,
        archived: false,
      });
      earlier.resolve(generated);
      await vi.advanceTimersByTimeAsync(12_000);
      expect(controller.chatTitle("new")).toBe(title);
      expect(controller.read().catalogDraft).toBeNull();
      expect(controller.read().catalogEntry?.revision).toBe(3);
    });
  } finally {
    vi.useRealTimers();
  }
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
): Extract<NativeChatUpdate, { kind: "text" }> {
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
  it.each([
    ["session_active_route_changed", /unfinished turn/],
    ["session_queued_route_changed", /Queued messages/],
    ["session_goal_route_changed", /active goal/],
    ["session_delegated_route_changed", /Delegated work/],
    ["session_execution_configuration_changed", /Update Desktop/],
    ["retained_authority_changed", /unfinished work/],
  ] as const)(
    "describes saved-work refusal %s without inferring an account change",
    async (reason, label) => {
      const { bridge, controller } = fixture();
      vi.spyOn(bridge, "submit").mockRejectedValue(new Error(reason));
      try {
        await controller.select("chat-a");
        await expect(controller.submit("Continue the work.")).rejects.toThrow(
          reason
        );
        expect(controller.read().error).toMatch(label);
        expect(controller.read().error).not.toMatch(/account that started/);
      } finally {
        controller.disconnect();
      }
    }
  );
  it.each([
    ["pending_work", /pending workspace chat work/],
    ["active_turn", /running chat turns in this workspace/],
    ["retained_turn", /paused or interrupted turns/],
    ["queued_input", /queued messages in this workspace/],
    ["unresolved_goal", /active goals in this workspace/],
    ["delegated_session", /temporary side chats/],
    ["background_process", /background commands/],
    ["unsupported", /Update Desktop/],
    ["busy", /Another model change/],
    ["unverified", /Couldn't verify/],
  ] as const)(
    "keeps the current chat and selection when model change is blocked by %s",
    async (reason, label) => {
      const { bridge, controller, transcripts } = fixture();
      const id = "b".repeat(64);
      bridge.profiles = async () => ({
        active: null,
        modelChanges: true,
        choices: [{ id, connection: "Another provider", model: "Other model" }],
        saved: [],
      });
      const choose = vi
        .fn<NonNullable<DesktopNativeChat["selectProfile"]>>()
        .mockRejectedValue(new Error(`native_chat_model_change_${reason}`));
      bridge.selectProfile = choose;
      transcripts.set("chat-a", [
        { messageId: "kept", role: "assistant", text: "Kept history" },
      ]);
      const load = vi.spyOn(bridge, "load");
      const drafts = new ComposerDrafts(null, null);
      const document = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Unsent draft" }],
          },
        ],
      };
      controller.keepDrafts(drafts, "workspace");
      drafts.write("workspace:chat-a", document);
      try {
        controller.connect("chat-a");
        await vi.waitFor(() =>
          expect(controller.read().messages[0]?.text).toBe("Kept history")
        );
        const scope = controller.read().scope;
        const before = load.mock.calls.length;
        await controller.selectProfile({ kind: "new", id });
        expect(choose).toHaveBeenCalledExactlyOnceWith({ kind: "new", id });
        expect(controller.read()).toMatchObject({
          selected: "chat-a",
          scope,
          profileBusy: false,
          profileError: expect.stringMatching(label),
          profiles: { active: null },
          messages: [{ messageId: "kept", text: "Kept history" }],
        });
        expect(load).toHaveBeenCalledTimes(before);
        expect(drafts.read("workspace:chat-a")).toEqual(document);
        expect(controller.read().profileError).not.toMatch(
          /account that started/
        );
      } finally {
        controller.disconnect();
      }
    }
  );

  it("requires guarded model changes before switching an existing chat on an older Desktop", async () => {
    const { bridge, controller } = fixture();
    bridge.profiles = async () => ({ active: null, choices: [], saved: [] });
    const choose = vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
      async () => {}
    );
    bridge.selectProfile = choose;
    try {
      controller.connect("chat-a");
      await vi.waitFor(() => expect(controller.read().loading).toBe(false));
      await controller.selectProfile({ kind: "new", id: "b".repeat(64) });
      expect(choose).not.toHaveBeenCalled();
      expect(controller.read().profileError).toMatch(/Update Desktop/);
    } finally {
      controller.disconnect();
    }
  });

  it("reattaches the previous chat only after a failed launch explicitly restores its worker", async () => {
    const { bridge, controller, transcripts } = fixture();
    const id = "b".repeat(64);
    bridge.selectProfile = vi
      .fn<NonNullable<DesktopNativeChat["selectProfile"]>>()
      .mockRejectedValue(new Error("native_chat_model_change_failed_restored"));
    const load = vi.spyOn(bridge, "load");
    const drafts = new ComposerDrafts(null, null);
    const document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Unsent draft" }],
        },
      ],
    };
    controller.keepDrafts(drafts, "workspace");
    drafts.write("workspace:chat-a", document);
    transcripts.set("chat-a", [
      { messageId: "kept", role: "assistant", text: "Original history" },
    ]);
    try {
      controller.connect("chat-a");
      await vi.waitFor(() =>
        expect(controller.read().messages[0]?.text).toBe("Original history")
      );
      const scope = controller.read().scope;
      await controller.selectProfile({ kind: "new", id });
      expect(load.mock.calls.map(([session]) => session)).toEqual([
        "chat-a",
        "chat-a",
      ]);
      expect(controller.read()).toMatchObject({
        selected: "chat-a",
        profileBusy: false,
        profileError: expect.stringMatching(
          /previous connection has been restored/
        ),
        messages: [{ messageId: "kept", text: "Original history" }],
      });
      expect(controller.read().scope).toBeGreaterThan(scope);
      expect(drafts.read("workspace:chat-a")).toEqual(document);
    } finally {
      controller.disconnect();
    }
  });

  it.each(["restore_failed", "recovery_pending"] as const)(
    "refreshes a retired attachment after model-change %s without discarding the draft",
    async (reason) => {
      const { bridge, controller } = fixture();
      bridge.selectProfile = vi
        .fn<NonNullable<DesktopNativeChat["selectProfile"]>>()
        .mockRejectedValue(new Error(`native_chat_model_change_${reason}`));
      const load = vi.spyOn(bridge, "load");
      const drafts = new ComposerDrafts(null, null);
      const document = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Unsent draft" }],
          },
        ],
      };
      controller.keepDrafts(drafts, "workspace");
      drafts.write("workspace:chat-a", document);
      try {
        controller.connect("chat-a");
        await vi.waitFor(() => expect(controller.read().loading).toBe(false));
        await controller.selectProfile({ kind: "new", id: "b".repeat(64) });
        expect(controller.read().error).toBeTruthy();
        expect(controller.read().profileError).toBeNull();
        expect(load).toHaveBeenCalledTimes(1);
        await controller.repair();
        expect(load).toHaveBeenCalledTimes(2);
        expect(controller.read()).toMatchObject({
          selected: "chat-a",
          error: null,
          profileError: null,
          profileBusy: false,
        });
        expect(drafts.read("workspace:chat-a")).toEqual(document);
      } finally {
        controller.disconnect();
      }
    }
  );

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
      modelChanges: true,
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
      expect(controller.read().profileError).toMatch(/running chat turns/);
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

  it("renews lost live observation on the same host without starting work", async () => {
    const { controller, bridge, running, updates, transcripts } = fixture();
    const subscribe = vi.spyOn(bridge, "subscribe");
    const status = vi.spyOn(bridge, "status");
    const submit = vi.spyOn(bridge, "submit");
    try {
      running.add("a");
      await controller.select("a");
      const retired = updates.get("a")!;
      retired(text("a", "Provisional", 0));
      transcripts.set("a", [message("a", "Committed text")]);
      subscribe.mockRejectedValueOnce(
        new Error("native_chat_subscription_unavailable")
      );
      retired({ kind: "closed", reason: "delivery_limit" });
      await vi.waitFor(() =>
        expect(controller.read().connectionRecovery).toBe("disconnected")
      );
      expect(subscribe).toHaveBeenCalledTimes(2);
      expect(controller.read().messages).toEqual([
        message("a", "Committed text"),
      ]);
      await controller.repair();
      expect(controller.read().connectionRecovery).toBeNull();
      expect(subscribe).toHaveBeenCalledTimes(3);
      expect(status).not.toHaveBeenCalled();
      expect(submit).not.toHaveBeenCalled();
      const next = { ...text("a", "After reconnect", 0), messageId: "next" };
      retired(next);
      expect(controller.read().messages).toHaveLength(1);
      updates.get("a")!(next);
      expect(controller.read().messages.at(-1)?.text).toBe("After reconnect");
    } finally {
      controller.disconnect();
    }
  });

  it("replays a turn committed before the replacement subscription registers", async () => {
    const { controller, bridge, updates, transcripts } = fixture();
    const subscribeOnHost = bridge.subscribe.bind(bridge);
    const subscribe = vi.spyOn(bridge, "subscribe");
    const submit = vi.spyOn(bridge, "submit");
    const registration = Promise.withResolvers<void>();
    const committed = message("a", "A turn finished in another pane");
    try {
      // The idle snapshot does not schedule a follow-up poll.
      await controller.select("a");
      const retired = updates.get("a")!;
      subscribe.mockImplementationOnce(async (id, listener) => {
        await registration.promise;
        return subscribeOnHost(id, listener);
      });
      retired({ kind: "closed", reason: "delivery_limit" });
      await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));
      // Main subscribes to future updates. A turn committed in this window
      // cannot send an update to either the retired or the pending listener.
      transcripts.set("a", [committed]);
      registration.resolve();

      await vi.waitFor(() =>
        expect(controller.read().connectionRecovery).toBeNull()
      );
      expect(controller.read().messages).toEqual([committed]);
      expect(submit).not.toHaveBeenCalled();
    } finally {
      registration.resolve();
      controller.disconnect();
    }
  });

  it("removes a delayed renewal after switching chats and ignores its callbacks", async () => {
    const { controller, bridge, updates, transcripts } = fixture();
    const subscribe = vi.spyOn(bridge, "subscribe");
    const unsubscribe = vi.spyOn(bridge, "unsubscribe");
    const registration = Promise.withResolvers<string>();
    const committed = message("b", "Current chat history");
    transcripts.set("b", [committed]);
    try {
      await controller.select("a");
      subscribe.mockReturnValueOnce(registration.promise);
      updates.get("a")!({ kind: "closed", reason: "delivery_limit" });
      await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));
      const late = subscribe.mock.calls[1]![1];

      await controller.select("b");
      registration.resolve("renewed-a");
      late(text("a", "Late output from the retired chat", 0));
      late({ kind: "closed", reason: "session_deleted" });

      await vi.waitFor(() =>
        expect(unsubscribe).toHaveBeenCalledWith("renewed-a")
      );
      expect(controller.read().connectionRecovery).toBeNull();
      expect(controller.read().selected).toBe("b");
      expect(controller.read().messages).toEqual([committed]);
    } finally {
      registration.resolve("renewed-a");
      controller.disconnect();
    }
  });

  it("restores a saved retry and attachment before replacing a failed startup attachment", async () => {
    const { controller, bridge } = fixture();
    const drafts = durableDrafts();
    const draftReady = Promise.withResolvers<void>();
    const readPending = drafts.readPending.bind(drafts);
    const status = vi.spyOn(bridge, "status");
    const send = vi.spyOn(bridge, "submit");
    const prompt = "Inspect this attachment.";
    await drafts.writePending("workspace:a", {
      inputId: "retained-input",
      text: prompt,
      mode: "submit",
      allowLibrarySelection: false,
      attachment: {
        kind: "file",
        name: "draft.txt",
        bytes: new Uint8Array([1, 2, 3]).buffer,
      },
    });
    const restore = vi
      .spyOn(drafts, "readPending")
      .mockImplementationOnce(async (key) => {
        await draftReady.promise;
        return readPending(key);
      });
    vi.spyOn(bridge, "observe").mockRejectedValueOnce(
      new Error("native_chat_attachment_unavailable")
    );
    const receipt = vi.spyOn(bridge, "inputReceipt").mockResolvedValueOnce({
      sessionId: "a",
      inputId: "retained-input",
      disposition: "claimed",
      inputPosition: 1,
      turnId: "turn-a",
    });
    controller.keepDrafts(drafts, "workspace");

    try {
      const opening = controller.select("a");
      await vi.waitFor(() =>
        expect(restore).toHaveBeenCalledWith("workspace:a")
      );
      expect(controller.read().connectionRecovery).toBe("reconnecting");
      expect(status).not.toHaveBeenCalled();
      expect(controller.canSubmit).toBe(false);

      draftReady.resolve();
      await opening;
      await vi.waitFor(() =>
        expect(controller.read().connectionRecovery).toBeNull()
      );
      expect(status).toHaveBeenCalledExactlyOnceWith(true);
      expect(controller.read().attachmentDraft).toMatchObject({
        kind: "file",
        name: "draft.txt",
      });
      await controller.submit(prompt);
      expect(receipt).toHaveBeenCalledExactlyOnceWith("a", "retained-input");
      expect(send).not.toHaveBeenCalled();
    } finally {
      draftReady.resolve();
      controller.disconnect();
    }
  });

  it("reattaches the same chat after host loss and resolves a pending send by its original receipt", async () => {
    const { controller, bridge, updates, transcripts } = fixture();
    const observe = bridge.observe;
    let hostExited = false;
    vi.spyOn(bridge, "observe").mockImplementation(async (id) => {
      if (hostExited && id === "a")
        throw new Error("native_chat_scope_changed");
      return observe.call(bridge, "a");
    });
    vi.spyOn(bridge, "transcript").mockImplementation(async () => {
      return transcripts.get("a") ?? [];
    });
    const load = vi.spyOn(bridge, "load");
    const create = vi.spyOn(bridge, "create");
    const control = vi.spyOn(bridge, "control");
    const status = vi
      .spyOn(bridge, "status")
      .mockResolvedValueOnce("native-unavailable")
      .mockResolvedValueOnce("native-ready");
    const submit = vi
      .spyOn(bridge, "submit")
      .mockRejectedValueOnce(new Error("lost_reply"));
    try {
      await controller.select("a");
      const retired = updates.get("a")!;
      await expect(controller.submit("One accepted prompt")).rejects.toThrow(
        "lost_reply"
      );
      const inputId = submit.mock.calls[0]![1];
      hostExited = true;
      controller.checkObservation();
      await vi.waitFor(() =>
        expect(controller.read().connectionRecovery).toBe("disconnected")
      );
      controller.checkObservation();
      expect(status).toHaveBeenCalledExactlyOnceWith(true);
      expect(controller.canSubmit).toBe(false);

      load.mockResolvedValueOnce({ attachmentId: "a-renewed", sessionId: "a" });
      transcripts.set("a", [message("a", "Saved answer")]);
      const receipt = vi.spyOn(bridge, "inputReceipt").mockResolvedValueOnce({
        sessionId: "a",
        inputId,
        disposition: "claimed",
        inputPosition: 1,
        turnId: "turn-a",
      });
      await controller.repair();
      expect(controller.read().connectionRecovery).toBeNull();
      expect(load.mock.calls).toEqual([["a"], ["a"]]);
      expect(controller.read().selected).toBe("a");
      expect(controller.read().messages).toEqual([
        message("a", "Saved answer"),
      ]);
      retired({ ...text("a", "Old host output", 0), messageId: "old" });
      expect(controller.read().messages).toHaveLength(1);
      expect(receipt).not.toHaveBeenCalled();
      expect(submit).toHaveBeenCalledTimes(1);
      expect(control).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();

      await controller.submit("One accepted prompt");
      expect(receipt).toHaveBeenCalledExactlyOnceWith("a-renewed", inputId);
      expect(submit).toHaveBeenCalledTimes(1);
      await controller.submit("A separate follow-up");
      expect(submit).toHaveBeenCalledTimes(2);
      expect(submit.mock.calls[1]![0]).toBe("a-renewed");
      expect(submit.mock.calls[1]![1]).not.toBe(inputId);
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

  it("reattaches an idle chat when retrying an unconfirmed send finds its attachment retired", async () => {
    const { controller, bridge } = fixture();
    const submit = vi
      .spyOn(bridge, "submit")
      .mockRejectedValueOnce(new Error("lost_reply"));
    const receipt = vi.spyOn(bridge, "inputReceipt");
    const status = vi.spyOn(bridge, "status");
    const load = vi.spyOn(bridge, "load");
    const prompt = "Keep this draft until its send is confirmed.";
    try {
      await controller.select("a");
      await expect(controller.submit(prompt)).rejects.toThrow("lost_reply");
      const inputId = submit.mock.calls[0]![1];
      expect(receipt).toHaveBeenCalledExactlyOnceWith("a", inputId);

      // The idle pane stays focused as its host exits. The person's retry
      // is the first operation that can detect the retired attachment.
      load.mockResolvedValueOnce({
        attachmentId: "a-reconnected",
        sessionId: "a",
      });
      receipt.mockRejectedValueOnce(new Error("native_chat_scope_changed"));
      await expect(controller.submit(prompt)).rejects.toThrow(
        "native_chat_scope_changed"
      );
      await vi.waitFor(() => {
        expect(status).toHaveBeenCalledExactlyOnceWith(true);
        expect(load.mock.calls).toEqual([["a"], ["a"]]);
        expect(controller.read().connectionRecovery).toBeNull();
      });
      expect(receipt.mock.calls).toEqual([
        ["a", inputId],
        ["a", inputId],
      ]);
      expect(submit).toHaveBeenCalledTimes(1);

      receipt.mockResolvedValueOnce({
        sessionId: "a",
        inputId,
        disposition: "claimed",
        inputPosition: 1,
        turnId: "turn-a",
      });
      await controller.submit(prompt);
      expect(controller.read().selected).toBe("a");
      expect(receipt).toHaveBeenLastCalledWith("a-reconnected", inputId);
      expect(submit).toHaveBeenCalledTimes(1);
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
    throw new Error("native_chat_goal_start_unverified");
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
  // The renderer names no allowance; the host applies the product default.
  expect(start).toHaveBeenLastCalledWith("new", expect.any(String), {
    objective: "Prepare an SVG that opens correctly",
    criteria: ["Prepare an SVG that opens correctly"],
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
    "Goals are unavailable in this chat."
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

it.each([
  ["session_goal_queued", "A goal is already waiting to start in this chat."],
  [
    "session_goal_exists",
    "This chat already has a goal. Clear it before starting another.",
  ],
  ["side_chat_goals_unavailable", "Goals are unavailable in this chat."],
  ["native_chat_goal_spending_unavailable", "Couldn't start the goal."],
])(
  "frees the composer after the host refuses a goal start with %s",
  async (code, shown) => {
    const { bridge, controller } = fixture();
    bridge.goal = async () => ({ observationId: null, goal: null });
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
      automatic: true,
    };
    start.mockRejectedValueOnce(
      new Error(`Error invoking remote method: Error: ${code}`)
    );
    expect(await controller.startGoal(request)).toBe(false);
    expect(controller.read().error).toBe(shown);
    // Goal entry can be turned off, and a different goal can start.
    controller.selectGoalIntent(true);
    controller.selectGoalIntent(false);
    expect(controller.read().goalIntent).toBe(false);
    expect(
      await controller.startGoal({ ...request, objective: "Another goal" })
    ).toBe(true);
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[1][1]).not.toBe(start.mock.calls[0][1]);
    controller.disconnect();
  }
);

it("keeps an unverified goal start for a retry of the same draft", async () => {
  const { bridge, controller } = fixture();
  bridge.goal = async () => ({ observationId: null, goal: null });
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
    automatic: true,
  };
  start.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
  expect(await controller.startGoal(request)).toBe(false);
  expect(controller.read().error).toBe(
    "Couldn't confirm the goal start. Your draft is still here."
  );
  expect(
    await controller.startGoal({ ...request, objective: "Another goal" })
  ).toBe(false);
  expect(await controller.startGoal(request)).toBe(true);
  expect(start).toHaveBeenCalledTimes(2);
  expect(start.mock.calls[1]).toEqual(start.mock.calls[0]);
  controller.disconnect();
});

describe("a first message chosen before the chat opened", () => {
  const PROFILE = "9".repeat(64);

  function firstMessage(text = "Make a launch poster") {
    let waiting: { text: string } | null = { text };
    const take = vi.fn<() => { text: string } | null>(() => {
      const taken = waiting;
      waiting = null;
      return taken;
    });
    return { take };
  }

  function sending() {
    const f = fixture();
    const create = vi.fn<DesktopNativeChat["create"]>(async () => ({
      attachmentId: "first",
      sessionId: "first",
    }));
    const submit = vi.fn<DesktopNativeChat["submit"]>(
      f.bridge.submit.bind(f.bridge)
    );
    const choose = vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
      async () => {}
    );
    f.bridge.create = create;
    f.bridge.submit = submit;
    f.bridge.selectProfile = choose;
    return { ...f, create, submit, choose };
  }

  const messageContext = {
    modelText: "<desktop-context>Use the selected example.</desktop-context>",
    displayParts: [
      { kind: "test.references", version: 1, data: { title: "Sample" } },
    ],
  };

  it("sends a context-only first message through the ordinary chat", async () => {
    const { controller, bridge, submit } = sending();
    const submitMessage = vi.fn<
      NonNullable<DesktopNativeChat["submitMessage"]>
    >((attachment, request) =>
      submit(attachment, request.inputId, request.text)
    );
    bridge.submitMessage = submitMessage;
    try {
      expect(
        await controller.startChat(null, () => ({ text: "", messageContext }))
      ).toBeNull();
      expect(submitMessage).toHaveBeenCalledExactlyOnceWith(
        "first",
        expect.objectContaining({
          action: "submit",
          text: "",
          messageContext,
        })
      );
      expect(controller.read().draftMessageContext).toBeNull();
    } finally {
      controller.disconnect();
    }
  });

  it("keeps the authored text and context together when the host refuses it", async () => {
    const { controller, bridge, submit } = sending();
    const drafts = durableDrafts();
    controller.keepDrafts(drafts, "workspace");
    const text = "Literal <reference> text";
    try {
      expect(
        await controller.startChat(null, () => ({ text, messageContext }))
      ).toBe(text);
      expect(submit).not.toHaveBeenCalled();
      expect(controller.read().error).toContain("Update Grida Desktop");
      expect(controller.read().draftMessageContext).toEqual(messageContext);
      expect(drafts.readMessageContext(controller.draftKey()!)).toEqual(
        messageContext
      );
      const submitMessage = vi.fn<
        NonNullable<DesktopNativeChat["submitMessage"]>
      >((attachment, request) =>
        submit(attachment, request.inputId, request.text)
      );
      bridge.submitMessage = submitMessage;
      await controller.submit(text);
      expect(submitMessage).toHaveBeenCalledExactlyOnceWith(
        "first",
        expect.objectContaining({ text, messageContext })
      );
      expect(drafts.readMessageContext(controller.draftKey()!)).toBeNull();
    } finally {
      controller.disconnect();
    }
  });

  it("sends an edited contextual draft with its literal slash prefix", async () => {
    const { controller, bridge, submit } = sending();
    const submitMessage = vi
      .fn<NonNullable<DesktopNativeChat["submitMessage"]>>(
        (attachment, request) =>
          submit(attachment, request.inputId, request.text)
      )
      .mockRejectedValueOnce(new Error("fixture lost reply"));
    bridge.submitMessage = submitMessage;
    const receipt = vi.spyOn(bridge, "inputReceipt");
    const text = "Check the layout";
    try {
      expect(
        await controller.startChat(null, () => ({ text, messageContext }))
      ).toBe(text);
      const [first] = submitMessage.mock.calls;
      receipt.mockResolvedValue({
        sessionId: "first",
        inputId: first[1].inputId,
        disposition: "claimed",
        inputPosition: 1,
        turnId: "turn-first",
      });
      await controller.submit(`/plan ${text}`);
      expect(receipt).toHaveBeenCalledOnce();
      expect(submitMessage).toHaveBeenCalledTimes(2);
      expect(submitMessage.mock.calls[1][1]).toMatchObject({
        text: `/plan ${text}`,
        operatingRegime: "act",
        messageContext,
      });
      expect(submitMessage.mock.calls[1][1].inputId).not.toBe(first[1].inputId);
    } finally {
      controller.disconnect();
    }
  });

  it("keeps the context of an unconfirmed goal available for retry", async () => {
    const { controller, bridge } = sending();
    bridge.submitMessage =
      vi.fn<NonNullable<DesktopNativeChat["submitMessage"]>>();
    bridge.goal = async () => ({ observationId: null, goal: null });
    const start = vi
      .fn<NonNullable<DesktopNativeChat["startGoal"]>>(
        async (sessionId, inputId) => ({
          sessionId,
          inputId,
          disposition: "queued",
          inputPosition: 1,
          turnId: null,
        })
      )
      .mockRejectedValueOnce(new Error("native_chat_goal_start_unverified"));
    bridge.startGoal = start;
    const text = "Check the layout";
    try {
      expect(
        await controller.startChat(null, () => ({ text, messageContext }), {
          goal: true,
        })
      ).toBe(text);
      expect(controller.canRemoveMessageContext).toBe(false);
      controller.removeMessageContext(controller.read().scope);
      expect(controller.read().draftMessageContext).toEqual(messageContext);
      await controller.submit(text);
      expect(start).toHaveBeenCalledTimes(2);
      expect(start.mock.calls[1]).toEqual(start.mock.calls[0]);
      expect(controller.read().draftMessageContext).toBeNull();
    } finally {
      controller.disconnect();
    }
  });

  it("opens a new chat on the chosen connection and sends the message once", async () => {
    const { bridge, create, submit, choose } = sending();
    const stored = new Map([
      [
        "project",
        JSON.stringify({
          selected: "earlier",
          sessions: ["earlier"],
          profileId: "e".repeat(64),
        }),
      ],
    ]);
    const memory = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    };
    const load = vi.fn<DesktopNativeChat["load"]>(bridge.load.bind(bridge));
    bridge.load = load;
    const controller = new NativeChatController(bridge, memory, "project");
    const message = firstMessage();
    try {
      expect(await controller.startChat(PROFILE, message.take)).toBeNull();
      expect(choose).toHaveBeenCalledExactlyOnceWith({
        kind: "new",
        id: PROFILE,
      });
      // The remembered chat and model are not reopened first.
      expect(load).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledOnce();
      expect(submit).toHaveBeenCalledExactlyOnceWith(
        "first",
        expect.any(String),
        "Make a launch poster"
      );
      expect(choose.mock.invocationCallOrder[0]).toBeLessThan(
        message.take.mock.invocationCallOrder[0]!
      );
      expect(message.take).toHaveBeenCalledOnce();
      expect(controller.read().selected).toBe("first");
      expect(controller.read().error).toBeNull();
      // The workspace remembers the connection the message was sent with.
      expect(JSON.parse(stored.get("project")!).profileId).toBe(PROFILE);
    } finally {
      controller.disconnect();
    }
  });

  it("applies Home effort and Plan before sending the first input", async () => {
    const { bridge, controller } = sending();
    const inRegime = vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
      async (_action, id, inputId) => ({
        sessionId: id,
        inputId,
        disposition: "claimed",
        inputPosition: 1,
        turnId: `turn-${id}`,
      })
    );
    bridge.submitInRegime = inRegime;
    const message = firstMessage("Plan a poster");
    try {
      expect(
        await controller.startChat(null, message.take, {
          effort: "high",
          operatingRegime: "plan",
        })
      ).toBeNull();
      expect(inRegime).toHaveBeenCalledExactlyOnceWith(
        "submit",
        "first",
        expect.any(String),
        "Plan a poster",
        "plan",
        "high"
      );
    } finally {
      controller.disconnect();
    }
  });

  it("waits for a Home file before submitting it through the ordinary attachment route", async () => {
    const { bridge, controller, submit } = sending();
    bridge.acceptsFile = async () => true;
    const sendFile = vi.fn<NonNullable<DesktopNativeChat["submitFile"]>>(
      (id, input) => bridge.submit(id, input.inputId, input.text)
    );
    bridge.submitFile = sendFile;
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });
    const message = firstMessage("Read these notes");
    try {
      expect(
        await controller.startChat(null, message.take, {
          attachment: { kind: "file", file },
        })
      ).toBeNull();
      expect(sendFile).toHaveBeenCalledExactlyOnceWith(
        "first",
        expect.objectContaining({
          action: "submit",
          text: "Read these notes",
          name: "notes.txt",
          operatingRegime: "act",
        })
      );
      expect(submit).toHaveBeenCalledOnce();
      expect(controller.read().attachmentDraft).toBeNull();
    } finally {
      controller.disconnect();
    }
  });

  it.each(["plan", "goal"] as const)(
    "retains an unsupported Home %s intent until explicitly removed",
    async (intent) => {
      const { controller, submit } = sending();
      const message = firstMessage("Make a poster");
      try {
        expect(
          await controller.startChat(
            null,
            message.take,
            intent === "plan" ? { operatingRegime: "plan" } : { goal: true }
          )
        ).toBe("Make a poster");
        expect(submit).not.toHaveBeenCalled();
        expect(controller.canSubmit).toBe(false);
        expect(
          intent === "plan"
            ? controller.read().operatingRegime
            : controller.read().goalIntent
        ).toBe(intent === "plan" ? "plan" : true);
        if (intent === "plan") controller.selectOperatingRegime("act");
        else controller.selectGoalIntent(false);
        expect(controller.canSubmit).toBe(true);
      } finally {
        controller.disconnect();
      }
    }
  );

  it("keeps an unsupported Home file in the composer without submitting text alone", async () => {
    const { controller, submit } = sending();
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });
    const message = firstMessage("Read these notes");
    try {
      expect(
        await controller.startChat(null, message.take, {
          attachment: { kind: "file", file },
        })
      ).toBe("Read these notes");
      expect(submit).not.toHaveBeenCalled();
      expect(controller.read().attachmentDraft).toMatchObject({
        name: "notes.txt",
        error: expect.any(String),
      });
      expect(controller.canSubmit).toBe(false);
      controller.removeAttachment(controller.read().scope);
      expect(controller.canSubmit).toBe(true);
    } finally {
      controller.disconnect();
    }
  });

  it("requires reattachment if Home's original File was lost on reload", async () => {
    const { controller, submit } = sending();
    const message = firstMessage("Read these notes");
    try {
      expect(
        await controller.startChat(null, message.take, {
          missingAttachment: { kind: "directory", name: "References" },
        })
      ).toBe("Read these notes");
      expect(submit).not.toHaveBeenCalled();
      expect(controller.read().attachmentDraft).toMatchObject({
        name: "References",
        error: expect.stringMatching(/original attachment/),
      });
      expect(controller.canSubmit).toBe(false);
    } finally {
      controller.disconnect();
    }
  });

  it("keeps the default connection without selecting one", async () => {
    const { controller, create, submit, choose } = sending();
    const message = firstMessage("Sketch a logo");
    try {
      expect(await controller.startChat(null, message.take)).toBeNull();
      expect(choose).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledOnce();
      expect(submit).toHaveBeenCalledExactlyOnceWith(
        "first",
        expect.any(String),
        "Sketch a logo"
      );
    } finally {
      controller.disconnect();
    }
  });

  it("never sends a message twice, also when the chat starts again", async () => {
    const { controller, submit } = sending();
    const message = firstMessage();
    try {
      await controller.startChat(null, message.take);
      controller.disconnect();
      expect(await controller.startChat(null, message.take)).toBeNull();
      expect(submit).toHaveBeenCalledOnce();
      expect(message.take).toHaveBeenCalledTimes(2);
    } finally {
      controller.disconnect();
    }
  });

  it("leaves the message for the next connection when the pane closes first", async () => {
    const { controller, choose, submit } = sending();
    const selecting = Promise.withResolvers<void>();
    choose.mockReturnValueOnce(selecting.promise);
    const message = firstMessage();
    const started = controller.startChat(PROFILE, message.take);
    await vi.waitFor(() => expect(choose).toHaveBeenCalledOnce());
    controller.disconnect();
    selecting.resolve();
    expect(await started).toBeNull();
    expect(message.take).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("drops the message with a notice when its connection cannot open", async () => {
    const { controller, choose, create, submit } = sending();
    choose.mockRejectedValueOnce(new Error("native_chat_profile_unavailable"));
    const message = firstMessage();
    try {
      expect(await controller.startChat(PROFILE, message.take)).toBe(
        "Make a launch poster"
      );
      expect(message.take).toHaveBeenCalledOnce();
      expect(create).not.toHaveBeenCalled();
      expect(submit).not.toHaveBeenCalled();
      expect(controller.read().error).toMatch(/wasn't sent/);
    } finally {
      controller.disconnect();
    }
  });

  it("returns the message to the composer when the send fails", async () => {
    const { controller, submit } = sending();
    submit.mockRejectedValueOnce(new Error("native_chat_unavailable"));
    const message = firstMessage();
    try {
      expect(await controller.startChat(null, message.take)).toBe(
        "Make a launch poster"
      );
      expect(submit).toHaveBeenCalledOnce();
      expect(controller.read().error).toBeTruthy();
      expect(controller.read().submitting).toBe(false);
    } finally {
      controller.disconnect();
    }
  });

  it("keeps a rejected first send in its original draft after another chat opens", async () => {
    const { controller, submit } = sending();
    const pending =
      Promise.withResolvers<Awaited<ReturnType<DesktopNativeChat["submit"]>>>();
    submit.mockReturnValueOnce(pending.promise);
    const drafts = durableDrafts();
    controller.keepDrafts(drafts, "workspace");
    const message = firstMessage("First request\nSecond line");
    const starting = controller.startChat(null, message.take);
    try {
      await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
      expect(controller.read().submitting).toBe(true);
      await controller.select("chat-b");
      expect(controller.read().submitting).toBe(false);
      const other = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Unrelated draft" }],
          },
        ],
      };
      drafts.write("workspace:chat-b", other);
      pending.reject(new Error("late send failure"));
      expect(await starting).toBeNull();
      expect(drafts.read("workspace:first")).toEqual({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "First request" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Second line" }],
          },
        ],
      });
      expect(drafts.read("workspace:chat-b")).toEqual(other);
      expect(controller.read().selected).toBe("chat-b");
      expect(controller.read().error).toBeNull();
    } finally {
      controller.disconnect();
    }
  });

  it("appends a late refused request without replacing newer rich edits in its original draft", async () => {
    const { controller, submit } = sending();
    const pending =
      Promise.withResolvers<Awaited<ReturnType<DesktopNativeChat["submit"]>>>();
    submit.mockReturnValueOnce(pending.promise);
    const drafts = durableDrafts();
    controller.keepDrafts(drafts, "workspace");
    const starting = controller.startChat(
      null,
      firstMessage("First request").take
    );
    try {
      await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
      const newer = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Newer edit", marks: [{ type: "bold" }] },
              {
                type: "mention",
                attrs: { id: "file", label: "notes.md", path: "notes.md" },
              },
            ],
          },
        ],
      };
      drafts.write("workspace:first", newer);
      await controller.select("chat-b");
      pending.reject(new Error("late send failure"));
      expect(await starting).toBeNull();
      expect(drafts.read("workspace:first")).toEqual({
        ...newer,
        content: [
          ...newer.content,
          {
            type: "paragraph",
            content: [{ type: "text", text: "First request" }],
          },
        ],
      });
      expect(drafts.read("workspace:chat-b")).toBeNull();
    } finally {
      controller.disconnect();
    }
  });

  it("does not duplicate a refused request already retained in the original document", async () => {
    const { controller, submit } = sending();
    const pending =
      Promise.withResolvers<Awaited<ReturnType<DesktopNativeChat["submit"]>>>();
    submit.mockReturnValueOnce(pending.promise);
    const drafts = durableDrafts();
    controller.keepDrafts(drafts, "workspace");
    const starting = controller.startChat(
      null,
      firstMessage("First request").take
    );
    try {
      await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
      const kept = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "First request" }],
          },
        ],
      };
      drafts.write("workspace:first", kept);
      await controller.select("chat-b");
      pending.reject(new Error("late send failure"));
      expect(await starting).toBeNull();
      expect(drafts.read("workspace:first")).toEqual(kept);
    } finally {
      controller.disconnect();
    }
  });

  it("keeps a rejected first send through pane cleanup instead of returning it to a retired input", async () => {
    const { controller, submit } = sending();
    const pending =
      Promise.withResolvers<Awaited<ReturnType<DesktopNativeChat["submit"]>>>();
    submit.mockReturnValueOnce(pending.promise);
    const drafts = durableDrafts();
    controller.keepDrafts(drafts, "workspace");
    const starting = controller.startChat(null, firstMessage().take);
    await vi.waitFor(() => expect(submit).toHaveBeenCalledOnce());
    controller.disconnect();
    pending.reject(new Error("late send failure"));
    expect(await starting).toBeNull();
    expect(drafts.read("workspace:first")).toMatchObject({
      content: [{ content: [{ text: "Make a launch poster" }] }],
    });
  });

  it("sends in Act without the new chat's leftover Plan or Goal draft", async () => {
    const { bridge, controller } = sending();
    const inRegime = vi.fn<NonNullable<DesktopNativeChat["submitInRegime"]>>(
      async (_action, id, inputId) => ({
        sessionId: id,
        inputId,
        disposition: "claimed",
        inputPosition: 1,
        turnId: `turn-${id}`,
      })
    );
    const startGoal = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>();
    bridge.submitInRegime = inRegime;
    bridge.startGoal = startGoal;
    const drafts = durableDrafts();
    drafts.writeModes("workspace:new", { plan: true, goal: true });
    controller.keepDrafts(drafts, "workspace");
    const message = firstMessage();
    try {
      expect(await controller.startChat(null, message.take)).toBeNull();
      expect(inRegime).toHaveBeenCalledExactlyOnceWith(
        "submit",
        "first",
        expect.any(String),
        "Make a launch poster",
        "act"
      );
      expect(startGoal).not.toHaveBeenCalled();
    } finally {
      controller.disconnect();
    }
  });

  it("declines a message the chat cannot start, keeping its text", () => {
    const { controller } = fixture();
    const message = firstMessage();
    expect(controller.declineMessage(message.take)).toBe(
      "Make a launch poster"
    );
    expect(controller.read().error).toMatch(/wasn't sent/);
    expect(controller.declineMessage(message.take)).toBeNull();
  });
});

it("starts a workspace on a newly chosen connection before the default", async () => {
  const { bridge } = fixture();
  const id = "8".repeat(64);
  const publish = vi.fn<(state: string | null) => void>();
  const status = vi.fn<DesktopNativeChat["status"]>();
  status
    .mockResolvedValueOnce("native-starting")
    .mockResolvedValueOnce("native-ready");
  const choose = vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
    async () => {}
  );
  const stop = NativeChatController.watchReadiness(
    { ...bridge, status, selectProfile: choose },
    publish,
    { kind: "new", id }
  );
  await vi.waitFor(() =>
    expect(publish).toHaveBeenLastCalledWith("native-ready")
  );
  expect(choose).toHaveBeenCalledExactlyOnceWith({ kind: "new", id });
  expect(choose.mock.invocationCallOrder[0]).toBeLessThan(
    status.mock.invocationCallOrder[1]!
  );
  stop();
});

describe("recommended model connections", () => {
  const recommended = "a".repeat(64);
  const explicit = "b".repeat(64);
  const catalog = (): NativeChatProfileCatalog => ({
    active: null,
    recommendedProfileId: recommended,
    choices: [
      { id: recommended, connection: "Subscription", model: "Recommended" },
      { id: explicit, connection: "Own key", model: "Explicit" },
    ],
    saved: [],
  });

  it("accepts only a currently offered recommendation with a valid identity", () => {
    expect(NativeChatController.recommendedProfile(catalog())).toBe(
      recommended
    );
    expect(
      NativeChatController.recommendedProfile({ ...catalog(), choices: [] })
    ).toBeNull();
    expect(
      NativeChatController.recommendedProfile({
        ...catalog(),
        recommendedProfileId: "Subscription",
        choices: [
          { id: "Subscription", connection: "Subscription", model: "M" },
        ],
      })
    ).toBeNull();
  });

  it("starts an untouched workspace on the recommendation and remembers that connection", async () => {
    const { bridge } = fixture();
    const stored = new Map<string, string>();
    const memory = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    };
    const status = vi.fn<DesktopNativeChat["status"]>();
    status
      .mockResolvedValueOnce("native-starting")
      .mockResolvedValue("native-ready");
    const choose = vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
      async () => {}
    );
    bridge.status = status;
    bridge.selectProfile = choose;
    bridge.profiles = async () => catalog();
    const publish = vi.fn<(state: string | null, profileId?: string) => void>();
    const stop = NativeChatController.watchReadiness(bridge, publish, null, {
      memory,
      key: "workspace",
      initialSession: null,
    });
    const controller = new NativeChatController(bridge, memory, "workspace");
    try {
      await vi.waitFor(() =>
        expect(publish).toHaveBeenLastCalledWith("native-ready", recommended)
      );
      expect(choose).toHaveBeenCalledExactlyOnceWith({
        kind: "new",
        id: recommended,
      });
      expect(choose.mock.invocationCallOrder[0]).toBeLessThan(
        status.mock.invocationCallOrder[1]!
      );
      controller.connect(null, recommended);
      await vi.waitFor(() =>
        expect(JSON.parse(stored.get("workspace")!).profileId).toBe(recommended)
      );
      expect(choose).toHaveBeenLastCalledWith({
        kind: "saved",
        id: recommended,
      });
    } finally {
      stop();
      controller.disconnect();
    }
  });

  it.each([
    [
      "remembered Default",
      JSON.stringify({ selected: null, sessions: [] }),
      null,
      null,
    ],
    [
      "remembered key",
      JSON.stringify({ selected: null, sessions: [], profileId: explicit }),
      null,
      { kind: "saved", id: explicit },
    ],
    ["an existing chat", null, "earlier-chat", null],
    ["a Welcome choice", null, null, { kind: "new", id: explicit }],
  ] as const)(
    "preserves %s before considering a recommendation",
    async (_name, stored, initialSession, selection) => {
      const { bridge } = fixture();
      const status = vi.fn<DesktopNativeChat["status"]>();
      status
        .mockResolvedValueOnce("native-starting")
        .mockResolvedValue("native-ready");
      const profiles = vi.fn<NonNullable<DesktopNativeChat["profiles"]>>(
        async () => catalog()
      );
      const choose = vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
        async () => {}
      );
      const publish = vi.fn<(state: string | null) => void>();
      const stop = NativeChatController.watchReadiness(
        { ...bridge, status, profiles, selectProfile: choose },
        publish,
        selection,
        {
          memory: { getItem: () => stored },
          key: "workspace",
          initialSession,
        }
      );
      try {
        await vi.waitFor(() =>
          expect(publish).toHaveBeenLastCalledWith("native-ready")
        );
        expect(profiles).not.toHaveBeenCalled();
        expect(choose.mock.calls).toEqual(selection ? [[selection]] : []);
      } finally {
        stop();
      }
    }
  );

  it("keeps a running worker without reading recommendations", async () => {
    const { bridge } = fixture();
    const profiles = vi.fn<NonNullable<DesktopNativeChat["profiles"]>>(
      async () => catalog()
    );
    const choose = vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
      async () => {}
    );
    const publish = vi.fn<(state: string | null) => void>();
    const stop = NativeChatController.watchReadiness(
      { ...bridge, profiles, selectProfile: choose },
      publish,
      null,
      { initialSession: null }
    );
    try {
      await vi.waitFor(() =>
        expect(publish).toHaveBeenCalledExactlyOnceWith("native-ready")
      );
      expect(profiles).not.toHaveBeenCalled();
      expect(choose).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it.each(["choice", "closed"] as const)(
    "does not apply a late recommendation after the view is %s",
    async (reason) => {
      const { bridge } = fixture();
      const pending = Promise.withResolvers<NativeChatProfileCatalog>();
      let stored: string | null = null;
      const status = vi.fn<DesktopNativeChat["status"]>();
      status
        .mockResolvedValueOnce("native-starting")
        .mockResolvedValue("native-ready");
      const profiles = vi.fn<NonNullable<DesktopNativeChat["profiles"]>>(
        () => pending.promise
      );
      const choose = vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
        async () => {}
      );
      const publish = vi.fn<(state: string | null) => void>();
      const stop = NativeChatController.watchReadiness(
        { ...bridge, status, profiles, selectProfile: choose },
        publish,
        null,
        {
          memory: { getItem: () => stored },
          key: "workspace",
          initialSession: null,
        }
      );
      await vi.waitFor(() => expect(profiles).toHaveBeenCalledOnce());
      if (reason === "closed") stop();
      else stored = JSON.stringify({ selected: null, sessions: [] });
      pending.resolve(catalog());
      await pending.promise;
      await vi.waitFor(() =>
        expect(status).toHaveBeenCalledTimes(reason === "choice" ? 2 : 1)
      );
      expect(publish.mock.calls).toEqual(
        reason === "choice"
          ? [["native-starting"], ["native-ready"]]
          : [["native-starting"]]
      );
      expect(choose).not.toHaveBeenCalled();
      stop();
    }
  );

  it("does not retain a recommendation the host refused", async () => {
    const { bridge } = fixture();
    const status = vi.fn<DesktopNativeChat["status"]>();
    status
      .mockResolvedValueOnce("native-starting")
      .mockResolvedValue("native-ready");
    const publish = vi.fn<(state: string | null) => void>();
    const stop = NativeChatController.watchReadiness(
      {
        ...bridge,
        status,
        profiles: async () => catalog(),
        selectProfile: async () => {
          throw new Error("connection changed");
        },
      },
      publish,
      null,
      { initialSession: null }
    );
    try {
      await vi.waitFor(() =>
        expect(publish).toHaveBeenLastCalledWith("native-ready")
      );
    } finally {
      stop();
    }
  });

  it.each([null, explicit])(
    "Welcome refresh preserves an explicit choice (%s)",
    async (id) => {
      const selection = new NativeChatController.ModelSelection();
      const pending = Promise.withResolvers<NativeChatProfileCatalog>();
      const refresh = selection.refresh(() => pending.promise);
      selection.choose(id ? { kind: "new", id } : { kind: "default" });
      pending.resolve(catalog());
      await refresh;
      expect(selection.read().profileId).toBe(id);
      await selection.refresh(async () => catalog());
      expect(selection.read().profileId).toBe(id);
    }
  );

  it("Welcome follows the current recommendation only until a choice is made", async () => {
    const selection = new NativeChatController.ModelSelection();
    await selection.refresh(async () => catalog());
    expect(selection.read().profileId).toBe(recommended);
    const { controller, bridge } = fixture();
    bridge.selectProfile = vi.fn<
      NonNullable<DesktopNativeChat["selectProfile"]>
    >(async () => {});
    const take = vi.fn<() => { text: string }>(() => ({
      text: "Use this connection",
    }));
    try {
      await controller.startChat(selection.read().profileId, take);
      expect(bridge.selectProfile).toHaveBeenCalledExactlyOnceWith({
        kind: "new",
        id: recommended,
      });
      expect(take).toHaveBeenCalledOnce();
    } finally {
      controller.disconnect();
    }
    await selection.refresh(async () => ({
      ...catalog(),
      recommendedProfileId: undefined,
    }));
    expect(selection.read().profileId).toBeNull();
  });

  it("Welcome keeps an explicit unavailable connection instead of changing its draft's funding", async () => {
    const selection = new NativeChatController.ModelSelection();
    await selection.refresh(async () => catalog());
    selection.choose({ kind: "new", id: recommended });
    const original = catalog().choices[0];
    const replacement = { ...original, id: "c".repeat(64) };
    const changed: NativeChatProfileCatalog = {
      active: null,
      recommendedProfileId: replacement.id,
      choices: [replacement],
      saved: [],
    };
    for (const next of [
      { ...catalog(), recommendedProfileId: undefined, choices: [] },
      changed,
      { ...changed, saved: [{ ...original, available: false }] },
    ]) {
      await selection.refresh(async () => next);
      expect(selection.read().profileId).toBe(recommended);
      expect(selection.read().profiles?.saved).toEqual([
        { ...original, available: false },
      ]);
    }

    const { bridge, controller } = fixture();
    bridge.selectProfile = async () => {
      throw new Error("native_chat_profile_unavailable");
    };
    const take = vi.fn<() => { text: string }>(() => ({
      text: "Keep the subscription draft",
    }));
    try {
      expect(await controller.startChat(selection.read().profileId, take)).toBe(
        "Keep the subscription draft"
      );
      expect(controller.read().error).toContain("wasn't sent");
    } finally {
      controller.disconnect();
    }

    await selection.refresh(async () => catalog());
    expect(selection.read().profileId).toBe(recommended);
    expect(selection.read().profiles?.saved).toEqual([]);
    selection.choose({ kind: "default" });
    await selection.refresh(async () => changed);
    expect(selection.read().profileId).toBeNull();
  });

  it("Welcome ignores a replaced or released catalogue request", async () => {
    const selection = new NativeChatController.ModelSelection();
    const first = Promise.withResolvers<NativeChatProfileCatalog>();
    const pending = selection.refresh(() => first.promise);
    await selection.refresh(async () => ({
      ...catalog(),
      recommendedProfileId: explicit,
    }));
    first.resolve(catalog());
    await pending;
    expect(selection.read().profileId).toBe(explicit);
    const last = Promise.withResolvers<NativeChatProfileCatalog>();
    const closed = selection.refresh(() => last.promise);
    selection.release();
    last.resolve(catalog());
    await closed;
    expect(selection.read().profileId).toBe(explicit);
  });
});

describe("background processes", () => {
  const PROCESS = {
    processId: 3,
    command: "pnpm dev",
    cwd: "/fixture/workspace",
    terminal: true,
    startedAt: 1_700_000_000_000,
    state: "running",
    exitCode: null,
  } as const;

  function processes(accepted = true) {
    const f = fixture();
    let listed: (typeof PROCESS)[] = [PROCESS];
    const list = vi.fn<NonNullable<DesktopNativeChat["backgroundProcesses"]>>(
      async () => listed
    );
    const stop = vi.fn<
      NonNullable<DesktopNativeChat["stopBackgroundProcesses"]>
    >(async (_id, ids) => {
      listed = [];
      return ids ?? [3];
    });
    f.bridge.acceptsBackgroundProcesses = async () => accepted;
    f.bridge.backgroundProcesses = list;
    f.bridge.stopBackgroundProcesses = stop;
    return { ...f, list, stop };
  }

  it("lists the attached chat's processes and follows its live list", async () => {
    const { controller, updates, list } = processes();
    await controller.select("chat-a");
    await vi.waitFor(() =>
      expect(controller.read().backgroundProcesses?.read().running).toBe(1)
    );
    expect(list).toHaveBeenCalledWith("chat-a");
    const view = controller.read().backgroundProcesses!;
    updates.get("chat-a")!({
      kind: "processes",
      processes: [{ ...PROCESS, state: "ended", exitCode: 0 }],
    });
    expect(view.read()).toMatchObject({
      running: 0,
      processes: [{ processId: 3, state: "ended", exitCode: 0 }],
    });
    // A process list is not a transcript change.
    expect(controller.read().repairing).toBe(false);
  });

  it("stops every process for /stop without stopping the turn", async () => {
    const { bridge, controller, stop } = processes();
    const control = vi.spyOn(bridge, "control");
    const submit = vi.spyOn(bridge, "submit");
    await controller.select("chat-a");
    await vi.waitFor(() =>
      expect(controller.read().backgroundProcesses).not.toBeNull()
    );
    await controller.submit("/stop");
    expect(stop).toHaveBeenCalledExactlyOnceWith("chat-a", undefined);
    expect(controller.read().backgroundProcesses?.read().running).toBe(0);
    expect(control).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    // Stopping one process names it.
    await controller.read().backgroundProcesses!.stop([3]);
    expect(stop).toHaveBeenLastCalledWith("chat-a", [3]);
  });

  it("refuses /stop when the chat does not offer background processes", async () => {
    const { bridge, controller, stop } = processes(false);
    const submit = vi.spyOn(bridge, "submit");
    await controller.select("chat-a");
    await expect(controller.submit("/stop")).rejects.toThrow(
      "Background processes are unavailable in this chat."
    );
    expect(controller.read().backgroundProcesses).toBeNull();
    expect(stop).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("keeps processes running when switching chats", async () => {
    const { controller, stop } = processes();
    await controller.select("chat-a");
    await vi.waitFor(() =>
      expect(controller.read().backgroundProcesses).not.toBeNull()
    );
    await controller.select("chat-b");
    expect(stop).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "retires published observers before a deferred legacy connection restore (available: %s)",
    async (available) => {
      const { bridge, transcripts, updates, stop } = processes();
      const id = "e".repeat(64);
      const restoring = Promise.withResolvers<void>();
      const choose = vi.fn<NonNullable<DesktopNativeChat["selectProfile"]>>(
        () => restoring.promise
      );
      bridge.selectProfile = choose;
      const observe = bridge.observe.bind(bridge);
      bridge.observe = async (attachmentId) => {
        const observed = await observe(attachmentId);
        return {
          ...observed,
          snapshot: { ...observed.snapshot, subagentsAvailable: true },
        };
      };
      bridge.listSubagents = async () => ({
        children: [],
        nextAfterChildId: null,
      });
      bridge.inspectSubagent =
        vi.fn<NonNullable<DesktopNativeChat["inspectSubagent"]>>();
      bridge.createSubagent =
        vi.fn<NonNullable<DesktopNativeChat["createSubagent"]>>();
      bridge.assignSubagent =
        vi.fn<NonNullable<DesktopNativeChat["assignSubagent"]>>();
      const stopSubagent =
        vi.fn<NonNullable<DesktopNativeChat["stopSubagent"]>>();
      bridge.stopSubagent = stopSubagent;
      let stored = JSON.stringify({ selected: "chat-a", sessions: ["chat-a"] });
      const memory = {
        getItem: () => stored,
        setItem: (_key: string, value: string) => {
          stored = value;
        },
      };
      const controller = new NativeChatController(bridge, memory, "workspace");
      transcripts.set("chat-a", [
        { messageId: "retained", role: "assistant", text: "Retained answer." },
      ]);
      const published: Pick<
        ReturnType<NativeChatController["read"]>,
        "subagents" | "backgroundProcesses"
      >[] = [];
      let reconnect = false;
      const unsubscribe = controller.subscribe(() => {
        const { subagents, backgroundProcesses } = controller.read();
        published.push({ subagents, backgroundProcesses });
        if (reconnect && !subagents && !backgroundProcesses) {
          reconnect = false;
          // Reconnection may be requested by a subscriber in the same turn.
          controller.connect(null, null);
        }
      });
      try {
        controller.connect(null, null);
        await vi.waitFor(() => {
          expect(controller.read().subagents).not.toBeNull();
          expect(controller.read().backgroundProcesses).not.toBeNull();
          expect(controller.read().profiles?.modelChanges).toBe(true);
        });
        const retiredSubagents = controller.read().subagents!;
        const retiredProcesses = controller.read().backgroundProcesses!;
        retiredSubagents.show();
        const lateUpdate = updates.get("chat-a")!;
        const retainedMessages = controller.read().messages;
        stored = JSON.stringify({
          selected: "chat-a",
          sessions: ["chat-a"],
          profileId: id,
        });
        published.length = 0;
        reconnect = true;
        controller.disconnect();
        expect(published[0]).toEqual({
          subagents: null,
          backgroundProcesses: null,
        });
        expect(controller.read().messages).toBe(retainedMessages);
        expect(controller.read()).toMatchObject({
          subagents: null,
          backgroundProcesses: null,
        });
        await vi.waitFor(() =>
          expect(choose).toHaveBeenCalledExactlyOnceWith({ kind: "saved", id })
        );
        retiredSubagents.show();
        lateUpdate({ kind: "processes", processes: [PROCESS] });
        expect(controller.read()).toMatchObject({
          subagents: null,
          backgroundProcesses: null,
        });
        if (available) restoring.resolve();
        else restoring.reject(new Error("native_chat_profile_unavailable"));
        await vi.waitFor(() => {
          expect(controller.read().subagents).not.toBeNull();
          expect(controller.read().backgroundProcesses).not.toBeNull();
          expect(controller.read().profileBusy).toBe(false);
        });
        expect(controller.read().subagents).not.toBe(retiredSubagents);
        expect(controller.read().backgroundProcesses).not.toBe(
          retiredProcesses
        );
        expect(
          published.every(
            (view) =>
              view.subagents !== retiredSubagents &&
              view.backgroundProcesses !== retiredProcesses
          )
        ).toBe(true);
        expect(stop).not.toHaveBeenCalled();
        expect(stopSubagent).not.toHaveBeenCalled();
      } finally {
        restoring.resolve();
        unsubscribe();
        controller.disconnect();
      }
    }
  );
});

describe("slash commands", () => {
  const ALL = ["plan", "goal", "side", "stop", "compact", "fork"];

  function commands() {
    const f = fixture();
    let queued = 0;
    let paused = false;
    let pendingGoalId: string | undefined;
    const observe = f.bridge.observe.bind(f.bridge);
    f.bridge.observe = async (id) => {
      const observation = await observe(id);
      return {
        ...observation,
        snapshot: {
          ...observation.snapshot,
          queuedInputs: queued,
          admissionPaused: paused,
          ...(pendingGoalId && { pendingGoalId }),
        },
      };
    };
    const submitInRegime = vi.fn<
      NonNullable<DesktopNativeChat["submitInRegime"]>
    >(async (_action, sessionId, inputId) => ({
      sessionId,
      inputId,
      disposition: "queued",
      inputPosition: 2,
      turnId: null,
    }));
    const startGoal = vi.fn<NonNullable<DesktopNativeChat["startGoal"]>>(
      async (sessionId, inputId) => {
        pendingGoalId = inputId;
        return {
          sessionId,
          inputId,
          disposition: "queued",
          inputPosition: 2,
          turnId: null,
        };
      }
    );
    const steer = vi.fn<NonNullable<DesktopNativeChat["steer"]>>();
    const runCommand = vi.fn<NonNullable<DesktopNativeChat["runCommand"]>>();
    const stop = vi.fn<
      NonNullable<DesktopNativeChat["stopBackgroundProcesses"]>
    >(async () => []);
    f.bridge.submitInRegime = submitInRegime;
    f.bridge.enqueue = vi.fn<NonNullable<DesktopNativeChat["enqueue"]>>();
    f.bridge.steer = steer;
    f.bridge.goal = async () => ({ observationId: null, goal: null });
    f.bridge.startGoal = startGoal;
    f.bridge.openSideChat =
      vi.fn<NonNullable<DesktopNativeChat["openSideChat"]>>();
    f.bridge.closeSideChat =
      vi.fn<NonNullable<DesktopNativeChat["closeSideChat"]>>();
    f.bridge.commands = async () => ["compact", "fork"];
    f.bridge.runCommand = runCommand;
    f.bridge.acceptsBackgroundProcesses = async () => true;
    f.bridge.backgroundProcesses = async () => [];
    f.bridge.stopBackgroundProcesses = stop;
    return {
      ...f,
      submitInRegime,
      startGoal,
      steer,
      runCommand,
      stop,
      busy(state: { queued?: number; paused?: boolean }) {
        f.running.add("chat-a");
        queued = state.queued ?? 0;
        paused = state.paused ?? false;
      },
    };
  }

  async function open(controller: NativeChatController) {
    await controller.select("chat-a");
    await vi.waitFor(() => {
      expect(controller.read().commands).toEqual(["compact", "fork"]);
      expect(controller.read().backgroundProcesses).not.toBeNull();
      expect(controller.read().goalReady).toBe(true);
    });
  }

  it("lists the same commands whether the chat is idle or the agent is working", async () => {
    const idle = commands();
    await open(idle.controller);
    expect(idle.controller.composerCommands).toEqual(ALL);
    idle.controller.disconnect();

    for (const state of [{}, { queued: 2 }, { queued: 1, paused: true }]) {
      const busy = commands();
      busy.busy(state);
      await open(busy.controller);
      expect(busy.controller.composerCommands).toEqual(ALL);
      busy.controller.toggleSteering();
      expect(busy.controller.read().steering).toBe(true);
      expect(busy.controller.composerCommands).toEqual(ALL);
      // An in-flight send does not hide commands either.
      const held = Promise.withResolvers<void>();
      busy.submitInRegime.mockImplementationOnce(async (_a, id, inputId) => {
        await held.promise;
        return {
          sessionId: id,
          inputId,
          disposition: "queued",
          inputPosition: 3,
          turnId: null,
        };
      });
      busy.controller.toggleSteering();
      const sending = busy.controller.submit("Next");
      await vi.waitFor(() => expect(busy.controller.read().acting).toBe(true));
      expect(busy.controller.composerCommands).toEqual(ALL);
      held.resolve();
      await sending;
      busy.controller.disconnect();
    }
  });

  it("queues the next message in Plan during a turn and turns steering off", async () => {
    const { controller, busy, submitInRegime, steer } = commands();
    busy({});
    await open(controller);
    controller.toggleSteering();
    await controller.runComposerCommand("plan");
    expect(controller.read()).toMatchObject({
      steering: false,
      operatingRegime: "plan",
      commandNotice: expect.stringContaining("waits in the queue"),
    });
    await controller.submit("Investigate the export");
    expect(submitInRegime).toHaveBeenCalledExactlyOnceWith(
      "enqueue",
      "chat-a",
      expect.any(String),
      "Investigate the export",
      "plan"
    );
    expect(steer).not.toHaveBeenCalled();
    controller.disconnect();
  });

  it("sends a goal started during a turn to the host, which queues it", async () => {
    const { controller, busy, startGoal, steer } = commands();
    busy({ queued: 1 });
    await open(controller);
    expect(controller.canStartGoal).toBe(true);
    controller.toggleSteering();
    await controller.runComposerCommand("goal");
    expect(controller.read()).toMatchObject({
      goalIntent: true,
      steering: false,
    });
    expect(controller.canSubmit).toBe(true);
    await controller.submit("Prepare the export");
    expect(startGoal).toHaveBeenCalledExactlyOnceWith(
      "chat-a",
      expect.any(String),
      expect.objectContaining({ objective: "Prepare the export" })
    );
    expect(steer).not.toHaveBeenCalled();
    expect(controller.read().goalIntent).toBe(false);
    // The queued start is this chat's goal; another waits for it.
    await vi.waitFor(() =>
      expect(controller.read().observation?.snapshot.pendingGoalId).toBe(
        startGoal.mock.calls[0][1]
      )
    );
    expect(controller.composerCommands).toEqual(ALL);
    await controller.runComposerCommand("goal");
    expect(controller.read()).toMatchObject({
      goalIntent: false,
      error: "A goal is already waiting to start in this chat.",
    });
    controller.disconnect();
  });

  it("says /fork and /compact are unavailable while the agent works", async () => {
    const { bridge, controller, busy, runCommand } = commands();
    const submit = vi.spyOn(bridge, "submit");
    busy({});
    await open(controller);
    await controller.runComposerCommand("fork");
    expect(controller.read().error).toBe(
      "/fork is unavailable while the agent is working."
    );
    // Typed alone, the command behaves as chosen from the menu.
    await controller.submit("/compact");
    expect(controller.read().error).toBe(
      "/compact is unavailable while the agent is working."
    );
    expect(runCommand).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    controller.disconnect();
  });

  it("reports /stop with no background process running", async () => {
    const { controller, stop } = commands();
    await open(controller);
    await controller.runComposerCommand("stop");
    await controller.submit("/stop");
    expect(stop).not.toHaveBeenCalled();
    expect(controller.read()).toMatchObject({
      error: null,
      commandNotice: "No background processes are running.",
    });
    controller.disconnect();
  });
});

describe("pending sends across a renderer restart", () => {
  async function capturedImage() {
    const f = fixture(),
      blobs = new Map<string, ComposerDraftBlob>();
    const sends = vi.fn<NonNullable<DesktopNativeChat["submitSelectedImage"]>>(
      async (id, input) => ({
        sessionId: id,
        inputId: input.inputId,
        inputPosition: 1,
        turnId: "turn",
        disposition: "claimed",
      })
    );
    f.bridge.acceptsSelectedImage = async () => true;
    f.bridge.submitSelectedImage = sends;
    f.controller.keepDrafts(durableDrafts(blobs), "workspace");
    await f.controller.select("chat-a");
    const original = new File(["frozen-image-original"], "same.jpg", {
      type: "image/jpeg",
    });
    await f.controller.pickFile(f.controller.read().scope, original);
    sends.mockImplementationOnce(async (_id, input) => {
      expect(blobs.get("\0pending:workspace:chat-a")).toMatchObject({
        kind: "pending",
        submission: {
          inputId: input.inputId,
          text: input.text,
          attachment: { kind: "image", file: input.file },
        },
      });
      throw new Error("lost acknowledgement");
    });
    await expect(
      f.controller.submit("Inspect the frozen original.")
    ).rejects.toThrow("lost acknowledgement");
    const sent = sends.mock.calls[0][1];
    f.controller.disconnect();
    const reopen = async () => {
      const controller = new NativeChatController(f.bridge);
      controller.keepDrafts(durableDrafts(blobs), "workspace");
      await controller.select("chat-a");
      return controller;
    };
    return { ...f, blobs, sends, sent, reopen };
  }

  it("reconciles the exact accepted input before current image capabilities and never sends twice", async () => {
    const f = await capturedImage();
    f.bridge.acceptsSelectedImage = async () => false;
    const receipt = vi.fn<DesktopNativeChat["inputReceipt"]>(
      async (id, inputId) => ({
        sessionId: id,
        inputId,
        inputPosition: 1,
        turnId: "turn",
        disposition: "claimed",
      })
    );
    f.bridge.inputReceipt = receipt;
    const reopened = await f.reopen();
    try {
      expect(reopened.read().selectedImageInput).toBe(false);
      expect(reopened.canSubmit).toBe(true);
      await reopened.submit("Inspect the frozen original.");
      expect(receipt).toHaveBeenCalledExactlyOnceWith("chat-a", f.sent.inputId);
      expect(f.sends).toHaveBeenCalledTimes(1);
      expect(reopened.read().attachmentDraft).toBeNull();
      expect(f.blobs.has("\0pending:workspace:chat-a")).toBe(false);
      expect(f.blobs.has("workspace:chat-a")).toBe(false);
    } finally {
      reopened.disconnect();
    }
  });

  it("resends only after authoritative absence with the original ID and frozen bytes but no invented origin", async () => {
    const f = await capturedImage(),
      reopened = await f.reopen();
    try {
      await reopened.submit("Inspect the frozen original.");
      expect(f.sends).toHaveBeenCalledTimes(2);
      const retried = f.sends.mock.calls[1][1];
      expect(retried).toEqual({ ...f.sent, originalFile: undefined });
      expect(retried).not.toHaveProperty("originalFile");
      expect(await retried.file.text()).toBe("frozen-image-original");
      expect(retried.inputId).toBe(f.sent.inputId);
    } finally {
      reopened.disconnect();
    }
  });

  it("preserves the captured identity through another unknown receipt outcome", async () => {
    const f = await capturedImage();
    f.bridge.inputReceipt = vi.fn<DesktopNativeChat["inputReceipt"]>(
      async () => {
        throw new Error("receipt disconnected");
      }
    );
    const reopened = await f.reopen();
    try {
      await expect(
        reopened.submit("Inspect the frozen original.")
      ).rejects.toThrow("receipt disconnected");
      expect(f.sends).toHaveBeenCalledTimes(1);
      expect(f.blobs.get("\0pending:workspace:chat-a")).toMatchObject({
        submission: { inputId: f.sent.inputId },
      });
      expect(reopened.read().attachmentDraft?.name).toBe("same.jpg");
    } finally {
      reopened.disconnect();
    }
  });

  it("does not dispatch before durable storage commits and reuses its ID if storage refuses", async () => {
    const f = fixture(),
      blobs = new Map<string, ComposerDraftBlob>();
    const persisted = Promise.withResolvers<void>();
    let fail = true;
    const store = new ComposerDrafts(null, {
      get: async (key) => blobs.get(key) ?? null,
      put: async (key, value) => {
        if (value.kind === "pending") {
          await persisted.promise;
          if (fail) throw new Error("storage aborted");
        }
        blobs.set(key, value);
      },
      delete: async (key) => {
        blobs.delete(key);
      },
    });
    f.controller.keepDrafts(store, "workspace");
    const send = vi.spyOn(f.bridge, "submit");
    await f.controller.select("chat-a");
    const sending = f.controller.submit("Keep the retry identity.");
    await vi.waitFor(() => expect(f.controller.read().acting).toBe(true));
    expect(send).not.toHaveBeenCalled();
    const rejection = sending.catch((error: unknown) => error);
    await vi.waitFor(async () =>
      expect(
        (await store.readPending("workspace:chat-a"))?.inputId
      ).toBeTruthy()
    );
    const pending = await store.readPending("workspace:chat-a");
    persisted.resolve();
    expect(await rejection).toMatchObject({ message: "storage aborted" });
    expect(send).not.toHaveBeenCalled();
    fail = false;
    await f.controller.submit("Keep the retry identity.");
    expect(send).toHaveBeenCalledExactlyOnceWith(
      "chat-a",
      pending!.inputId,
      "Keep the retry identity."
    );
    f.controller.disconnect();
  });

  it("blocks a corrupt stored retry record instead of inventing a new input", async () => {
    const f = fixture(),
      blobs = new Map<string, ComposerDraftBlob>();
    blobs.set("\0pending:workspace:chat-a", {
      kind: "pending",
      version: 1,
      key: "wrong-chat",
      submission: {
        inputId: "old",
        text: "Keep me",
        mode: "submit",
        allowLibrarySelection: false,
      },
    });
    f.controller.keepDrafts(durableDrafts(blobs), "workspace");
    const send = vi.spyOn(f.bridge, "submit");
    try {
      await f.controller.select("chat-a");
      expect(f.controller.canSubmit).toBe(false);
      await expect(f.controller.submit("Keep me")).rejects.toThrow(
        "native_chat_retry_storage_unavailable"
      );
      expect(send).not.toHaveBeenCalled();
      expect(blobs.has("\0pending:workspace:chat-a")).toBe(true);
    } finally {
      f.controller.disconnect();
    }
  });
});

it("restores only a reference's pending identity and never invents a path or byte upload after restart", async () => {
  const f = referenceFixture(),
    blobs = new Map<string, ComposerDraftBlob>();
  f.controller.keepDrafts(durableDrafts(blobs), "workspace");
  let reopened: NativeChatController | undefined;
  try {
    await f.controller.select("chat-a");
    const file = f.dropped("notes.txt", "text/plain", 100);
    await f.controller.pickFile(f.controller.read().scope, file.file);
    f.sendReference.mockRejectedValueOnce(new Error("lost reference receipt"));
    await expect(f.controller.submit("Read the notes.")).rejects.toThrow(
      "lost reference receipt"
    );
    const id = f.sendReference.mock.calls[0][1].inputId;
    const captured = blobs.get("\0pending:workspace:chat-a");
    expect(captured).toMatchObject({
      kind: "pending",
      submission: {
        inputId: id,
        attachment: {
          kind: "reference",
          name: "notes.txt",
          referenceId: expect.any(String),
        },
      },
    });
    if (captured?.kind !== "pending") throw new Error("missing capture");
    expect(captured.submission.attachment).not.toHaveProperty("file");
    expect(captured.submission.attachment).not.toHaveProperty("path");
    f.controller.disconnect();
    reopened = new NativeChatController(f.bridge);
    reopened.keepDrafts(durableDrafts(blobs), "workspace");
    await reopened.select("chat-a");
    expect(reopened.canSubmit).toBe(true);
    await expect(reopened.submit("Read the notes.")).rejects.toThrow(
      "native_chat_pending_attachment_unavailable"
    );
    expect(f.sendReference).toHaveBeenCalledTimes(1);
    expect(f.bridge.submitFile).not.toHaveBeenCalled();
    expect(reopened.read().attachmentDraft?.name).toBe("notes.txt");
    f.bridge.inputReceipt = async (sessionId, inputId) => ({
      sessionId,
      inputId,
      inputPosition: 1,
      turnId: null,
      disposition: "queued",
    });
    await reopened.submit("Read the notes.");
    expect(reopened.read().attachmentDraft).toBeNull();
    expect(blobs.has("\0pending:workspace:chat-a")).toBe(false);
  } finally {
    f.controller.disconnect();
    reopened?.disconnect();
    vi.restoreAllMocks();
  }
});

it("keeps an original preview read valid across an equivalent transcript refresh", async () => {
  const f = fixture(),
    result = Promise.withResolvers<ArrayBuffer>();
  const message: NativeChatMessage = {
    messageId: "image-message",
    role: "user",
    text: "Look",
    attachments: [
      {
        name: "photo.jpg",
        mimeType: "image/jpeg",
        previewId: "same-capability",
      },
    ],
  };
  f.transcripts.set("chat-a", [message]);
  f.bridge.readAttachmentPreview = () => result.promise;
  await f.controller.select("chat-a");
  const reading = f.controller.readAttachmentPreview("same-capability");
  f.transcripts.set("chat-a", [structuredClone(message)]);
  await f.controller.repair();
  result.resolve(new Uint8Array([1, 2]).buffer);
  await expect(reading).resolves.toMatchObject({ type: "image/jpeg", size: 2 });
  f.controller.disconnect();
});
