// GRIDA-SEC-004 — exercise the complete Main-owned draft promotion against native admission.
import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeChatIpc, type ActiveNativeChat } from "./native-chat-ipc";
import { NativeChatSelections } from "./native-chat-selections";

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

it.skipIf(!resources || process.platform === "win32")(
  "promotes the complete Main draft creation into one real native chat and submits its first input once",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-draft-promotion-")
    );
    const cwd = path.join(root, "project");
    const userDataPath = path.join(root, "desktop");
    fs.mkdirSync(cwd, { mode: 0o700 });
    fs.mkdirSync(userDataPath, { mode: 0o700 });
    const requests: Record<string, unknown>[] = [];
    const server = createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        requests.push(JSON.parse(body));
        response.writeHead(200, { "content-type": "text/event-stream" });
        const events = [
          {
            type: "response.output_item.done",
            output_index: 0,
            item: {
              type: "message",
              id: `reply-${requests.length}`,
              role: "assistant",
              status: "completed",
              content: [
                { type: "output_text", text: "Confirmed.", annotations: [] },
              ],
            },
          },
          {
            type: "response.completed",
            response: {
              status: "completed",
              usage: { input_tokens: 5, output_tokens: 2 },
            },
          },
        ];
        response.end(
          events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")
        );
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("fixture_bind");
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        resourcesPath: resources!,
        stateDirectory: path.join(root, "state"),
        cwd,
        provider: "responses",
        endpoint: `http://127.0.0.1:${address.port}/v1`,
        model: "gpt-6.1-sol",
        reasoning: true,
      });
      const selections = await NativeChatSelections.open({
        userDataPath,
        choice: async () => ({ connectionId: null, model: "gpt-6.1-sol" }),
        query: (_workspaceId, sessionId, operation, body) =>
          chat!.selectionRequest(operation, sessionId, body),
      });
      const origin = "https://fixture.invalid";
      const workspaceId = "draft-project";
      const frame = {
        url: `${origin}/desktop/workspace?id=${workspaceId}`,
        send: () => {},
      };
      const contents = Object.assign(new EventEmitter(), {
        mainFrame: frame,
        isDestroyed: () => false,
        isLoadingMainFrame: () => false,
      });
      const sender = contents as unknown as WebContents;
      const event = {
        sender,
        senderFrame: frame,
      } as unknown as IpcMainInvokeEvent;
      const active: ActiveNativeChat = {
        workspaceId,
        profileId: null,
        chat,
      };
      const ipc = new NativeChatIpc(
        origin,
        (owner, workspace) =>
          owner === sender && workspace === workspaceId ? active : null,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        undefined,
        selections
      );
      const draftId = randomUUID();
      const draft = await ipc.selection(event, { draftId });
      await ipc.updateSelection(
        event,
        draft.target,
        draft.revision,
        randomUUID(),
        {
          profileId: null,
          effort: "high",
        }
      );
      // Use the coordinator's real object, including its application-owned
      // firstInputId; narrowing this fixture would hide an invalid wire spread.
      const prepared = await selections.prepareCreation(workspaceId, draftId);
      expect(prepared).toEqual({
        sessionId: expect.any(String),
        requestId: expect.any(String),
        firstInputId: expect.any(String),
        selection: {
          connectionId: null,
          model: "gpt-6.1-sol",
          effort: "high",
        },
      });
      const promoted = await ipc.createFromDraft(event, draftId);
      const retried = await ipc.createFromDraft(event, draftId);
      expect(promoted.sessionId).toBe(prepared.sessionId);
      expect(promoted.firstInputId).toBe(prepared.firstInputId);
      expect(retried).toEqual(promoted);
      const applicationCreation = {
        ...prepared,
        futureDraftPresentation: { label: "Draft" },
        selection: { ...prepared.selection, futureConnectionLabel: "Default" },
      };
      expect((await chat.createSelected(applicationCreation)).id).toBe(
        promoted.sessionId
      );
      expect(requests).toHaveLength(0);
      expect((await chat.list()).sessionIds).toEqual([promoted.sessionId]);
      expect(
        (await ipc.catalogEntry(event, promoted.attachmentId)).title
      ).toBeNull();
      const saved = await ipc.selection(event, {
        sessionId: promoted.sessionId,
      });
      expect(saved).toMatchObject({
        revision: 1,
        selection: { effort: "high" },
        available: true,
      });
      const accepted = await ipc.submit(
        event,
        promoted.attachmentId,
        promoted.firstInputId,
        "First draft request",
        "act",
        "high",
        undefined,
        saved.revision
      );
      const firstCatalog = await ipc.catalogEntry(event, promoted.attachmentId);
      expect(firstCatalog.title).toBe("First draft request");
      expect((await ipc.list(event)).titles).toEqual([
        { sessionId: promoted.sessionId, title: firstCatalog.title },
      ]);
      await vi.waitFor(
        async () => {
          expect(
            (await ipc.observe(event, promoted.attachmentId)).snapshot.latest
              ?.status
          ).toBe("succeeded");
        },
        { timeout: 15_000 }
      );
      const replay = await ipc.submit(
        event,
        promoted.attachmentId,
        promoted.firstInputId,
        "First draft request",
        "act",
        "high",
        undefined,
        saved.revision
      );
      expect(replay).toEqual({ ...accepted, disposition: "completed" });
      expect(replay.inputId).toBe(prepared.firstInputId);
      expect(
        (await ipc.catalogEntry(event, promoted.attachmentId)).revision
      ).toBe(firstCatalog.revision);
      expect(requests).toHaveLength(1);
      expect(requests[0].model).toBe("gpt-6.1-sol");
      const session = await chat.load(promoted.sessionId);
      expect(
        (await chat.transcript(session)).filter(
          (message) =>
            message.role === "user" && message.text === "First draft request"
        )
      ).toHaveLength(1);
      contents.emit("destroyed");
    } finally {
      await chat?.close();
      server.close();
      await once(server, "close");
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
  45_000
);
