import { describe, expect, it, vi } from "vitest";
import { DesktopChatFixture } from "../composer/desktop-chat-fixture";
import { NativeChatWorkspaceFixture } from "./workspace-fixture";

describe("Native Chat workspace fixture", () => {
  it("keeps draft admission, chat lists, and old attachments scoped to their chat", async () => {
    const first = new DesktopChatFixture("text", false);
    const workspace = new NativeChatWorkspaceFixture(first);
    const { bridge } = workspace;
    const initial = first.sessionId;
    const firstUpdate = vi.fn<() => void>();
    const token = await bridge.subscribe(initial, firstUpdate);

    first.submission.hold(true);
    first.setReplyHeld(true);
    const created = await bridge.createFromDraft!("unsent-draft");
    expect(created.sessionId).not.toBe(initial);
    expect(await bridge.createFromDraft!("unsent-draft")).toEqual(created);
    expect((await bridge.list()).sessionIds).toEqual([
      initial,
      created.sessionId,
    ]);

    const admission = bridge.submitInRegime!(
      "submit",
      created.attachmentId,
      created.firstInputId,
      "For the new chat",
      "act"
    );
    expect(workspace.read().submission.read().pending).toBe(true);
    expect(await bridge.transcript(created.attachmentId)).toEqual([]);
    workspace.read().submission.accept();
    await admission;
    expect(workspace.read().readReplyHeld()).toBe(true);
    workspace.read().finishReply();
    expect(firstUpdate).not.toHaveBeenCalled();
    expect((await bridge.transcript(created.attachmentId))[0].text).toBe(
      "For the new chat"
    );
    await bridge.load(initial);
    expect(workspace.read()).toBe(first);
    expect(await bridge.transcript(initial)).not.toContainEqual(
      expect.objectContaining({ text: "For the new chat" })
    );

    const row = await bridge.catalogEntry!(created.attachmentId);
    await bridge.organize!(created.attachmentId, {
      revision: row.revision,
      title: "Preparation",
      archived: true,
    });
    expect((await bridge.list()).sessionIds).toEqual([initial]);
    expect((await bridge.listArchived!()).titles).toEqual([
      { sessionId: created.sessionId, title: "Preparation" },
    ]);
    await bridge.unsubscribe(token);
  });

  it("restores a queue checkout on its owning chat even after switching", async () => {
    const source = new DesktopChatFixture("text", true);
    const { bridge } = new NativeChatWorkspaceFixture(source);
    const { observationId } = await bridge.observe(source.sessionId);
    const opened = await bridge.queueCheckout!.checkout(source.sessionId, {
      observationId,
      inputId: "multiline",
      requestId: "edit-one",
    });
    const other = await bridge.create();
    await bridge.queueCheckout!.reinsert(source.sessionId, {
      checkoutId: opened.checkoutId,
      requestId: "restore-one",
    });
    expect(
      (await bridge.observe(other.attachmentId)).snapshot.queuedInputs
    ).toBe(0);
    expect((await bridge.observe(source.sessionId)).snapshot.queuedInputs).toBe(
      3
    );
  });

  it("keeps a side chat out of the catalogue and rejects late calls after close", async () => {
    const source = new DesktopChatFixture("text", false);
    const { bridge } = new NativeChatWorkspaceFixture(source);
    const side = await bridge.openSideChat!(source.sessionId);
    expect(
      (await bridge.observe(side.attachmentId)).snapshot.side
    ).toMatchObject({ parentSessionId: source.sessionId, temporary: true });
    expect((await bridge.list()).sessionIds).toEqual([source.sessionId]);
    expect(await bridge.transcript(side.attachmentId)).toEqual([]);

    await bridge.closeSideChat!(side.attachmentId);
    await expect(bridge.observe(side.attachmentId)).rejects.toThrow(
      "fixture_session_unavailable"
    );
    await expect(
      bridge.submit(side.attachmentId, "late", "Test")
    ).rejects.toThrow("fixture_session_unavailable");
  });

  it("forks retained history once and pages the recorded transcript by turn", async () => {
    const source = new DesktopChatFixture("time-dividers", false);
    const { bridge } = new NativeChatWorkspaceFixture(source);
    const latest = await bridge.transcriptPage!(source.sessionId);
    expect(latest.turns).toHaveLength(2);
    expect(latest.older).toBeTruthy();

    const older = await bridge.transcriptPage!(source.sessionId, latest.older!);
    expect(older.messages.map(({ messageId }) => messageId)).not.toContain(
      latest.messages[0].messageId
    );
    expect([...older.messages, ...latest.messages]).toEqual(
      await bridge.transcript(source.sessionId)
    );

    const fork = await bridge.runCommand!(
      source.sessionId,
      "fork",
      "fork-once"
    );
    expect(fork.command).toBe("fork");
    if (fork.command !== "fork") throw new Error("Expected a fork");
    expect(
      await bridge.runCommand!(source.sessionId, "fork", "fork-once")
    ).toEqual(fork);
    expect(await bridge.transcript(fork.sessionId)).toEqual(
      await bridge.transcript(source.sessionId)
    );
  });
});
