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
      if (request.url !== "/v1/chat/completions" || index > 4) {
        response.writeHead(400).end();
        return;
      }
      const text = [
        "Parent partial.",
        "The separate answer.",
        "Side work held.",
        "Parent finished independently.",
      ][index - 1];
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(chunk(index, { role: "assistant", content: text }));
      if (index === 1) parent = response;
      if (index === 2 || index === 4)
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
  "keeps temporary side questions separate while the parent continues through the same private child",
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
        candidate === sender ? active : null
      );
      const { attachmentId } = await ipc.create(event);
      const parent = await ipc.submit(
        event,
        attachmentId,
        "parent",
        "Continue the parent task."
      );
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(1));
      const openId = randomUUID();
      const opened = await ipc.openSideChat(event, attachmentId, openId);
      expect(opened).toEqual({
        sourceRevision: expect.any(Number),
        compacted: false,
        truncated: false,
        omitted: false,
      });
      await expect(
        ipc.openSideChat(event, attachmentId, openId)
      ).resolves.toEqual(opened);
      expect(endpoint.requests).toHaveLength(1);

      const requestId = randomUUID();
      const first = await ipc.askSideChat(
        event,
        attachmentId,
        openId,
        requestId,
        "Explain one decision."
      );
      expect(first).toEqual({
        turnId: expect.any(String),
        status: "succeeded",
        text: "The separate answer.",
        textTruncated: false,
      });
      expect(endpoint.requests[1].tools).toBeUndefined();
      expect(JSON.stringify(endpoint.requests[1].messages)).toContain(
        "Continue the parent task."
      );
      expect(JSON.stringify(endpoint.requests[1].messages)).not.toContain(
        "Parent partial."
      );
      await expect(
        ipc.askSideChat(
          event,
          attachmentId,
          openId,
          requestId,
          "Explain one decision."
        )
      ).resolves.toEqual(first);
      await expect(
        ipc.askSideChat(event, attachmentId, openId, requestId, "Changed.")
      ).rejects.toThrow("submission_input_changed");
      expect(endpoint.requests).toHaveLength(2);

      const held = ipc.askSideChat(
        event,
        attachmentId,
        openId,
        randomUUID(),
        "Follow up on that."
      );
      const retired = held.catch((error: unknown) => error);
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(3));
      expect(JSON.stringify(endpoint.requests[2].messages)).toContain(
        "The separate answer."
      );
      const current = await ipc.observe(event, attachmentId);
      expect(current.snapshot.current?.turnId).toBe(parent.turnId);
      await ipc.steer(event, attachmentId, {
        observationId: current.observationId,
        requestId: "parent-correction",
        text: "Adjust the parent task.",
      });
      endpoint.releaseParent();
      await vi.waitFor(() => expect(endpoint.requests).toHaveLength(4));
      expect(JSON.stringify(endpoint.requests[3].messages)).toContain(
        "Adjust the parent task."
      );
      expect(JSON.stringify(endpoint.requests[3].messages)).not.toContain(
        "The separate answer."
      );
      await ipc.closeSideChat(event, attachmentId, openId);
      const failure = await retired;
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(
        /side_chat_turn_unsettled|native_chat_side_unavailable/
      );
      await expect(
        ipc.askSideChat(
          event,
          attachmentId,
          openId,
          randomUUID(),
          "After close."
        )
      ).rejects.toThrow("native_chat_side_unavailable");
      await vi.waitFor(async () => {
        const settled = await ipc.observe(event, attachmentId);
        expect(settled.snapshot.current).toBeNull();
        expect(settled.snapshot.latest?.turnId).toBe(parent.turnId);
        expect(settled.snapshot.latest?.status).toBe("succeeded");
      });
      const transcript = await ipc.transcript(event, attachmentId);
      expect(JSON.stringify(transcript)).toContain(
        "Parent finished independently."
      );
      expect(JSON.stringify(transcript)).not.toContain("The separate answer.");
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
