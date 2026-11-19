import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeAgentSideChats } from "./native-agent-side-chats";
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
        expect(settled.snapshot.side?.title).toBe("Explain one decision.");
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

const OPEN = "_co.grida/side-chat/open";
const CLOSE = "_co.grida/side-chat/close";
const SIDE = "side/0123456789abcdef0123456789abcdef";

function opened(parent = "parent", sideChatId = SIDE) {
  return {
    sideChatId,
    parentSessionId: parent,
    sourceContext: { view: 1, tail: null, fingerprint: "f" },
    compacted: false,
    omissions: {},
    temporary: true,
  };
}

function owner() {
  const request =
    vi.fn<(method: string, params: unknown) => Promise<unknown>>();
  const discarded = vi.fn<(id: string) => void>();
  return {
    request,
    discarded,
    sides: new NativeAgentSideChats(request, discarded),
    calls: (method: string) =>
      request.mock.calls.filter(([called]) => called === method),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

it("keeps discarding a side chat until the host confirms it is gone", async () => {
  vi.useFakeTimers();
  const { request, discarded, sides, calls } = owner();
  request.mockResolvedValueOnce(opened());
  const side = await sides.open("parent");

  // The first attempt and its immediate retry stay unconfirmed.
  request.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
  request.mockRejectedValueOnce(new Error("side_chat_discard_pending"));
  await expect(sides.close(side.id)).rejects.toThrow(
    "side_chat_discard_pending"
  );
  expect(sides.has(side.id)).toBe(true);
  expect(discarded).not.toHaveBeenCalled();

  // Main keeps the side chat and retries with backoff.
  request.mockRejectedValueOnce(new Error("side_chat_discard_pending"));
  request.mockRejectedValueOnce(new Error("side_chat_discard_pending"));
  await vi.advanceTimersByTimeAsync(1_000);
  expect(calls(CLOSE)).toHaveLength(4);
  expect(sides.has(side.id)).toBe(true);

  // A retry after a close whose reply was lost finds the side chat gone.
  request.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
  request.mockRejectedValueOnce(new Error("side_chat_unavailable"));
  await vi.advanceTimersByTimeAsync(2_000);
  expect(calls(CLOSE)).toHaveLength(6);
  expect(
    calls(CLOSE).every(([, params]) => {
      return JSON.stringify(params) === JSON.stringify({ sideChatId: SIDE });
    })
  ).toBe(true);
  expect(sides.has(side.id)).toBe(false);
  expect(discarded).toHaveBeenCalledExactlyOnceWith(SIDE);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(calls(CLOSE)).toHaveLength(6);
});

it("repeats a timed-out open with the same request and gets the same side chat", async () => {
  const { request, sides, calls } = owner();
  request.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
  request.mockResolvedValueOnce(opened());
  expect((await sides.open("parent")).id).toBe(SIDE);
  const [[, first], [, second]] = calls(OPEN) as [
    [string, { sessionId: string; requestId: string }],
    [string, { sessionId: string; requestId: string }],
  ];
  expect(first.sessionId).toBe("parent");
  expect(first.requestId).toEqual(expect.any(String));
  expect(second).toEqual(first);
  expect(sides.has(SIDE)).toBe(true);
});

it("finds and discards a side chat whose open never answered", async () => {
  vi.useFakeTimers();
  const { request, discarded, sides, calls } = owner();
  request.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
  request.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
  await expect(sides.open("parent")).rejects.toThrow(
    "native_agent_request_timeout"
  );
  // The host opened it after all; the same request names it.
  request.mockResolvedValueOnce(opened());
  request.mockResolvedValueOnce({});
  await vi.advanceTimersByTimeAsync(1_000);
  const keys = calls(OPEN).map(
    ([, params]) => (params as { requestId: string }).requestId
  );
  expect(new Set(keys).size).toBe(1);
  expect(keys).toHaveLength(3);
  expect(calls(CLOSE)).toEqual([[CLOSE, { sideChatId: SIDE }]]);
  expect(sides.has(SIDE)).toBe(false);
  expect(discarded).toHaveBeenCalledExactlyOnceWith(SIDE);
});

it("stops repeating an open the host refused", async () => {
  vi.useFakeTimers();
  const { request, sides, calls } = owner();
  request.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
  request.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
  await expect(sides.open("parent")).rejects.toThrow(
    "native_agent_request_timeout"
  );
  request.mockRejectedValueOnce(new Error("side_chat_parent_limit"));
  await vi.advanceTimersByTimeAsync(1_000);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(calls(OPEN)).toHaveLength(3);
  expect(calls(CLOSE)).toHaveLength(0);
});

it("keeps a side chat whose reply is invalid until its discard is confirmed", async () => {
  vi.useFakeTimers();
  const { request, discarded, sides, calls } = owner();
  request.mockResolvedValueOnce({ ...opened(), parentSessionId: "other" });
  request.mockRejectedValueOnce(new Error("side_chat_discard_pending"));
  request.mockRejectedValueOnce(new Error("side_chat_discard_pending"));
  await expect(sides.open("parent")).rejects.toThrow(
    "native_chat_side_protocol_invalid"
  );
  await vi.advanceTimersByTimeAsync(0);
  // Still a side chat: no other attachment may load it.
  expect(sides.has(SIDE)).toBe(true);
  request.mockResolvedValueOnce({});
  await vi.advanceTimersByTimeAsync(1_000);
  expect(calls(CLOSE)).toHaveLength(3);
  expect(sides.has(SIDE)).toBe(false);
  expect(discarded).toHaveBeenCalledExactlyOnceWith(SIDE);
});

it("stops retrying when the connection ends or the parent is deleted", async () => {
  vi.useFakeTimers();
  const { request, sides, calls } = owner();
  request.mockResolvedValueOnce(opened("parent", `${SIDE}a`));
  request.mockResolvedValueOnce(opened("parent", `${SIDE}b`));
  await sides.open("parent");
  await sides.open("parent");
  request.mockRejectedValue(new Error("side_chat_discard_pending"));
  await expect(sides.close(`${SIDE}a`)).rejects.toThrow(
    "side_chat_discard_pending"
  );
  expect(sides.forgetParent("parent")).toEqual([`${SIDE}a`, `${SIDE}b`]);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(calls(CLOSE)).toHaveLength(2);

  request.mockReset();
  request.mockResolvedValueOnce(opened("other", `${SIDE}c`));
  await sides.open("other");
  request.mockRejectedValue(new Error("native_agent_request_timeout"));
  await expect(sides.close(`${SIDE}c`)).rejects.toThrow(
    "native_agent_request_timeout"
  );
  sides.clear();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(calls(CLOSE)).toHaveLength(2);
});
