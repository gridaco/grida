import { describe, expect, it, vi } from "vitest";
import {
  ComposerDrafts,
  type ComposerDraftBlob,
  type ComposerDraftBlobs,
} from "@/lib/agent-chat/composer-drafts";
import type { Workspace } from "@/lib/desktop/bridge";
import { imagesMessageContext } from "@/lib/desktop/images-message-context";
import { workflowMessageContext } from "@/lib/desktop/workflow-message-context";
import { HomeComposer } from "./home-composer";
import { ApplicationPreset } from "./application-preset";

const workspace = { id: "chosen", name: "Chosen" } as Workspace;
const input: HomeComposer.Input = {
  text: "Make a poster",
  prompt: "Make a poster",
  profileId: null,
  target: workspace,
  references: [],
};
function setup() {
  const drafts = new ComposerDrafts(null, null);
  const composer = new HomeComposer(drafts);
  const host: HomeComposer.Host = {
    defaultWorkspace: vi.fn<HomeComposer.Host["defaultWorkspace"]>(
      async () => ({ ...workspace, id: "default" })
    ),
    stash: vi.fn<HomeComposer.Host["stash"]>(() => true),
    open: vi.fn<HomeComposer.Host["open"]>(),
  };
  return { composer, drafts, host };
}

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => void entries.delete(key),
    setItem: (key, value) => void entries.set(key, value),
  };
}

function memoryBlobs() {
  const entries = new Map<string, ComposerDraftBlob>();
  const store: ComposerDraftBlobs = {
    get: async (key) => entries.get(key) ?? null,
    put: async (key, value) => void entries.set(key, value),
    delete: async (key) => void entries.delete(key),
  };
  return { entries, store };
}

function fullAccess() {
  const review = {
    reviewId: "review",
    chatTitle: "New chat",
    workspaceName: "Chosen",
  };
  const prepared = {
    sessionId: "abf7864b-6bd5-4d77-9159-7d17ddbed879",
    profileId: "a".repeat(64),
  };
  const access = {
    prepare: vi.fn<HomeComposer.AccessHost["prepare"]>(async () => review),
    answer: vi.fn<HomeComposer.AccessHost["answer"]>(async () => {}),
    start: vi.fn<HomeComposer.AccessHost["start"]>(async () => prepared),
  };
  return { access, review, prepared };
}

const fastPreview = {
  profileId: "a".repeat(64),
  modelId: "gpt-6.2-sol",
  status: "available",
  speeds: ["fast"],
  webSearch: true,
} as const satisfies HomeComposer.CapabilityPreview;

describe("HomeComposer", () => {
  it("restores the whole failed image request when the recovery lookup is still pending", async () => {
    const storage = memoryStorage();
    const blobs = memoryBlobs();
    const composer = new HomeComposer(new ComposerDrafts(storage, blobs.store));
    const { host } = setup();
    vi.mocked(host.stash).mockReturnValue(false);
    const source = composer.draftFor(workspace.id);
    const document = { text: input.text };
    const first = new File(["first"], "same.png", { type: "image/png" });
    const second = new File(["second"], "same.png", { type: "image/png" });
    composer.transfer({
      resources: [first, second].map((file) => ({ kind: "file", file })),
    });
    expect(
      composer.capture(input, document, host, { ...source, read: () => null })
    ).toBe(true);
    await vi.waitFor(() => expect(composer.read().busy).toBe(false));
    const stored = blobs.store.get.bind(blobs.store);
    const read = Promise.withResolvers<void>();
    vi.spyOn(blobs.store, "get").mockImplementation(async (key) => {
      if (key === `${source.key}:outgoing`) await read.promise;
      return stored(key);
    });
    const reopened = new HomeComposer(new ComposerDrafts(storage, blobs.store));
    reopened.recoverDraft(source.key, () => false);
    const editor = vi.fn<(document: unknown) => boolean>(() => true);
    const editing = reopened.restoreCaptured(editor);
    expect(editor).not.toHaveBeenCalled();
    read.resolve();
    expect(await editing).toBe(true);
    expect(editor).toHaveBeenCalledExactlyOnceWith(document);
    expect(reopened.read().attachments.map(({ input }) => input)).toEqual([
      expect.objectContaining({ file: first }),
      expect.objectContaining({ file: second }),
    ]);
  });

  it("keeps the original image cache if copying the failed request cannot be persisted", async () => {
    const storage = memoryStorage();
    const blobs = memoryBlobs();
    const composer = new HomeComposer(new ComposerDrafts(storage, blobs.store));
    const { host } = setup();
    vi.mocked(host.stash).mockReturnValue(false);
    const source = composer.draftFor(workspace.id);
    const document = { text: input.text };
    const image = new File(["img"], "same.png", { type: "image/png" });
    const put = blobs.store.put.bind(blobs.store);
    vi.spyOn(blobs.store, "put").mockImplementation(async (key, value) => {
      if (key === `${source.key}:outgoing`) throw new Error("disk full");
      return put(key, value);
    });
    composer.transfer({ resources: [{ kind: "file", file: image }] });
    expect(
      composer.capture(input, document, host, { ...source, read: () => null })
    ).toBe(true);
    await vi.waitFor(() => expect(composer.read().busy).toBe(false));
    expect(blobs.entries.has(HomeComposer.key)).toBe(true);
    const reopened = new HomeComposer(new ComposerDrafts(storage, blobs.store));
    reopened.recoverDraft(source.key, () => false);
    expect(await reopened.restoreCaptured(() => true)).toBe(true);
    expect(reopened.read().attachments[0]?.input).toMatchObject({
      file: image,
    });
  });

  it.each([false, true])(
    "retires only the submitted text from the recovery cache, with an identical next draft: %s",
    async (typedAgain) => {
      const storage = memoryStorage();
      const drafts = new ComposerDrafts(storage, null);
      const composer = new HomeComposer(drafts);
      const { host } = setup();
      vi.mocked(host.stash).mockReturnValue(false);
      const source = composer.draftFor(workspace.id);
      const document = { text: input.text };
      const documentKey = ComposerDrafts.prefix + source.key;
      drafts.write(source.key, document);
      const submitted = storage.getItem(documentKey)!;
      composer.transfer({
        resources: [
          {
            kind: "file",
            file: new File(["image"], "image.png", { type: "image/png" }),
          },
        ],
      });
      expect(
        composer.capture(input, document, host, { ...source, read: () => null })
      ).toBe(true);
      await vi.waitFor(() => expect(composer.read().busy).toBe(false));
      if (typedAgain) drafts.write(source.key, structuredClone(document));
      else storage.setItem(documentKey, submitted);

      const reopenedDrafts = new ComposerDrafts(storage, null);
      const reopened = new HomeComposer(reopenedDrafts);
      reopened.recoverDraft(source.key, () => false);
      expect(reopened.read().draftKey).toBe(source.key);
      expect(reopenedDrafts.read(source.key)).toEqual(
        typedAgain ? document : null
      );
      expect(reopened.read().outgoing).toMatchObject({
        status: "failed",
        handedOff: false,
      });
    }
  );

  it("refuses to send if the submitted text cannot leave the active draft cache", () => {
    const storage = memoryStorage();
    const drafts = new ComposerDrafts(storage, null);
    const composer = new HomeComposer(drafts);
    const { host } = setup();
    const source = composer.draftFor(workspace.id);
    const document = { text: input.text };
    const image = new File(["image"], "one.png", { type: "image/png" });
    drafts.write(source.key, document);
    composer.transfer({ resources: [{ kind: "file", file: image }] });
    const removeItem = storage.removeItem.bind(storage);
    vi.spyOn(storage, "removeItem").mockImplementation((key) => {
      if (key === ComposerDrafts.prefix + source.key)
        throw new Error("storage unavailable");
      removeItem(key);
    });

    expect(() =>
      composer.capture(input, document, host, {
        ...source,
        read: () => document,
      })
    ).toThrow("Couldn't send from Home. Your draft is still here.");
    expect(composer.read().attachments[0]?.input).toMatchObject({
      file: image,
    });
    expect(composer.read().outgoing).toBeNull();
    expect(host.stash).not.toHaveBeenCalled();
    expect(new ComposerDrafts(storage, null).read(source.key)).toEqual(
      document
    );
  });

  it("recovers captured content and attachment metadata after reload before handoff", async () => {
    const storage = memoryStorage();
    const drafts = new ComposerDrafts(storage, null);
    const composer = new HomeComposer(drafts);
    const { host } = setup();
    const resolving = Promise.withResolvers<Workspace | null>();
    vi.mocked(host.defaultWorkspace).mockReturnValue(resolving.promise);
    const source = composer.draftFor("default");
    const submitted = {
      type: "doc",
      content: [{ type: "text", text: input.text }],
    };
    const following = {
      type: "doc",
      content: [{ type: "text", text: "The next message" }],
    };
    drafts.write(source.key, submitted);
    composer.transfer({
      resources: [{ kind: "file", file: new File(["notes"], "notes.txt") }],
    });

    expect(
      composer.capture({ ...input, target: null }, submitted, host, {
        ...source,
        read: () => drafts.read(source.key),
      })
    ).toBe(true);
    drafts.write(source.key, following);
    const reloadedDrafts = new ComposerDrafts(storage, null);
    const reloaded = new HomeComposer(reloadedDrafts);
    reloaded.recoverDraft(
      reloaded.draftFor("another-project").key,
      () => false
    );
    expect(reloaded.read().outgoing).toBeNull();
    reloaded.recoverDraft(source.key, () => false);
    expect(reloaded.read()).toMatchObject({
      attachments: [],
      outgoing: { status: "failed", retryable: false, handedOff: false },
    });
    expect(reloadedDrafts.read(source.key)).toEqual(following);
    reloaded.retryCaptured(host);
    expect(host.stash).not.toHaveBeenCalled();
    const editor = vi.fn<(document: unknown) => boolean>(() => false);
    expect(await reloaded.restoreCaptured(editor)).toBe(false);
    expect(editor).toHaveBeenCalledExactlyOnceWith(submitted);
    expect(reloadedDrafts.read(source.key)).toEqual(following);

    resolving.resolve(null);
    await vi.waitFor(() => expect(composer.read().busy).toBe(false));
  });

  it.each([false, true])(
    "refuses capture when storage rejects recovery, with prior autosave: %s",
    (saved) => {
      const storage = memoryStorage();
      const drafts = new ComposerDrafts(storage, null);
      const composer = new HomeComposer(drafts);
      const source = composer.draftFor(workspace.id);
      const document = { text: input.text };
      if (saved) drafts.write(source.key, document);
      vi.spyOn(storage, "setItem").mockImplementation(() => {
        throw new Error("storage full");
      });
      const { host } = setup();
      expect(() =>
        composer.capture(input, document, host, {
          ...source,
          read: () => document,
        })
      ).toThrow("Couldn't keep your message for recovery");
      expect(composer.read().outgoing).toBeNull();
      expect(host.stash).not.toHaveBeenCalled();
      expect(composer.read().busy).toBe(false);
      expect(new ComposerDrafts(storage, null).read(source.key)).toEqual(
        saved ? document : null
      );
    }
  );

  it("exposes only opening status on Home and hands the whole message to the workspace", async () => {
    const { composer, drafts, host } = setup();
    const target = Promise.withResolvers<Workspace>();
    vi.mocked(host.defaultWorkspace).mockReturnValue(target.promise);
    const first = new File(["notes"], "notes.txt");
    const second = new File(["image"], "photo.png", { type: "image/png" });
    composer.transfer({ resources: [{ kind: "file", file: first }] });
    composer.transfer({ resources: [{ kind: "file", file: second }] });
    const source = composer.draftFor(workspace.id);
    const submitted = { text: input.text };
    const following = { text: "The next draft is separate" };
    drafts.write(source.key, submitted);

    expect(
      composer.capture({ ...input, target: null }, submitted, host, {
        ...source,
        read: () => drafts.read(source.key),
      })
    ).toBe(true);
    drafts.write(source.key, following);
    expect(composer.read()).toMatchObject({
      attachments: [],
      busy: true,
    });
    expect(composer.read().outgoing).toEqual({ status: "opening" });
    expect(host.open).not.toHaveBeenCalled();
    target.resolve(workspace);
    await vi.waitFor(() =>
      expect(host.open).toHaveBeenCalledExactlyOnceWith(workspace)
    );
    expect(host.stash).toHaveBeenCalledExactlyOnceWith(
      workspace.id,
      expect.objectContaining({
        text: input.text,
        attachments: [
          { kind: "file", file: first },
          { kind: "file", file: second },
        ],
        requestId: expect.any(String),
      })
    );
    const handedOff = vi.mocked(host.stash).mock.calls[0][1];
    handedOff.transferNextDraft?.({ store: drafts, key: "workspace:draft" });
    expect(drafts.read("workspace:draft")).toEqual(following);
    expect(await drafts.readAttachmentBatch(HomeComposer.key)).toBeNull();
  });

  it("recovers a refused rich request only when the editor accepts its exact document", async () => {
    const { composer, host } = setup();
    vi.mocked(host.stash).mockReturnValue(false);
    const file = new File(["notes"], "notes.txt");
    composer.transfer({ resources: [{ kind: "file", file }] });
    const rich = {
      type: "doc",
      content: [{ type: "mention", attrs: { path: "brief.md" } }],
    };
    expect(composer.capture(input, rich, host)).toBe(true);
    await vi.waitFor(() =>
      expect(composer.read().outgoing).toEqual({
        status: "failed",
        error: "Couldn't keep your message for the workspace.",
        retryable: true,
        handedOff: false,
      })
    );
    const occupied = vi.fn<(document: unknown) => boolean>(() => false);
    expect(await composer.restoreCaptured(occupied)).toBe(false);
    expect(occupied).toHaveBeenCalledExactlyOnceWith(rich);
    expect(composer.read().attachments).toEqual([]);

    const empty = vi.fn<(document: unknown) => boolean>(() => true);
    expect(await composer.restoreCaptured(empty)).toBe(true);
    expect(empty).toHaveBeenCalledExactlyOnceWith(rich);
    expect(composer.read().outgoing).toBeNull();
    expect(composer.read().attachments[0]?.input).toMatchObject({ file });
  });

  it("retries the same captured Home request and moves only the latest next draft once", async () => {
    const { composer, drafts, host } = setup();
    const source = composer.draftFor(workspace.id);
    vi.mocked(host.stash).mockReturnValueOnce(false);
    expect(
      composer.capture(input, { text: input.text }, host, {
        ...source,
        read: () => drafts.read(source.key),
      })
    ).toBe(true);
    await vi.waitFor(() =>
      expect(composer.read().outgoing).toMatchObject({ status: "failed" })
    );
    composer.retryCaptured(host);
    await vi.waitFor(() => expect(host.open).toHaveBeenCalledOnce());
    const [first, second] = vi.mocked(host.stash).mock.calls;
    expect(second).toEqual(first);

    const destination = new ComposerDrafts(null, null);
    const transfer = second[1].transferNextDraft!;
    drafts.write(source.key, { text: "Last edit before navigation" });
    transfer({ store: destination, key: "target" });
    expect(destination.read("target")).toEqual({
      text: "Last edit before navigation",
    });
    expect(drafts.read(source.key)).toBeNull();
    drafts.write(source.key, { text: "Later independent draft" });
    transfer({ store: destination, key: "another target" });
    expect(destination.read("another target")).toBeNull();
    expect(drafts.read(source.key)).toEqual({
      text: "Later independent draft",
    });
  });

  it("defaults new chats to Auto without preparing access on Home", async () => {
    const { composer, host } = setup();
    composer.connectAutomaticReview(async () => true, true);
    await vi.waitFor(() =>
      expect(composer.read().permissionMode).toBe("approve_for_me")
    );
    await composer.submit(input, host);
    expect(vi.mocked(host.stash).mock.calls[0][1]).not.toHaveProperty(
      "preparedSessionId"
    );
    expect(vi.mocked(host.stash).mock.calls[0][1]).not.toHaveProperty(
      "manualApproval"
    );
  });

  it("does not carry the submitted document as a next draft after Home unmounts", async () => {
    const { composer, drafts, host } = setup();
    const source = composer.draftFor(workspace.id);
    const submitted = { text: input.text };
    drafts.write(source.key, submitted);
    let mountedDocument: unknown;
    expect(
      composer.capture(input, submitted, host, {
        ...source,
        read: () => mountedDocument,
      })
    ).toBe(true);
    await vi.waitFor(() => expect(host.open).toHaveBeenCalledOnce());
    const target = new ComposerDrafts(null, null);
    const transfer = vi.mocked(host.stash).mock.calls[0][1].transferNextDraft!;
    transfer({ store: target, key: "destination" });
    expect(target.read("destination")).toBeNull();

    mountedDocument = { text: input.text };
    transfer({ store: target, key: "destination" });
    expect(target.read("destination")).toEqual(mountedDocument);
  });

  it("retries only navigation once the workspace already owns the first message", async () => {
    const { composer, host } = setup();
    const source = composer.draftFor(workspace.id);
    vi.mocked(host.open).mockImplementationOnce(() => {
      throw new Error("Workspace navigation interrupted");
    });
    expect(
      composer.capture(input, { text: input.text }, host, {
        ...source,
        read: () => null,
      })
    ).toBe(true);
    await vi.waitFor(() =>
      expect(composer.read().outgoing).toMatchObject({
        status: "failed",
        error: "Workspace navigation interrupted",
        handedOff: true,
      })
    );
    expect(await composer.restoreCaptured(() => true)).toBe(false);
    composer.discardCaptured();
    expect(composer.read().outgoing).toMatchObject({ handedOff: true });
    composer.retryCaptured(host);
    await vi.waitFor(() => expect(host.open).toHaveBeenCalledTimes(2));
    expect(host.stash).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "restores the exact follow-up across a renderer reload with a later Home edit: %s",
    async (editedHomeAgain) => {
      const storage = memoryStorage();
      const drafts = new ComposerDrafts(storage, null);
      const composer = new HomeComposer(drafts);
      const session = memoryStorage();
      const { host } = setup();
      const { welcome_message } = await import("@/lib/desktop/welcome-message");
      vi.mocked(host.stash).mockImplementation((id, message) =>
        welcome_message.stash(id, message, session)
      );
      const source = composer.draftFor(workspace.id);
      const first = {
        type: "doc",
        content: [{ type: "text", text: input.text }],
      };
      drafts.write(source.key, first);
      expect(
        composer.capture(input, first, host, {
          ...source,
          read: () => undefined,
        })
      ).toBe(true);
      // The submitted text has rotated before the editor's first autosave.
      expect(drafts.read(source.key)).toBeNull();
      await vi.waitFor(() => expect(host.open).toHaveBeenCalledOnce());
      // The person intentionally types the very same message again after push.
      const next = structuredClone(first);
      source.onWrite(next, drafts.write(source.key, next));

      const later = new ComposerDrafts(storage, null);
      if (editedHomeAgain) later.write(source.key, structuredClone(first));
      // Loading the module again drops every closure owned by the old Home.
      vi.resetModules();
      const { welcome_message: reloaded } =
        await import("@/lib/desktop/welcome-message");
      const pending = reloaded.pending(workspace.id, session)!;
      const destination = new ComposerDrafts(storage, null);
      const transfer = pending.peek()!.transferNextDraft!;
      transfer({ store: destination, key: "workspace:new" });
      expect(destination.read("workspace:new")).toEqual(next);
      expect(destination.read(source.key)).toEqual(
        editedHomeAgain ? first : null
      );
      transfer({ store: destination, key: "workspace:another" });
      expect(destination.read("workspace:another")).toBeNull();
      pending.take()?.commit?.();
    }
  );

  it("flushes the last keystroke when navigation unmounts Home before its editor autosaves", async () => {
    const { composer, drafts, host } = setup();
    const source = composer.draftFor(workspace.id);
    let live: unknown = null;
    expect(
      composer.capture(input, { text: input.text }, host, {
        ...source,
        read: () => live,
      })
    ).toBe(true);
    await vi.waitFor(() => expect(host.open).toHaveBeenCalledOnce());
    live = { text: "The last keystroke" };
    composer.flushNextDraft();
    live = undefined;
    const transfer = vi.mocked(host.stash).mock.calls[0][1].transferNextDraft!;
    const destination = new ComposerDrafts(null, null);
    transfer({ store: destination, key: "workspace:new" });
    expect(destination.read("workspace:new")).toEqual({
      text: "The last keystroke",
    });
    expect(drafts.read(source.key)).toBeNull();
    live = { text: "A stale editor during cleanup" };
    composer.flushNextDraft();
    expect(drafts.read(source.key)).toBeNull();
  });

  it("moves the old Home follow-up without overwriting a newer Home visit during cleanup", async () => {
    const disk = memoryStorage();
    const home = new HomeComposer(new ComposerDrafts(disk, null));
    const source = home.draftFor(workspace.id);
    const { host } = setup();
    let live: unknown = null;
    expect(
      home.capture(input, { text: input.text }, host, {
        ...source,
        read: () => live,
      })
    ).toBe(true);
    await vi.waitFor(() => expect(host.open).toHaveBeenCalledOnce());
    live = { text: "First follow-up" };
    source.onWrite(live, source.store.write(source.key, live));
    const newer = { text: "Started in a separate Home visit" };
    new ComposerDrafts(disk, null).write(source.key, newer);
    live = { text: "Last edit from the first visit" };
    home.flushNextDraft();

    const target = new ComposerDrafts(disk, null);
    vi.mocked(host.stash).mock.calls[0][1].transferNextDraft!({
      store: target,
      key: "workspace:new",
    });
    expect(target.read("workspace:new")).toEqual(live);
    expect(new ComposerDrafts(disk, null).read(source.key)).toEqual(newer);
  });

  it.each([false, true])(
    "keeps an occupied workspace draft and retires the follow-up copy, with later Home edits: %s",
    async (editedHomeAgain) => {
      const disk = memoryStorage();
      const home = new HomeComposer(new ComposerDrafts(disk, null));
      const source = home.draftFor(workspace.id);
      const { host } = setup();
      let live: unknown = null;
      expect(
        home.capture(input, { text: input.text }, host, {
          ...source,
          read: () => live,
        })
      ).toBe(true);
      await vi.waitFor(() => expect(host.open).toHaveBeenCalledOnce());
      live = { text: "The next message" };
      home.flushNextDraft();
      const target = new ComposerDrafts(disk, null);
      target.write("workspace:new", null);
      new ComposerDrafts(disk, null).write("workspace:new", {
        text: "Already writing here",
      });
      const request = vi.mocked(host.stash).mock.calls[0][1];
      const key = `desktop-home:followup:${request.requestId}`;
      expect(new ComposerDrafts(disk, null).read(key)).toBeTruthy();
      const latest = editedHomeAgain
        ? { text: "Independent Home draft" }
        : live;
      if (editedHomeAgain)
        new ComposerDrafts(disk, null).write(source.key, latest);
      request.transferNextDraft!({ store: target, key: "workspace:new" });
      home.flushNextDraft();
      request.transferNextDraft!({ store: target, key: "another" });
      const restored = new ComposerDrafts(disk, null);
      expect(restored.read("workspace:new")).toEqual({
        text: "Already writing here",
      });
      expect(restored.read(source.key)).toEqual(latest);
      expect(restored.read(key)).toBeNull();
      expect(restored.read("another")).toBeNull();
    }
  );

  it("keeps the durable Home follow-up if the target store cannot persist its copy", async () => {
    const disk = memoryStorage();
    const home = new HomeComposer(new ComposerDrafts(disk, null));
    const source = home.draftFor(workspace.id);
    const { host } = setup();
    const next = { text: "Keep for after reload" };
    expect(
      home.capture(input, { text: input.text }, host, {
        ...source,
        read: () => undefined,
      })
    ).toBe(true);
    await vi.waitFor(() => expect(host.open).toHaveBeenCalledOnce());
    source.onWrite(next, source.store.write(source.key, next));
    const target = new ComposerDrafts(null, null);
    vi.mocked(host.stash).mock.calls[0][1].transferNextDraft!({
      store: target,
      key: "new",
    });
    expect(target.read("new")).toEqual(next);
    expect(new ComposerDrafts(disk, null).read(source.key)).toEqual(next);
  });

  it("carries Ask for approval to the first chat and preserves it when Full access is canceled", async () => {
    const { composer, host } = setup();
    const { access } = fullAccess();
    const destination = { workspace, defaultWorkspace: host.defaultWorkspace };
    composer.connectAutomaticReview(async () => true, true);
    await vi.waitFor(() =>
      expect(composer.read().permissionMode).toBe("approve_for_me")
    );
    composer.selectPermissionMode("restricted", destination, access);
    composer.selectPermissionMode("full_access", destination, access);
    composer.answerPermissionReview(false);
    expect(composer.read().permissionMode).toBe("restricted");
    await composer.submit(input, host);
    expect(host.stash).toHaveBeenCalledWith(
      workspace.id,
      expect.objectContaining({ manualApproval: true })
    );
    expect(composer.read().permissionMode).toBe("approve_for_me");
  });

  it("retries automatic review discovery after an early admission rejection", async () => {
    const { composer } = setup();
    const probe = vi.fn<() => Promise<boolean>>();
    probe.mockRejectedValueOnce(new Error("forbidden"));
    probe.mockResolvedValueOnce(true);
    composer.connectAutomaticReview(probe);
    await Promise.resolve();
    expect(composer.read().automaticReviewAvailable).toBe(false);
    composer.refreshAutomaticReview();
    await vi.waitFor(() =>
      expect(composer.read().automaticReviewAvailable).toBe(true)
    );
    expect(composer.read().permissionMode).toBe("restricted");
  });

  it("hands off the selected speed to the exact prepared chat", async () => {
    const { composer, host } = setup();
    const { access, review, prepared } = fullAccess();
    composer.connectTurnCapabilities(
      workspace.id,
      prepared.profileId,
      async () => fastPreview
    );
    await composer.refreshTurnCapabilities();
    composer.selectSpeed("fast");
    composer.selectPermissionMode(
      "approve_for_me",
      { workspace, defaultWorkspace: host.defaultWorkspace },
      { ...access, prepareAutomatic: async () => review }
    );
    await vi.waitFor(() =>
      expect(composer.read().permissionMode).toBe("approve_for_me")
    );
    await composer.submit({ ...input, profileId: prepared.profileId }, host);
    expect(access.start).toHaveBeenCalledWith(review.reviewId, {
      workspaceId: workspace.id,
      profileId: prepared.profileId,
      speed: "fast",
    });
    expect(host.stash).toHaveBeenCalledWith(
      workspace.id,
      expect.objectContaining({
        preparedSessionId: prepared.sessionId,
        turnOptions: {
          profileId: prepared.profileId,
          modelId: fastPreview.modelId,
          speed: "fast",
        },
      })
    );
  });

  it("ignores a stale capability read and clears speed when the intended route changes", async () => {
    const { composer, host } = setup();
    const read = vi
      .fn<HomeComposer.CapabilityRead>()
      .mockResolvedValue(fastPreview);
    composer.connectTurnCapabilities(workspace.id, null, read);
    await composer.refreshTurnCapabilities();
    composer.selectSpeed("fast");
    const stale = Promise.withResolvers<HomeComposer.CapabilityPreview>();
    read.mockReturnValueOnce(stale.promise);
    const previous = composer.refreshTurnCapabilities();
    const unsupported = {
      ...fastPreview,
      profileId: null,
      modelId: "local",
      status: "unsupported",
      speeds: [],
      webSearch: false,
    } as const;
    composer.connectTurnCapabilities("default", null, async () => unsupported);
    await composer.refreshTurnCapabilities();
    stale.resolve(fastPreview);
    await previous;
    expect(composer.read()).toMatchObject({
      turnCapabilities: unsupported,
      speed: undefined,
    });
    await composer.submit({ ...input, target: null }, host);
    expect(vi.mocked(host.stash).mock.calls[0][1]).not.toHaveProperty(
      "turnOptions"
    );
  });

  it("keeps the draft if the default project changes before sending chosen turn options", async () => {
    const { composer, host } = setup();
    composer.connectTurnCapabilities(
      workspace.id,
      null,
      async () => fastPreview
    );
    await composer.refreshTurnCapabilities();
    composer.selectSpeed("fast");
    await expect(
      composer.submit({ ...input, target: null }, host)
    ).rejects.toThrow(
      "Choose the message options again for this project and model."
    );
    expect(host.stash).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
    expect(composer.read().speed).toBe("fast");
  });

  it("stages a supported speed for the default connection", async () => {
    const { composer, host } = setup();
    composer.connectTurnCapabilities(
      workspace.id,
      null,
      async () => fastPreview
    );
    await composer.refreshTurnCapabilities();
    expect(composer.read().speed).toBeUndefined();
    composer.selectSpeed("fast");
    await composer.submit(input, host);
    expect(vi.mocked(host.stash).mock.calls[0][1].turnOptions).toEqual({
      profileId: fastPreview.profileId,
      modelId: fastPreview.modelId,
      speed: "fast",
    });
  });

  it("hands off a request to search the web as an ordinary message", async () => {
    const { composer, host } = setup();
    composer.connectTurnCapabilities(
      workspace.id,
      null,
      async () => fastPreview
    );
    await composer.refreshTurnCapabilities();
    const text = "Search the web for the forecast in Seoul.";
    await composer.submit({ ...input, text, prompt: text }, host);
    const message = vi.mocked(host.stash).mock.calls[0][1];
    expect(message.text).toBe(text);
    expect(message).not.toHaveProperty("turnOptions");
  });

  it("inherits saved effort without overriding the person's explicit choice", () => {
    const { composer } = setup();
    composer.initializeEffort("high");
    expect(composer.read().effort).toBe("high");
    composer.selectEffort("low");
    composer.initializeEffort("xhigh");
    expect(composer.read().effort).toBe("low");
  });

  it("keeps the host default when the model catalog has not loaded yet", async () => {
    const { composer, host } = setup();
    await composer.submit(input, host);
    expect(vi.mocked(host.stash).mock.calls[0][1]).not.toHaveProperty("effort");
  });

  it.each(["Make a pitch", ""])(
    "copies a slides template and keeps its instructions separate from the request (%j)",
    async (text) => {
      const { composer, host } = setup();
      const copyTemplate = vi.fn<HomeComposer.Template["copy"]>(async () => ({
        title: "Pitch",
        slides: 4,
        path: "pitch 2.canvas",
      }));
      await composer.submit(
        {
          ...input,
          text,
          prompt: ApplicationPreset.prompt("slides", text),
          references: [{ title: "Reference", url: "https://example.test/ref" }],
          template: { name: "pitch", copy: copyTemplate },
        },
        host
      );
      expect(copyTemplate).toHaveBeenCalledWith("chosen");
      expect(host.defaultWorkspace).not.toHaveBeenCalled();
      expect(host.stash).toHaveBeenCalledWith(
        "chosen",
        expect.objectContaining({
          text,
          initialWorkbenchPath: "pitch 2.canvas",
          messageContext: {
            modelText: expect.stringContaining(
              '"pitch 2.canvas". Edit that deck and keep its visual system.'
            ),
            displayParts: [
              {
                kind: "slides.template",
                version: 1,
                data: { title: "Pitch", slides: 4 },
              },
            ],
          },
        })
      );
      expect(host.open).toHaveBeenCalledWith(workspace);
    }
  );

  it.each(["goal", "file", "directory"] as const)(
    "keeps a template draft that requires text before copying the deck (%s)",
    async (kind) => {
      const { composer, host } = setup();
      if (kind === "goal") composer.selectGoal(true);
      else
        composer.transfer({
          resources: [{ kind, file: new File(["content"], "notes.txt") }],
        });
      const copyTemplate = vi.fn<HomeComposer.Template["copy"]>();
      await expect(
        composer.submit(
          {
            ...input,
            text: "",
            template: { name: "pitch", copy: copyTemplate },
          },
          host
        )
      ).rejects.toThrow(
        kind === "goal" ? "Write an objective" : "Write a message"
      );
      expect(copyTemplate).not.toHaveBeenCalled();
      expect(host.stash).not.toHaveBeenCalled();
      expect(host.open).not.toHaveBeenCalled();
      expect(composer.read().busy).toBe(false);
    }
  );

  it("carries automatic review into the exact prepared workspace chat", async () => {
    const { composer, host } = setup();
    const { access, review, prepared } = fullAccess();
    const prepareAutomatic = vi.fn<
      NonNullable<HomeComposer.AccessHost["prepareAutomatic"]>
    >(async () => review);
    composer.selectPermissionMode(
      "approve_for_me",
      { workspace, defaultWorkspace: host.defaultWorkspace },
      { ...access, prepareAutomatic }
    );
    await vi.waitFor(() =>
      expect(composer.read().permissionMode).toBe("approve_for_me")
    );
    expect(access.prepare).not.toHaveBeenCalled();
    expect(composer.read().permissionReview).toBeNull();
    await composer.submit({ ...input, profileId: prepared.profileId }, host);
    expect(vi.mocked(host.stash).mock.calls[0][1]).toMatchObject({
      preparedSessionId: prepared.sessionId,
      preparedMode: "approve_for_me",
    });
  });

  it("opens the review immediately and uses the current model and effort on Send", async () => {
    const { composer, host } = setup();
    const { access, review, prepared } = fullAccess();
    const applied = Promise.withResolvers<typeof prepared>();
    const preparing = Promise.withResolvers<typeof review>();
    access.prepare.mockReturnValueOnce(preparing.promise);
    access.start.mockReturnValueOnce(applied.promise);
    const file = new File(["original"], "reference.png", { type: "image/png" });
    composer.transfer({ resources: [{ kind: "file", file }] });
    composer.selectPlan(true);
    composer.selectPermissionMode(
      "full_access",
      { workspace, defaultWorkspace: host.defaultWorkspace },
      access
    );
    expect(composer.read().permissionReview?.workspaceName).toBe(
      workspace.name
    );
    expect(access.prepare).toHaveBeenCalledExactlyOnceWith(workspace.id);
    composer.answerPermissionReview(true);
    expect(composer.read().permissionReview).toBeNull();
    expect(access.answer).not.toHaveBeenCalled();
    preparing.resolve(review);
    await vi.waitFor(() =>
      expect(composer.read().permissionMode).toBe("full_access")
    );
    expect(access.answer).toHaveBeenCalledExactlyOnceWith(
      review.reviewId,
      true
    );
    expect(access.start).not.toHaveBeenCalled();
    expect(host.stash).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
    composer.selectEffort("high");
    const submitting = composer.submit(
      { ...input, profileId: prepared.profileId },
      host
    );
    await vi.waitFor(() =>
      expect(access.start).toHaveBeenCalledExactlyOnceWith(review.reviewId, {
        workspaceId: "chosen",
        profileId: prepared.profileId,
        effort: "high",
      })
    );
    expect(composer.read().permissionReview).toBeNull();
    expect(host.open).not.toHaveBeenCalled();
    applied.resolve(prepared);
    await submitting;
    const request = vi.mocked(host.stash).mock.calls[0][1];
    expect(request).toMatchObject({
      profileId: prepared.profileId,
      preparedSessionId: prepared.sessionId,
      operatingRegime: "plan",
      attachment: { kind: "file" },
    });
    expect(request).not.toHaveProperty("effort");
    expect(request.attachment?.file).toBe(file);
    expect(composer.read().attachments).toEqual([]);
    expect(composer.read().plan).toBe(false);
    expect(composer.read().permissionMode).toBe("restricted");
  });

  it("retries a Full access template draft using the same deck and prepared chat", async () => {
    const { composer, host } = setup();
    const { access, prepared } = fullAccess();
    const copy = vi
      .fn<HomeComposer.Template["copy"]>(async () => ({
        title: "Pitch",
        slides: 4,
        path: "pitch.canvas",
      }))
      .mockRejectedValueOnce(new Error("Couldn't copy the deck"));
    const request = { ...input, template: { name: "pitch", copy } };
    vi.mocked(host.stash).mockReturnValueOnce(false);
    composer.selectEffort("low");
    composer.selectPermissionMode(
      "full_access",
      { workspace, defaultWorkspace: host.defaultWorkspace },
      access
    );
    composer.answerPermissionReview(true);
    await vi.waitFor(() =>
      expect(composer.read().permissionMode).toBe("full_access")
    );

    await expect(composer.submit(request, host)).rejects.toThrow(
      "Couldn't copy the deck"
    );
    expect(access.start).not.toHaveBeenCalled();
    expect(host.stash).not.toHaveBeenCalled();
    expect(composer.read().permissionMode).toBe("full_access");

    await expect(composer.submit(request, host)).rejects.toThrow(
      "Couldn't keep"
    );
    expect(access.start).toHaveBeenCalledOnce();
    expect(composer.read().permissionMode).toBe("full_access");
    expect(host.open).not.toHaveBeenCalled();

    composer.selectEffort("high");
    await expect(composer.submit(request, host)).rejects.toThrow(
      "Restore the model and effort"
    );
    composer.selectEffort("low");
    await composer.submit(request, host);
    const handoffs = vi.mocked(host.stash).mock.calls;
    expect(handoffs).toHaveLength(2);
    expect(handoffs[1]).toEqual(handoffs[0]);
    expect(handoffs[1][1].preparedSessionId).toBe(prepared.sessionId);
    expect(copy).toHaveBeenCalledTimes(2);
    expect(access.start).toHaveBeenCalledOnce();
    expect(host.open).toHaveBeenCalledExactlyOnceWith(workspace);
  });

  it.each([false, true])(
    "retries the same approved chat after the default effort arrives (unverified grant: %s)",
    async (unverified) => {
      const { composer, host } = setup();
      const { access, prepared } = fullAccess();
      if (unverified)
        access.start.mockRejectedValueOnce(
          new Error("native_chat_permission_mode_unverified")
        );
      else vi.mocked(host.stash).mockReturnValueOnce(false);
      composer.selectPermissionMode(
        "full_access",
        { workspace, defaultWorkspace: host.defaultWorkspace },
        access
      );
      composer.answerPermissionReview(true);
      await vi.waitFor(() =>
        expect(composer.read().permissionMode).toBe("full_access")
      );
      await expect(composer.submit(input, host)).rejects.toThrow(
        unverified ? "Send again to check the same chat" : "Couldn't keep"
      );
      expect(host.open).not.toHaveBeenCalled();
      composer.initializeEffort("medium");
      await composer.submit(input, host);
      expect(access.start).toHaveBeenCalledTimes(unverified ? 2 : 1);
      expect(access.start.mock.calls[0][1]).not.toHaveProperty("effort");
      if (unverified)
        expect(access.start.mock.calls[1]).toEqual(access.start.mock.calls[0]);
      expect(host.stash).toHaveBeenLastCalledWith(
        workspace.id,
        expect.objectContaining({ preparedSessionId: prepared.sessionId })
      );
      expect(host.open).toHaveBeenCalledExactlyOnceWith(workspace);
    }
  );

  it("cancels immediately while Main is still preparing the review", async () => {
    const { composer, drafts, host } = setup();
    const { access, review } = fullAccess();
    const preparing = Promise.withResolvers<typeof review>();
    access.prepare.mockReturnValueOnce(preparing.promise);
    drafts.write(HomeComposer.key, { text: "unsent" });
    composer.selectPlan(true);
    composer.selectPermissionMode(
      "full_access",
      { workspace, defaultWorkspace: host.defaultWorkspace },
      access
    );
    composer.answerPermissionReview(false);
    expect(composer.read()).toMatchObject({
      busy: false,
      plan: true,
      permissionBusy: false,
      permissionMode: "restricted",
      permissionReview: null,
    });
    preparing.resolve(review);
    await vi.waitFor(() =>
      expect(access.answer).toHaveBeenCalledExactlyOnceWith(
        review.reviewId,
        false
      )
    );
    expect(access.start).not.toHaveBeenCalled();
    expect(host.stash).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
    expect(drafts.read(HomeComposer.key)).toEqual({ text: "unsent" });
  });

  it("refuses to use a Home approval for a different destination", async () => {
    const { composer, host } = setup();
    const { access, review } = fullAccess();
    composer.selectPermissionMode(
      "full_access",
      { workspace, defaultWorkspace: host.defaultWorkspace },
      access
    );
    composer.answerPermissionReview(true);
    await vi.waitFor(() =>
      expect(composer.read().permissionMode).toBe("full_access")
    );
    await expect(
      composer.submit({ ...input, target: { ...workspace, id: "other" } }, host)
    ).rejects.toThrow("Choose Full access again");
    expect(access.answer).toHaveBeenLastCalledWith(review.reviewId, false);
    expect(access.start).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
    expect(composer.read().permissionMode).toBe("restricted");
  });

  it("hands off the Workflows request to the chosen workspace under Default access", async () => {
    const { composer, host } = setup();
    const text = "Resize every image in an input folder.";
    const messageContext = workflowMessageContext([]);
    await composer.submit(
      {
        ...input,
        text,
        prompt: ApplicationPreset.prompt("workflows", text),
        messageContext,
      },
      host
    );

    expect(host.stash).toHaveBeenCalledWith("chosen", {
      text,
      messageContext,
      profileId: null,
      operatingRegime: "act",
      goal: false,
    });
    expect(messageContext.modelText).toContain("<reminder>Use Grida FX");
    expect(messageContext.displayParts).toEqual([]);
    expect(host.open).toHaveBeenCalledWith(workspace);
  });

  it("starts a normal chat from a workflow reference alone", async () => {
    const { composer, host } = setup();
    const messageContext = workflowMessageContext([
      {
        number: 1,
        title: "Pet",
        showcaseUrl: "https://grida.co/fx/workflows/pet",
        sourceUrl: "https://github.com/gridaco/fx/tree/main/examples/pet",
        templateId: "pet",
      },
    ]);
    await composer.submit(
      {
        ...input,
        text: "",
        prompt: "",
        messageContext,
      },
      host
    );
    expect(host.stash).toHaveBeenCalledExactlyOnceWith("chosen", {
      text: "",
      messageContext,
      profileId: null,
      operatingRegime: "act",
      goal: false,
    });
    expect(host.open).toHaveBeenCalledExactlyOnceWith(workspace);
  });

  it.each(["  Use the second image's palette.  ", ""])(
    "hands off selected Library images beside the unmodified request (%j)",
    async (text) => {
      const { composer, host } = setup();
      const references = ["Palette", "Lighting"].map((title, index) => ({
        id: String(index),
        title,
        url: `https://library.grida.co/${title}.png`,
      }));
      const messageContext = imagesMessageContext(references);
      await composer.submit(
        {
          ...input,
          text,
          prompt: ApplicationPreset.prompt("image", text),
          messageContext,
        },
        host
      );
      expect(host.stash).toHaveBeenCalledExactlyOnceWith("chosen", {
        text,
        messageContext,
        profileId: null,
        operatingRegime: "act",
        goal: false,
      });
      expect(host.open).toHaveBeenCalledExactlyOnceWith(workspace);
    }
  );

  it("hands off an Images prompt with guidance and no references", async () => {
    const { composer, host } = setup();
    const messageContext = imagesMessageContext([]);
    await composer.submit({ ...input, messageContext }, host);
    expect(host.stash).toHaveBeenCalledWith(
      "chosen",
      expect.objectContaining({ text: input.text, messageContext })
    );
    expect(messageContext.modelText).toContain(
      "<reminder>Create an image for this request.</reminder>"
    );
    expect(messageContext.displayParts).toEqual([]);
  });

  it.each([
    { kind: "file", messageContext: imagesMessageContext([]) },
    { kind: "directory", messageContext: workflowMessageContext([]) },
  ] as const)(
    "keeps a $kind attachment on Home when preset context requires authored text",
    async ({ kind, messageContext }) => {
      const { composer, host } = setup();
      const file = new File(["content"], "notes.txt");
      composer.transfer({ resources: [{ kind, file }] });
      await expect(
        composer.submit({ ...input, text: "  ", messageContext }, host)
      ).rejects.toThrow("Write a message");
      expect(host.stash).not.toHaveBeenCalled();
      expect(host.open).not.toHaveBeenCalled();
      expect(composer.read().attachments[0]?.input).toMatchObject({ file });
    }
  );

  it("hands off a raster attachment and preset context with no authored text", async () => {
    const { composer, host } = setup();
    const file = new File(["image"], "reference.png", {
      type: "application/octet-stream",
    });
    const messageContext = imagesMessageContext([]);
    composer.transfer({ resources: [{ kind: "file", file }] });
    await composer.submit({ ...input, text: "", messageContext }, host);
    expect(host.stash).toHaveBeenCalledExactlyOnceWith(
      workspace.id,
      expect.objectContaining({
        text: "",
        messageContext,
        attachment: { kind: "file", file },
      })
    );
    expect(host.open).toHaveBeenCalledExactlyOnceWith(workspace);
  });

  it("keeps the draft when the selected references exceed the context limit", async () => {
    const { composer, drafts, host } = setup();
    drafts.write(HomeComposer.key, { text: input.text });
    const messageContext = imagesMessageContext([
      {
        id: "long",
        title: "x".repeat(17 * 1024),
        url: "https://library.grida.co/long.png",
      },
    ]);
    await expect(
      composer.submit({ ...input, target: null, messageContext }, host)
    ).rejects.toThrow("Remove some and try again.");
    expect(host.defaultWorkspace).not.toHaveBeenCalled();
    expect(host.stash).not.toHaveBeenCalled();
    expect(host.open).not.toHaveBeenCalled();
    expect(drafts.read(HomeComposer.key)).toEqual({ text: input.text });
  });

  it.each(["slides", "workflows", "image"] as const)(
    "opens an empty %s composer without starting work",
    async (preset) => {
      const { composer, host } = setup();
      composer.selectGoal(true);
      await composer.submit(
        {
          ...input,
          target: null,
          text: "",
          prompt: ApplicationPreset.prompt(preset, ""),
          ...(preset === "workflows" && {
            messageContext: workflowMessageContext([]),
          }),
          ...(preset === "image" && {
            messageContext: imagesMessageContext([]),
          }),
        },
        host
      );
      expect(host.defaultWorkspace).toHaveBeenCalledOnce();
      expect(host.stash).not.toHaveBeenCalled();
      expect(host.open).toHaveBeenCalledOnce();
    }
  );

  it("allows image-only requests and sends Goal intent for text requests", async () => {
    const { composer, host } = setup();
    composer.transfer({
      resources: [{ kind: "file", file: new File(["image"], "x.png") }],
    });
    await composer.submit({ ...input, text: "", prompt: "" }, host);
    expect(host.stash).toHaveBeenCalledWith(
      "chosen",
      expect.objectContaining({
        text: "Inspect the attached file.",
        attachment: expect.anything(),
      })
    );
    const next = setup().composer;
    next.selectGoal(true);
    await next.submit(input, host);
    expect(host.stash).toHaveBeenLastCalledWith(
      "chosen",
      expect.objectContaining({ goal: true })
    );
  });

  it("retains the draft and staged intent if handoff storage fails", async () => {
    const { composer, drafts, host } = setup();
    drafts.write(HomeComposer.key, { text: "unsent" });
    composer.selectPlan(true);
    const file = new File(["file"], "a.txt");
    composer.transfer({ resources: [{ kind: "file", file }] });
    vi.mocked(host.stash).mockReturnValue(false);
    await expect(composer.submit(input, host)).rejects.toThrow("Couldn't keep");
    expect(host.open).not.toHaveBeenCalled();
    expect(composer.read()).toMatchObject({
      busy: false,
      plan: true,
      attachments: [{ input: { file } }],
    });
    expect(drafts.read(HomeComposer.key)).toEqual({ text: "unsent" });
  });

  it("does not open twice while template preparation waits", async () => {
    const { composer, host } = setup();
    let finish!: (value: {
      title: string;
      slides: number;
      path: string;
    }) => void;
    const copyTemplate = () =>
      new Promise<{ title: string; slides: number; path: string }>(
        (resolve) => {
          finish = resolve;
        }
      );
    const first = composer.submit(
      { ...input, template: { name: "pitch", copy: copyTemplate } },
      host
    );
    await expect(composer.submit(input, host)).rejects.toThrow(
      "already opening"
    );
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    finish({ title: "Pitch", slides: 4, path: "pitch.canvas" });
    await first;
    expect(host.open).toHaveBeenCalledOnce();
    expect(host.stash).toHaveBeenCalledOnce();
    await expect(composer.submit(input, host)).rejects.toThrow(
      "already opening"
    );
  });

  it("appends attachments in gesture order and removes only the selected card", () => {
    const { composer } = setup();
    const file = new File(["text"], "a.txt");
    composer.selectGoal(true);
    composer.transfer({ resources: [{ kind: "file", file }] });
    expect(composer.read().attachments).toEqual([]);
    composer.selectGoal(false);
    composer.transfer({ resources: [{ kind: "file", file }] });
    composer.selectGoal(true);
    expect(composer.read().goal).toBe(false);
    const duplicateName = new File(["different"], "a.txt");
    const folder = new File([], "assets");
    composer.transfer({
      resources: [
        { kind: "directory", file: folder },
        { kind: "file", file: duplicateName },
      ],
    });
    const staged = composer.read().attachments;
    expect(staged.map((entry) => entry.card.name)).toEqual([
      "a.txt",
      "assets",
      "a.txt",
    ]);
    expect(new Set(staged.map((entry) => entry.id)).size).toBe(3);
    composer.removeAttachment(staged[0].id);
    expect(composer.read().attachments).toEqual([staged[1], staged[2]]);
  });

  it("restores draft modes and image bytes through the existing draft store", async () => {
    const { drafts } = setup();
    const file = new File(["png"], "a.png", { type: "image/png" });
    drafts.writeModes(HomeComposer.key, { plan: true });
    await drafts.writeAttachment(HomeComposer.key, {
      kind: "image",
      name: file.name,
      file,
    });
    const restored = new HomeComposer(drafts);
    await restored.restore();
    expect(restored.read()).toMatchObject({
      plan: true,
      attachments: [{ input: { file } }],
    });
    restored.removeAttachment(restored.read().attachments[0].id);
    expect(await drafts.readAttachmentBatch(HomeComposer.key)).toBeNull();
  });

  it("awaits attachment restoration before submitting and freezes staged intent meanwhile", async () => {
    const disk = Promise.withResolvers<{
      kind: "image";
      name: string;
      file: File;
    }>();
    const drafts = new ComposerDrafts(null, {
      get: () => disk.promise,
      put: async () => {},
      delete: async () => {},
    });
    const composer = new HomeComposer(drafts);
    const { host } = setup();
    const file = new File(["saved"], "saved.png", { type: "image/png" });
    const sending = composer.submit(input, host);
    composer.selectPlan(true);
    composer.selectEffort("ultra");
    composer.transfer({
      resources: [{ kind: "file", file: new File(["late"], "late.txt") }],
    });
    composer.removeAttachment("late");
    expect(host.stash).not.toHaveBeenCalled();
    disk.resolve({ kind: "image", name: file.name, file });
    await sending;
    expect(host.stash).toHaveBeenCalledWith(
      "chosen",
      expect.objectContaining({
        operatingRegime: "act",
        attachment: { kind: "file", file },
      })
    );
  });

  it("keeps rich drafts with relative references scoped to their destination", () => {
    const { composer, drafts } = setup();
    const a = composer.draftFor("workspace-a");
    const b = composer.draftFor("workspace-b");
    drafts.write(a.key, { mention: "src/file.ts" });
    expect(drafts.read(b.key)).toBeNull();
    expect(drafts.read(composer.draftFor("workspace-a").key)).toEqual({
      mention: "src/file.ts",
    });
  });

  it("does not overwrite a newly selected file with late restored content", async () => {
    const disk = Promise.withResolvers<null>();
    const drafts = new ComposerDrafts(null, {
      get: () => disk.promise,
      put: async () => {},
      delete: async () => {},
    });
    const composer = new HomeComposer(drafts);
    const restore = composer.restore();
    const file = new File(["new"], "new.txt");
    composer.transfer({ resources: [{ kind: "file", file }] });
    disk.resolve(null);
    await restore;
    expect(composer.read().attachments[0]?.input).toMatchObject({ file });
  });
});

describe("ApplicationPreset prompt intent", () => {
  it("adds the plain Slides intent and leaves Images guidance to its context", () => {
    expect(ApplicationPreset.prompt("general", "  Hello  ")).toBe("Hello");
    expect(ApplicationPreset.prompt("slides", "My topic")).toBe(
      "Create an editable slide deck.\n\nMy topic"
    );
    expect(ApplicationPreset.prompt("image", "A blue bird")).toBe(
      "A blue bird"
    );
  });
});
