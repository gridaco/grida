import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeChatIpc } from "./native-chat-ipc";

const packaged = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

function chunk(index: number, delta: unknown, finish: string | null = null) {
  return `data: ${JSON.stringify({
    id: `side-fixture-${index}`,
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;
}

async function provider() {
  const requests: Record<string, unknown>[] = [];
  let parent: ServerResponse | undefined;
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    let body = "";
    request.on("data", (part: string) => {
      body += part;
    });
    request.on("end", () => {
      requests.push(JSON.parse(body));
      const index = requests.length;
      if (request.url !== "/v1/chat/completions" || index > 2) {
        response.writeHead(400).end();
        return;
      }
      const text = ["Parent partial.", "The separate answer."][index - 1];
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(chunk(index, { role: "assistant", content: text }));
      if (index === 1) parent = response;
      if (index === 2)
        response.end(chunk(index, {}, "stop") + "data: [DONE]\n\n");
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture_listener_unavailable");
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    requests,
    releaseParent: () => parent?.end(chunk(1, {}, "stop") + "data: [DONE]\n\n"),
    close: async () => {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

it.runIf(Boolean(packaged))(
  "runs a side chat as an ordinary attached chat while the parent continues through the same private child",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-side-chat-")
    );
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const endpoint = await provider();
    const origin = "https://editor.fixture.invalid";
    const frame = { url: `${origin}/desktop/workspace?id=workspace` };
    const sender = Object.assign(new EventEmitter(), {
      mainFrame: frame,
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
    }) as unknown as WebContents;
    const event = {
      sender,
      senderFrame: frame,
    } as unknown as IpcMainInvokeEvent;
    const otherFrame = { url: frame.url };
    const otherSender = Object.assign(new EventEmitter(), {
      mainFrame: otherFrame,
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
    }) as unknown as WebContents;
    const other = {
      sender: otherSender,
      senderFrame: otherFrame,
    } as unknown as IpcMainInvokeEvent;
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        resourcesPath: packaged!,
        stateDirectory: path.join(root, "state"),
        cwd,
        provider: "openai-compatible",
        endpoint: endpoint.endpoint,
        model: "fixture",
      });
      const active = { workspaceId: "workspace", chat };
      const ipc = new NativeChatIpc(origin, (candidate) =>
        candidate === sender || candidate === otherSender ? active : null
      );
      const { attachmentId, sessionId } = await ipc.create(event);
      const parent = await ipc.submit(
        event,
        attachmentId,
        "parent",
        "Continue the parent task."
      );
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(1));
      const side = await ipc.openSideChat(event, attachmentId);
      expect(side).toEqual({
        attachmentId: expect.any(String),
        sessionId: expect.stringMatching(/^side\//),
        parentSessionId: sessionId,
        compacted: false,
        omitted: expect.any(Boolean),
      });
      // Each open is another side chat of the same parent.
      const sibling = await ipc.openSideChat(event, attachmentId);
      expect(sibling.parentSessionId).toBe(sessionId);
      expect(sibling.sessionId).not.toBe(side.sessionId);
      // A side chat shows none of the conversation it inherited.
      expect(await ipc.transcript(event, side.attachmentId)).toEqual([]);
      // Another frame of the same child cannot load or name the side chat.
      await expect(ipc.load(other, side.sessionId)).rejects.toThrow(
        "native_chat_side_unavailable"
      );
      await expect(ipc.observe(other, side.attachmentId)).rejects.toThrow(
        "native_chat_attachment_unavailable"
      );

      const observed = await ipc.observe(event, side.attachmentId);
      expect(observed.snapshot.side).toEqual({
        parentSessionId: sessionId,
        temporary: true,
        unavailable: expect.arrayContaining(["side_chat", "catalog"]),
      });
      const asked = await ipc.submit(
        event,
        side.attachmentId,
        randomUUID(),
        "Explain one decision."
      );
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(2));
      await vi.waitFor(async () => {
        const settled = await ipc.observe(event, side.attachmentId);
        expect(settled.snapshot.latest?.turnId).toBe(asked.turnId);
        expect(settled.snapshot.latest?.status).toBe("succeeded");
      });
      const shown = JSON.stringify(
        await ipc.transcript(event, side.attachmentId)
      );
      expect(shown).toContain("Explain one decision.");
      expect(shown).toContain("The separate answer.");
      expect(shown).not.toContain("Continue the parent task.");

      const current = await ipc.observe(event, attachmentId);
      expect(current.snapshot.current?.turnId).toBe(parent.turnId);
      await ipc.closeSideChat(event, side.attachmentId);
      await expect(ipc.observe(event, side.attachmentId)).rejects.toThrow(
        "native_chat_attachment_unavailable"
      );
      // Its sibling stays open until it is closed too.
      await ipc.observe(event, sibling.attachmentId);
      await ipc.closeSideChat(event, sibling.attachmentId);
      endpoint.releaseParent();
      await vi.waitFor(async () => {
        const settled = await ipc.observe(event, attachmentId);
        expect(settled.snapshot.current).toBeNull();
        expect(settled.snapshot.latest?.turnId).toBe(parent.turnId);
      });
      const transcript = JSON.stringify(
        await ipc.transcript(event, attachmentId)
      );
      expect(transcript).toContain("Parent partial.");
      expect(transcript).not.toContain("The separate answer.");
      const listed = await ipc.list(event);
      expect(listed.sessionIds).not.toContain(side.sessionId);
    } finally {
      try {
        await chat?.close();
      } finally {
        await endpoint.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  },
  20_000
);
