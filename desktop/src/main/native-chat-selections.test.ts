// GRIDA-SEC-004 / GRIDA-SEC-014 — durable selection/default coordination.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeChatSelections } from "./native-chat-selections";

describe("NativeChatSelections", () => {
  let directory: string;
  const a = "a".repeat(64),
    b = "b".repeat(64);
  let settings: Map<string, NativeChatSelections.Snapshot>;
  let receipts: Map<string, NativeChatSelections.Receipt>;
  let failAfterCommit: boolean;
  let failAck: boolean;
  let providerCalls: number;

  beforeEach(async () => {
    directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-chat-selections-")
    );
    settings = new Map();
    receipts = new Map();
    failAfterCommit = false;
    failAck = false;
    providerCalls = 0;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  function options(): NativeChatSelections.Options {
    return {
      userDataPath: directory,
      choice: async (_workspace, id) => {
        if (id !== null && id !== a && id !== b) throw new Error("unavailable");
        return {
          connectionId: id,
          model: id === a ? "model-a" : id === b ? "model-b" : "default-model",
        };
      },
      query: async (_workspace, sessionId, operation, body = {}) => {
        const old = settings.get(sessionId);
        if (operation === "inspect") {
          if (!old) throw new Error("selection_retired");
          return old;
        }
        const key = `${sessionId}:${body.operationId}`;
        if (operation === "receipt")
          return receipts.has(key)
            ? {
                status: old ? "committed" : "retired",
                receipt: receipts.get(key),
              }
            : { status: old ? "missing" : "retired" };
        if (operation === "ack") {
          if (failAck) throw new Error("lost ack");
          return null;
        }
        if (!old) throw new Error("selection_retired");
        if (old.revision !== body.expectedRevision)
          throw new Error("selection_revision_changed");
        const saved = {
          sessionId,
          revision: old.revision + 1,
          selection: body.selection as NativeChatSelections.Selection,
        };
        settings.set(sessionId, saved);
        const receipt = { ...saved, operationId: body.operationId as string };
        receipts.set(key, receipt);
        if (failAfterCommit) {
          failAfterCommit = false;
          throw new Error("lost reply");
        }
        return receipt;
      },
    };
  }
  async function open() {
    return NativeChatSelections.open(options());
  }
  function session(id: string = randomUUID()) {
    settings.set(id, { sessionId: id, revision: 0, selection: null });
    return id;
  }

  it("keeps unsent pairs across restart and uses the complete explicit pair for new drafts", async () => {
    let owner = await open();
    const first = await owner.read("workspace", null, randomUUID());
    const saved = await owner.update(
      "workspace",
      first.target,
      first.revision,
      randomUUID(),
      { profileId: a, effort: "low" }
    );
    const second = await owner.read("workspace", null, randomUUID());
    const changed = await owner.update(
      "workspace",
      second.target,
      second.revision,
      randomUUID(),
      { profileId: b, effort: "high" }
    );
    owner = await open();
    expect(
      await owner.read(
        "workspace",
        null,
        "draftId" in first.target ? first.target.draftId : undefined
      )
    ).toEqual(saved);
    const effortOnly = await owner.update(
      "workspace",
      saved.target,
      saved.revision,
      randomUUID(),
      { profileId: a, effort: "medium" }
    );
    expect(effortOnly.selection).toEqual({
      profileId: a,
      modelId: "model-a",
      effort: "medium",
    });
    expect(
      (await owner.read("other-workspace", null, randomUUID())).selection
    ).toEqual(effortOnly.selection);
    expect(
      (
        await owner.read(
          "workspace",
          null,
          "draftId" in changed.target ? changed.target.draftId : undefined
        )
      ).selection
    ).toEqual(changed.selection);
    expect(providerCalls).toBe(0);
  });

  it("keeps speed with its chat across restart and a lost edit reply", async () => {
    let owner = await open();
    const id = session();
    const target = { sessionId: id };
    await owner.update("workspace", target, 0, randomUUID(), {
      profileId: a,
      effort: "low",
    });
    const draft = await owner.read("workspace", null, randomUUID());
    await owner.update(
      "workspace",
      draft.target,
      draft.revision,
      randomUUID(),
      { profileId: b, effort: "high" }
    );
    failAfterCommit = true;
    await expect(
      owner.update("workspace", target, 1, randomUUID(), {
        profileId: a,
        effort: "low",
        speed: "fast",
      })
    ).rejects.toThrow("lost reply");
    owner = await open();
    const restored = await owner.read("workspace", id);
    expect(restored.selection).toMatchObject({
      profileId: a,
      effort: "low",
      speed: "fast",
    });
    expect(
      (await owner.read("workspace", null, randomUUID())).selection
    ).toEqual({ profileId: b, modelId: "model-b", effort: "high" });
    const updated = await owner.update(
      "workspace",
      target,
      restored.revision,
      randomUUID(),
      { profileId: a, effort: "high" }
    );
    expect(updated.selection?.speed).toBe("fast");
    const standard = await owner.update(
      "workspace",
      target,
      updated.revision,
      randomUUID(),
      { profileId: a, effort: "high", speed: "standard" }
    );
    expect(standard.selection?.speed ?? "standard").toBe("standard");
  });

  it("restores an unsent draft's speed while new drafts start at Standard", async () => {
    const owner = await open();
    const id = randomUUID();
    const draft = await owner.read("workspace", null, id);
    await owner.update(
      "workspace",
      draft.target,
      draft.revision,
      randomUUID(),
      { profileId: a, effort: "medium", speed: "ultrafast" }
    );
    const restored = await open();
    expect((await restored.read("workspace", null, id)).selection?.speed).toBe(
      "ultrafast"
    );
    expect(
      (await restored.read("workspace", null, randomUUID())).selection?.speed ??
        "standard"
    ).toBe("standard");
  });

  it("restoring a chat never replaces a newer explicit default", async () => {
    const owner = await open();
    const one = session(),
      two = session();
    const first = await owner.update(
      "workspace",
      { sessionId: one },
      0,
      randomUUID(),
      { profileId: a, effort: "low" }
    );
    const second = await owner.update(
      "workspace",
      { sessionId: two },
      0,
      randomUUID(),
      { profileId: b, effort: "ultra" }
    );
    expect((await owner.read("workspace", one)).selection).toEqual(
      first.selection
    );
    expect(
      (await owner.read("workspace", null, randomUUID())).selection
    ).toEqual(second.selection);
  });

  it("recovers a lost native commit reply before accepting another explicit edit", async () => {
    let owner = await open();
    const id = session();
    failAfterCommit = true;
    await expect(
      owner.update("workspace", { sessionId: id }, 0, randomUUID(), {
        profileId: a,
        effort: "high",
      })
    ).rejects.toThrow("lost reply");
    owner = await open();
    await owner.recover();
    expect(
      (await owner.read("workspace", null, randomUUID())).selection
    ).toEqual({ profileId: a, modelId: "model-a", effort: "high" });
    expect(settings.get(id)?.revision).toBe(1);
  });

  it("observes a duplicate operation without making an old pair the newest default", async () => {
    const owner = await open();
    const one = session(),
      two = session();
    const operation = randomUUID();
    const old = await owner.update(
      "workspace",
      { sessionId: one },
      0,
      operation,
      { profileId: a, effort: "low" }
    );
    const latest = await owner.update(
      "workspace",
      { sessionId: two },
      0,
      randomUUID(),
      { profileId: b, effort: "high" }
    );
    expect(
      await owner.update("workspace", { sessionId: one }, 0, operation, {
        profileId: a,
        effort: "low",
      })
    ).toEqual(old);
    expect(
      (await owner.read("workspace", null, randomUUID())).selection
    ).toEqual(latest.selection);
    expect(settings.get(one)?.revision).toBe(1);
    await expect(
      owner.update("workspace", { sessionId: one }, 0, operation, {
        profileId: a,
        effort: "ultra",
      })
    ).rejects.toThrow("native_chat_selection_invalid");
  });

  it("rejects stale edits without overwriting either settings or defaults", async () => {
    const owner = await open();
    const id = session();
    await owner.update("workspace", { sessionId: id }, 0, randomUUID(), {
      profileId: a,
      effort: "low",
    });
    await expect(
      owner.update("workspace", { sessionId: id }, 0, randomUUID(), {
        profileId: b,
        effort: "high",
      })
    ).rejects.toThrow("selection_revision_changed");
    expect(
      (await owner.read("workspace", null, randomUUID())).selection?.profileId
    ).toBe(a);
    await owner.recover();
  });

  it("does not reapply finalized defaults when native ack is delayed", async () => {
    let owner = await open();
    const one = session(),
      two = session();
    failAck = true;
    await owner.update("workspace", { sessionId: one }, 0, randomUUID(), {
      profileId: a,
      effort: "low",
    });
    await owner.update("workspace", { sessionId: two }, 0, randomUUID(), {
      profileId: b,
      effort: "ultra",
    });
    owner = await open();
    failAck = false;
    await owner.recover();
    expect(
      (await owner.read("workspace", null, randomUUID())).selection?.profileId
    ).toBe(b);
  });

  it("cancels an unfinished edit after retirement without resurrecting the chat", async () => {
    let owner = await open();
    const id = session();
    failAfterCommit = true;
    await expect(
      owner.update("workspace", { sessionId: id }, 0, randomUUID(), {
        profileId: a,
        effort: "low",
      })
    ).rejects.toThrow("lost reply");
    settings.delete(id);
    owner = await open();
    await owner.recover();
    expect(
      (await owner.read("workspace", null, randomUUID())).selection?.profileId
    ).toBeNull();
    expect(settings.has(id)).toBe(false);
  });

  it("persists stable creation and first-input identities across lost responses", async () => {
    let owner = await open();
    const draftId = randomUUID();
    const draft = await owner.read("workspace", null, draftId);
    const creation = await owner.prepareCreation("workspace", draftId);
    owner = await open();
    expect(await owner.prepareCreation("workspace", draftId)).toEqual(creation);
    expect(creation.selection.effort).toBe(draft.selection?.effort);
    await owner.finishCreation("workspace", draftId);
    expect(await owner.prepareCreation("workspace", draftId)).toEqual(creation);
    expect((await owner.read("workspace", null)).target).not.toEqual(
      draft.target
    );
  });

  it("identifies a pending creation without replacing its pair or retry identities", async () => {
    let owner = await open();
    const draftId = randomUUID();
    const initial = await owner.read("workspace", null, draftId);
    const saved = await owner.update(
      "workspace",
      initial.target,
      initial.revision,
      randomUUID(),
      { profileId: a, effort: "high" }
    );
    const creation = await owner.prepareCreation("workspace", draftId);
    owner = await open();
    await expect(
      owner.update("workspace", saved.target, saved.revision, randomUUID(), {
        profileId: b,
        effort: "low",
      })
    ).rejects.toThrow("native_chat_draft_creation_pending");
    expect(await owner.read("workspace", null, draftId)).toEqual(saved);
    expect(await owner.prepareCreation("workspace", draftId)).toEqual(creation);
    expect(owner.readDefaults()).toEqual(creation.selection);
    expect(settings.size).toBe(0);
    expect(providerCalls).toBe(0);
  });

  it("preserves unavailable choices and never invents a legacy connection", async () => {
    let owner = await open();
    const draftId = randomUUID();
    const draft = await owner.read("workspace", null, draftId);
    await owner.update(
      "workspace",
      draft.target,
      draft.revision,
      randomUUID(),
      { profileId: a, effort: "high" }
    );
    const changed = options();
    changed.choice = async () => {
      throw new Error("offline");
    };
    owner = await NativeChatSelections.open(changed);
    const unavailable = await owner.read("workspace", null, draftId);
    expect(unavailable.available).toBe(false);
    expect(unavailable.selection?.profileId).toBe(a);
    expect((await owner.read("workspace", session())).selection).toBeNull();
  });

  it("rejects unsafe or future preference storage without overwriting it", async () => {
    const filename = path.join(directory, "chat-selections.json");
    await fs.writeFile(filename, '{"version":2}', { mode: 0o600 });
    await expect(open()).rejects.toThrow("storage_invalid");
    expect(await fs.readFile(filename, "utf8")).toBe('{"version":2}');
    await fs.unlink(filename);
    const other = path.join(directory, "other");
    await fs.writeFile(other, "{}", { mode: 0o600 });
    await fs.symlink(other, filename);
    await expect(open()).rejects.toThrow("selection_invalid");
  });

  it("exposes default snapshots without giving callers mutable preference state", async () => {
    const owner = await open();
    expect(owner.readDefaults()).toBeNull();
    const draftId = randomUUID();
    const draft = await owner.read("workspace", null, draftId);
    await owner.update(
      "workspace",
      draft.target,
      draft.revision,
      randomUUID(),
      { profileId: a, effort: "high" }
    );
    const defaults = owner.readDefaults()!;
    (defaults as { effort: string }).effort = "low";
    const creation = await owner.prepareCreation("workspace", draftId);
    (creation.selection as { model: string }).model = "mutated";
    expect(owner.readDefaults()).toEqual({
      connectionId: a,
      model: "model-a",
      effort: "high",
    });
    expect(
      (await owner.read("workspace", null, draftId)).selection?.modelId
    ).toBe("model-a");
  });

  it("restores native fork identities while keeping draft and mutation identities strict", async () => {
    const owner = await open();
    const id = `fork/${"a".repeat(32)}`;
    session(id);
    await owner.update("workspace", { sessionId: id }, 0, randomUUID(), {
      profileId: a,
      effort: "low",
    });
    expect((await owner.read("workspace", id)).selection?.profileId).toBe(a);
    await expect(owner.read("workspace", null, id)).rejects.toThrow(
      "selection_invalid"
    );
  });

  it("normalizes the legacy standard effort and rejects non-exact draft operation retries", async () => {
    const owner = await open();
    const draft = await owner.read("workspace", null, randomUUID());
    const operation = randomUUID();
    const chosen = await owner.update(
      "workspace",
      draft.target,
      draft.revision,
      operation,
      { profileId: a, effort: "standard" }
    );
    expect(chosen.selection?.effort).toBe("medium");
    await expect(
      owner.update("workspace", draft.target, chosen.revision, operation, {
        profileId: a,
        effort: "medium",
      })
    ).rejects.toThrow("selection_invalid");
  });

  it("refuses a resolver that returns another connection with the same model label", async () => {
    const configured = options();
    configured.choice = async (_workspace, requested) => ({
      connectionId: requested === a ? b : requested,
      model: "model-a",
    });
    const owner = await NativeChatSelections.open(configured);
    const id = session();
    await expect(
      owner.update("workspace", { sessionId: id }, 0, randomUUID(), {
        profileId: a,
        effort: "high",
      })
    ).rejects.toThrow("selection_invalid");
    expect(settings.get(id)?.revision).toBe(0);
    expect(owner.readDefaults()).toBeNull();
    settings.set(id, {
      sessionId: id,
      revision: 1,
      selection: { connectionId: a, model: "model-a", effort: "high" },
    });
    expect((await owner.read("workspace", id)).available).toBe(false);
  });

  it("does not overwrite a future storage replacement after the owner was opened", async () => {
    const owner = await open();
    const id = session();
    const filename = path.join(directory, "chat-selections.json");
    const future = '{"version":2,"preserve":"future state"}';
    await fs.writeFile(filename, future, { mode: 0o600 });
    await expect(
      owner.update("workspace", { sessionId: id }, 0, randomUUID(), {
        profileId: a,
        effort: "low",
      })
    ).rejects.toThrow("storage_changed");
    expect(settings.get(id)?.revision).toBe(0);
    expect(await fs.readFile(filename, "utf8")).toBe(future);
  });

  it("serializes separate owners so a stale object cannot overwrite a newer default", async () => {
    const first = await open(),
      stale = await open();
    const outcomes = await Promise.allSettled([
      first.read("workspace", null, randomUUID()),
      stale.read("workspace", null, randomUUID()),
    ]);
    expect(
      outcomes.filter(({ status }) => status === "fulfilled")
    ).toHaveLength(1);
    const rejected = outcomes.find(
      ({ status }) => status === "rejected"
    ) as PromiseRejectedResult;
    expect(rejected.reason.message).toContain("storage_changed");
    expect(
      Object.keys(
        JSON.parse(
          await fs.readFile(
            path.join(directory, "chat-selections.json"),
            "utf8"
          )
        ).drafts
      )
    ).toHaveLength(1);
  });

  it("keeps a newer native selection when recovering an older committed outcome", async () => {
    let owner = await open();
    const previous = session(),
      id = session();
    await owner.update("workspace", { sessionId: previous }, 0, randomUUID(), {
      profileId: b,
      effort: "high",
    });
    failAfterCommit = true;
    await expect(
      owner.update("workspace", { sessionId: id }, 0, randomUUID(), {
        profileId: a,
        effort: "low",
      })
    ).rejects.toThrow("lost reply");
    settings.set(id, {
      sessionId: id,
      revision: 2,
      selection: { connectionId: b, model: "model-b", effort: "medium" },
    });
    owner = await open();
    await expect(owner.recover()).rejects.toThrow("selection_revision_changed");
    expect(owner.readDefaults()).toEqual({
      connectionId: b,
      model: "model-b",
      effort: "high",
    });
    expect((await owner.read("workspace", id)).selection?.effort).toBe(
      "medium"
    );
    await owner.recover();
  });

  it("cancels a never-committed intent if its chat was deleted before recovery", async () => {
    const configured = options(),
      original = configured.query;
    let refuse = true;
    configured.query = async (workspace, id, operation, body) => {
      if (operation === "update" && refuse)
        throw new Error("transport_lost_before_dispatch");
      if (operation === "receipt" && !settings.has(id))
        throw new Error("session_missing");
      return original(workspace, id, operation, body);
    };
    let owner = await NativeChatSelections.open(configured);
    const id = session();
    await expect(
      owner.update("workspace", { sessionId: id }, 0, randomUUID(), {
        profileId: a,
        effort: "low",
      })
    ).rejects.toThrow("transport_lost");
    settings.delete(id);
    refuse = false;
    owner = await NativeChatSelections.open(configured);
    await owner.recover();
    expect(owner.readDefaults()).toBeNull();
    const other = session();
    await owner.update("workspace", { sessionId: other }, 0, randomUUID(), {
      profileId: b,
      effort: "high",
    });
    expect(owner.readDefaults()?.connectionId).toBe(b);
  });

  it("does not leave a definitive native capacity refusal as an intent to apply later", async () => {
    const configured = options(),
      original = configured.query;
    let refuse = true;
    configured.query = async (workspace, id, operation, body) => {
      if (operation === "update" && refuse)
        throw new Error("chat_selection_receipt_limit");
      return original(workspace, id, operation, body);
    };
    let owner = await NativeChatSelections.open(configured);
    const id = session();
    await expect(
      owner.update("workspace", { sessionId: id }, 0, randomUUID(), {
        profileId: a,
        effort: "low",
      })
    ).rejects.toThrow("receipt_limit");
    refuse = false;
    owner = await NativeChatSelections.open(configured);
    await owner.recover();
    expect(settings.get(id)?.revision).toBe(0);
    await owner.update("workspace", { sessionId: id }, 0, randomUUID(), {
      profileId: b,
      effort: "high",
    });
    expect(owner.readDefaults()?.connectionId).toBe(b);
  });

  it("refuses another native mutation before overflowing unresolved cleanup receipts", async () => {
    const filename = path.join(directory, "chat-selections.json");
    const acknowledgments = Array.from({ length: 256 }, () => ({
      workspaceId: "workspace",
      sessionId: randomUUID(),
      operationId: randomUUID(),
    }));
    await fs.writeFile(
      filename,
      JSON.stringify({
        version: 1,
        defaults: null,
        drafts: {},
        current: {},
        pending: null,
        acknowledgments,
      }),
      { mode: 0o600 }
    );
    failAck = true;
    const owner = await open();
    const id = session();
    await expect(
      owner.update("workspace", { sessionId: id }, 0, randomUUID(), {
        profileId: a,
        effort: "high",
      })
    ).rejects.toThrow("receipt_limit");
    expect(settings.get(id)?.revision).toBe(0);
    expect(JSON.parse(await fs.readFile(filename, "utf8")).pending).toBeNull();
  });

  it("keeps completed promotion receipts bounded without changing a late retry's native identity", async () => {
    let owner = await open();
    const firstId = randomUUID();
    await owner.read("workspace", null, firstId);
    const first = await owner.prepareCreation("workspace", firstId);
    await owner.finishCreation("workspace", firstId);
    // Start at capacity so the test exercises eviction and retry with real
    // durable writes, independently of disk throughput.
    const filename = path.join(directory, "chat-selections.json");
    const atCapacity = JSON.parse(await fs.readFile(filename, "utf8"));
    while (atCapacity.completed.length < 128) {
      const id = randomUUID();
      atCapacity.completed.push(id);
      atCapacity.drafts[id] = {
        ...atCapacity.drafts[firstId],
        promotion: {
          sessionId: randomUUID(),
          requestId: randomUUID(),
          firstInputId: randomUUID(),
        },
      };
    }
    await fs.writeFile(filename, JSON.stringify(atCapacity));
    owner = await open();
    const nextId = randomUUID();
    await owner.read("workspace", null, nextId);
    await owner.prepareCreation("workspace", nextId);
    await owner.finishCreation("workspace", nextId);
    const stored = JSON.parse(await fs.readFile(filename, "utf8"));
    expect(stored.completed).toEqual([
      ...atCapacity.completed.slice(1),
      nextId,
    ]);
    expect(Object.keys(stored.drafts)).toHaveLength(128);
    expect(stored.drafts[firstId]).toBeUndefined();
    owner = await open();
    await owner.read("workspace", null, firstId);
    expect(await owner.prepareCreation("workspace", firstId)).toEqual(first);
  });

  it("acknowledges creation only after the completed promotion is durable", async () => {
    const configured = options(),
      original = configured.query;
    const creationAcks: {
      sessionId: string;
      operationId: unknown;
      completedCount: number;
      currentDraft: unknown;
    }[] = [];
    configured.query = async (workspace, sessionId, operation, body) => {
      if (operation === "ack") {
        const stored = JSON.parse(
          await fs.readFile(
            path.join(directory, "chat-selections.json"),
            "utf8"
          )
        );
        creationAcks.push({
          sessionId,
          operationId: body?.operationId,
          completedCount: stored.completed.length,
          currentDraft: stored.current.workspace,
        });
      }
      return original(workspace, sessionId, operation, body);
    };
    const owner = await NativeChatSelections.open(configured);
    const draftId = randomUUID();
    await owner.read("workspace", null, draftId);
    const creation = await owner.prepareCreation("workspace", draftId);
    await owner.finishCreation("workspace", draftId);
    await owner.finishCreation("workspace", draftId);
    expect(creationAcks).toEqual([
      {
        sessionId: creation.sessionId,
        operationId: creation.requestId,
        completedCount: 1,
        currentDraft: undefined,
      },
    ]);
  });

  it("preserves the old default and performs no native mutation if staging an intent fails", async () => {
    const owner = await open();
    const id = session();
    vi.spyOn(fs, "rename").mockRejectedValueOnce(
      new Error("disk_full_before_publish")
    );
    await expect(
      owner.update("workspace", { sessionId: id }, 0, randomUUID(), {
        profileId: a,
        effort: "high",
      })
    ).rejects.toThrow("disk_full");
    expect(settings.get(id)?.revision).toBe(0);
    expect(owner.readDefaults()).toBeNull();
    const reopened = await open();
    await reopened.recover();
    expect(settings.get(id)?.revision).toBe(0);
  });

  it("recovers a published but unsynced default before acknowledging native outcomes", async () => {
    const owner = await open();
    const id = session();
    const canonicalDirectory = await fs.realpath(directory);
    const originalRename = fs.rename,
      originalOpen = fs.open;
    let published = 0,
      failed = false,
      acknowledgments = 0;
    vi.spyOn(fs, "rename").mockImplementation(async (...args) => {
      await originalRename(...args);
      published++;
    });
    vi.spyOn(fs, "open").mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      if (args[0] === canonicalDirectory && published === 2 && !failed) {
        vi.spyOn(handle, "sync").mockImplementationOnce(async () => {
          failed = true;
          throw new Error("directory_sync_failed_after_publish");
        });
      }
      return handle;
    });
    const configured = options(),
      original = configured.query;
    configured.query = async (workspace, session, operation, body) => {
      if (operation === "ack") acknowledgments++;
      return original(workspace, session, operation, body);
    };
    // Use an owner opened with the fault-observing native transport.
    const active = await NativeChatSelections.open(configured);
    await expect(
      active.update("workspace", { sessionId: id }, 0, randomUUID(), {
        profileId: a,
        effort: "high",
      })
    ).rejects.toThrow("directory_sync");
    expect(active.readDefaults()).toBeNull();
    expect(settings.get(id)?.revision).toBe(1);
    expect(acknowledgments).toBe(0);
    await active.recover();
    expect(active.readDefaults()).toEqual({
      connectionId: a,
      model: "model-a",
      effort: "high",
    });
    expect(acknowledgments).toBe(1);
    expect(owner.readDefaults()).toBeNull();
  });

  it.each(["same owner", "reopen"])(
    "reclaims a Welcome reservation after its directory sync fails (%s)",
    async (recovery) => {
      const configured = options();
      const acknowledgments = vi.fn<NativeChatSelections.Options["query"]>(
        configured.query
      );
      let owner = await NativeChatSelections.open({
        ...configured,
        query: acknowledgments,
      });
      const ordinaryId = randomUUID();
      await owner.read("workspace", null, ordinaryId);
      const ordinary = await owner.prepareCreation("workspace", ordinaryId);
      const welcomeId = randomUUID();
      const canonicalDirectory = await fs.realpath(directory);
      const openFile = fs.open;
      let failed = false;
      vi.spyOn(fs, "open").mockImplementation(async (...args) => {
        const handle = await openFile(...args);
        if (args[0] === canonicalDirectory && !failed)
          vi.spyOn(handle, "sync").mockImplementationOnce(async () => {
            failed = true;
            throw new Error("directory_sync_failed_after_publish");
          });
        return handle;
      });
      await expect(
        owner.prepareNewChat(
          "workspace",
          welcomeId,
          { profileId: a, effort: "high" },
          () => {}
        )
      ).rejects.toThrow("directory_sync");
      const filename = path.join(directory, "chat-selections.json");
      const before = JSON.parse(await fs.readFile(filename, "utf8"));
      expect(before.drafts[welcomeId].welcome).toBe(true);
      const { sessionId, requestId } = before.drafts[welcomeId].promotion;
      if (recovery === "reopen")
        owner = await NativeChatSelections.open({
          ...configured,
          query: acknowledgments,
        });
      await owner.recover();
      const after = JSON.parse(await fs.readFile(filename, "utf8"));
      expect(after.completed).toEqual([welcomeId]);
      expect(acknowledgments).toHaveBeenCalledExactlyOnceWith(
        "workspace",
        sessionId,
        "ack",
        { operationId: requestId }
      );
      expect(await owner.prepareCreation("workspace", ordinaryId)).toEqual(
        ordinary
      );
    }
  );

  it("leaves an in-flight Welcome creation to its current owner", async () => {
    const configured = options();
    const query = vi.fn<NativeChatSelections.Options["query"]>(
      configured.query
    );
    const owner = await NativeChatSelections.open({ ...configured, query });
    const draftId = randomUUID();
    const creation = await owner.prepareNewChat(
      "workspace",
      draftId,
      { profileId: a, effort: "high" },
      () => {}
    );
    await owner.recover();
    expect(query).not.toHaveBeenCalled();
    await owner.finishCreation("workspace", draftId);
    expect(query).toHaveBeenCalledExactlyOnceWith(
      "workspace",
      creation.sessionId,
      "ack",
      { operationId: creation.requestId }
    );
  });

  it("inherits only effort when creating a new chat whose context fixes the route", async () => {
    const configured = options();
    configured.initial = async (workspace) =>
      workspace === "fixed-document"
        ? { connectionId: null, model: "default-model", fixed: true }
        : { connectionId: null, model: "default-model" };
    const owner = await NativeChatSelections.open(configured);
    const id = session();
    await owner.update("workspace", { sessionId: id }, 0, randomUUID(), {
      profileId: b,
      effort: "ultra",
    });
    expect(
      (await owner.read("fixed-document", null, randomUUID())).selection
    ).toEqual({ profileId: null, modelId: "default-model", effort: "ultra" });
    expect(owner.readDefaults()).toEqual({
      connectionId: b,
      model: "model-b",
      effort: "ultra",
    });
    expect(
      (await owner.read("workspace", null, randomUUID())).selection?.profileId
    ).toBe(b);
  });

  it("refuses an edit whose frame is revoked while its connection choice resolves", async () => {
    const configured = options();
    const owner = await NativeChatSelections.open(configured);
    const draft = await owner.read("workspace", null, randomUUID());
    const resolved = Promise.withResolvers<{
      connectionId: string;
      model: string;
    }>();
    const began = Promise.withResolvers<void>();
    configured.choice = () => {
      began.resolve();
      return resolved.promise;
    };
    let admitted = true;
    const pending = owner.update(
      "workspace",
      draft.target,
      draft.revision,
      randomUUID(),
      { profileId: a, effort: "high" },
      () => {
        if (!admitted) throw new Error("frame_revoked");
      }
    );
    await began.promise;
    admitted = false;
    resolved.resolve({ connectionId: a, model: "model-a" });
    await expect(pending).rejects.toThrow("frame_revoked");
    expect(owner.readDefaults()).toBeNull();
    const state = JSON.parse(
      await fs.readFile(path.join(directory, "chat-selections.json"), "utf8")
    );
    expect(state.defaults).toBeNull();
    expect(
      state.drafts["draftId" in draft.target ? draft.target.draftId : ""]
        .revision
    ).toBe(draft.revision);
  });
});
