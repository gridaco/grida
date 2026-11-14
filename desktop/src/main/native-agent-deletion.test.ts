import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../bridge/contract";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeAgentDeletion } from "./native-agent-deletion";
import { NativeChatIpc } from "./native-chat-ipc";
import { NativeGatewayConnection } from "./native-gateway-connection";

const deletion = {
  sessionId: "chat",
  cwd: "/fixture/workspace",
  requestId: "confirmed-delete",
  expectedSessionRevision: 12,
  expectedCatalogRevision: 3,
} as const;
type DeletionRequest = ConstructorParameters<typeof NativeAgentDeletion>[0];

describe("NativeAgentDeletion", () => {
  it("requests a scoped preview and retains the reviewed membership basis", async () => {
    const basis = "0123456789abcdef".repeat(4);
    const request = vi.fn<DeletionRequest>().mockResolvedValue({
      sessionId: deletion.sessionId,
      ownedChildren: 2,
      ownedChildrenBasis: basis,
    });
    const preview = await new NativeAgentDeletion(request).preview({
      sessionId: deletion.sessionId,
      cwd: deletion.cwd,
    });
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "_co.grida/session/delete-preview",
      { sessionId: deletion.sessionId, cwd: deletion.cwd }
    );
    expect(preview.ownedChildren).toBe(2);
    expect(preview.ownedChildrenBasis).toBe(basis);
    expect(Object.isFrozen(preview)).toBe(true);
  });

  it.each([
    { sessionId: "other-chat" },
    { ownedChildren: 129 },
    { ownedChildren: -1 },
    { ownedChildren: 0.5 },
    { ownedChildrenBasis: "0".repeat(63) },
    { ownedChildrenBasis: "A".repeat(64) },
    { ownedChildrenBasis: Array(32).fill(0) },
  ])("refuses a stale or malformed review reply %j", async (change) => {
    const request = vi.fn<DeletionRequest>().mockResolvedValue({
      sessionId: deletion.sessionId,
      ownedChildren: 0,
      ownedChildrenBasis: "0".repeat(64),
      ...change,
    });
    await expect(
      new NativeAgentDeletion(request).preview({
        sessionId: deletion.sessionId,
        cwd: deletion.cwd,
      })
    ).rejects.toThrow("native_chat_deletion_preview_invalid");
  });

  it("retries a lost reply with the exact immutable request", async () => {
    const request = vi.fn<DeletionRequest>();
    const reviewed = {
      ...deletion,
      expectedOwnedChildren: "7".repeat(64),
    };
    request
      .mockImplementationOnce(async () => {
        throw new Error("native_agent_request_timeout");
      })
      .mockResolvedValueOnce({
        sessionId: "chat",
        requestId: "confirmed-delete",
      });
    await new NativeAgentDeletion(request).retire(reviewed);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]).toEqual([
      "_co.grida/session/delete",
      { ...deletion, expectedOwnedChildren: "7".repeat(64) },
    ]);
    expect(request.mock.calls[1]?.[1]).toBe(request.mock.calls[0]?.[1]);
    expect(Object.isFrozen(request.mock.calls[0]?.[1])).toBe(true);
  });

  it("retains uncertainty when a previous deletion response was lost", async () => {
    const request = vi.fn<DeletionRequest>();
    request
      .mockRejectedValueOnce(new Error("sqlite_commit_unconfirmed"))
      .mockRejectedValueOnce(new Error("session_deletion_in_progress"));
    await expect(
      new NativeAgentDeletion(request).retire(deletion)
    ).rejects.toThrow("native_chat_deletion_unverified");
    expect(request.mock.calls[1]?.[1]).toBe(request.mock.calls[0]?.[1]);
  });

  it("leaves explicit dependency refusals intact", async () => {
    const blocker = new Error("session_deletion_has_subagents");
    const request = vi.fn<DeletionRequest>().mockRejectedValue(blocker);
    await expect(
      new NativeAgentDeletion(request).retire(deletion)
    ).rejects.toBe(blocker);
    expect(request).toHaveBeenCalledTimes(1);
    expect(NativeAgentDeletion.isUnverified(blocker)).toBe(false);
  });

  it("requires a receipt for both the confirmed request and exact chat", async () => {
    const request = vi.fn<DeletionRequest>().mockResolvedValue({
      sessionId: "another-chat",
      requestId: "confirmed-delete",
    });
    await expect(
      new NativeAgentDeletion(request).retire(deletion)
    ).rejects.toThrow("native_chat_deletion_unverified");
    expect(request).toHaveBeenCalledTimes(1);
  });
});

const packaged = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

it.runIf(Boolean(packaged) && process.platform !== "win32").each([false, true])(
  "confirms exact saved chat deletion through a built native host with named child %s",
  async (withChild) => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-chat-deletion-")
    );
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const authored = path.join(cwd, "authored.txt");
    fs.writeFileSync(authored, "Keep the project file.");
    const gateway = withChild
      ? await NativeGatewayConnection.open({
          origin: "https://gateway.fixture.invalid",
          account: {
            withGatewayGrant: async (_, accept) =>
              accept({
                token: "synthetic.deletion.fixture",
                expiresAt: Date.now() + 120_000,
                subject: "deletion-fixture",
                organizationId: 1,
                isCurrent: () => true,
              }),
          },
          network: {
            prepare: () => {
              throw new Error("deletion must not dispatch inference");
            },
          },
        })
      : undefined;
    const launch = {
      resourcesPath: packaged!,
      stateDirectory: path.join(root, "state"),
      cwd,
      ...(gateway
        ? { ...gateway.launch("fixture"), subagents: true as const }
        : {
            provider: "openai-compatible" as const,
            endpoint: "http://127.0.0.1:1/v1",
            model: "fixture",
          }),
    } as const;
    const origin = "https://editor.fixture.invalid";
    const windowAt = () => {
      const frame = {
        url: `${origin}/desktop/workspace?id=workspace`,
        send: vi.fn<(channel: string, payload: unknown) => void>(),
      };
      const sender = Object.assign(new EventEmitter(), {
        mainFrame: frame,
        isDestroyed: () => false,
        isLoadingMainFrame: () => false,
      }) as unknown as WebContents;
      return {
        frame,
        sender,
        event: { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent,
      };
    };
    const first = windowAt();
    const second = windowAt();
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start(launch);
      const active = { workspaceId: "workspace", chat };
      const confirm =
        vi.fn<
          (
            sender: WebContents,
            title: string | null,
            count?: number
          ) => Promise<boolean>
        >();
      confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const ipc = new NativeChatIpc(
        origin,
        (sender) =>
          sender === first.sender || sender === second.sender ? active : null,
        undefined,
        confirm
      );
      const opened = await ipc.create(first.event);
      const peer = await ipc.load(second.event, opened.sessionId);
      const child = withChild
        ? await ipc.createSubagent(first.event, opened.attachmentId, {
            requestId: randomUUID(),
            name: "Reviewer",
            workTurns: 1,
          })
        : undefined;
      expect(Boolean(child)).toBe(withChild);
      const entry = await ipc.organize(first.event, opened.attachmentId, {
        revision: 0,
        archived: true,
        title: "Disposable chat",
      });
      expect(entry.deletionAvailable).toBe(true);
      const observation = await ipc.observe(first.event, opened.attachmentId);
      const subscriptionId = randomUUID();
      ipc.subscribe(second.event, peer.attachmentId, subscriptionId);
      await expect(
        ipc.deleteSavedChat(
          first.event,
          opened.attachmentId,
          observation.observationId,
          entry.revision
        )
      ).resolves.toBe(false);
      expect((await ipc.list(first.event, null, true)).sessionIds).toContain(
        opened.sessionId
      );
      await expect(
        ipc.deleteSavedChat(
          first.event,
          opened.attachmentId,
          observation.observationId,
          entry.revision
        )
      ).resolves.toBe(true);
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(confirm).toHaveBeenLastCalledWith(
        first.sender,
        "Disposable chat",
        ...(withChild ? [1] : [])
      );
      expect(second.frame.send).toHaveBeenCalledWith(
        IPC_CHANNELS.NATIVE_CHAT_UPDATE,
        {
          attachmentId: peer.attachmentId,
          subscriptionId,
          update: { kind: "closed", reason: "session_deleted" },
        }
      );
      expect(
        (await ipc.list(first.event, null, true)).sessionIds
      ).not.toContain(opened.sessionId);
      await expect(
        ipc.transcript(second.event, peer.attachmentId)
      ).rejects.toThrow("native_chat_session_deleted");
      await expect(ipc.load(second.event, opened.sessionId)).rejects.toThrow(
        "session_missing"
      );
      await chat.close();
      chat = await NativeAgentChat.start(launch);
      await expect(chat.load(opened.sessionId)).rejects.toThrow(
        "session_missing"
      );
      expect(fs.readFileSync(authored, "utf8")).toBe("Keep the project file.");
    } finally {
      try {
        await chat?.close();
      } finally {
        gateway?.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
  30_000
);
