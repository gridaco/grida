import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeAgentCommands } from "./native-agent-commands";
import { NativeChatIpc } from "./native-chat-ipc";

const basis = {
  view: 2,
  tail: { turn: "latest", ordinal: 4, position: 6 },
  fingerprint: "0c".repeat(32),
};
const latestAnchor = { kind: "turn", turn: "latest", message: "answer" };

describe("native chat commands", () => {
  it("replays an unverified fork against the original latest anchor and basis", async () => {
    const request =
      vi.fn<(method: string, params: unknown) => Promise<unknown>>();
    request.mockResolvedValueOnce({
      basis,
      latestAnchor,
      nextOffset: 128,
      messages: [],
    });
    request.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
    request.mockResolvedValueOnce({ sessionId: "forked" });
    const commands = new NativeAgentCommands(request);
    const session = { id: "source" };
    await expect(
      commands.run(session, "fork", "stable", () => {})
    ).rejects.toThrow("native_chat_command_unverified");
    await expect(
      commands.run(session, "fork", "stable", () => {})
    ).resolves.toEqual({ command: "fork", sessionId: "forked" });
    expect(request.mock.calls).toEqual([
      ["_co.grida/session/history", { sessionId: "source" }],
      [
        "_co.grida/session/fork",
        {
          sessionId: "source",
          requestId: "stable",
          expectedHistory: basis,
          anchor: latestAnchor,
        },
      ],
      [
        "_co.grida/session/fork",
        {
          sessionId: "source",
          requestId: "stable",
          expectedHistory: basis,
          anchor: latestAnchor,
        },
      ],
    ]);
    expect(request.mock.calls[2]?.[1]).toBe(request.mock.calls[1]?.[1]);
  });

  it("supports an exact single-page older history and withholds an unprovable long-history fork", async () => {
    const request =
      vi.fn<(method: string, params: unknown) => Promise<unknown>>();
    request.mockResolvedValueOnce({
      basis,
      nextOffset: 128,
      messages: [{ anchor: latestAnchor }],
    });
    request.mockResolvedValueOnce({
      basis,
      nextOffset: null,
      messages: [{ anchor: latestAnchor }],
    });
    request.mockResolvedValueOnce({ sessionId: "forked" });
    const commands = new NativeAgentCommands(request);
    const session = { id: "source" };
    await expect(
      commands.run(session, "fork", "long", () => {})
    ).rejects.toThrow("native_chat_fork_tail_unavailable");
    await expect(
      commands.run(session, "fork", "short", () => {})
    ).resolves.toEqual({ command: "fork", sessionId: "forked" });
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "_co.grida/session/history",
      "_co.grida/session/history",
      "_co.grida/session/fork",
    ]);
  });

  it("rechecks attachment before dispatch and retains an exact compaction status", async () => {
    const request =
      vi.fn<(method: string, params: unknown) => Promise<unknown>>();
    request.mockResolvedValueOnce({ basis, latestAnchor });
    request.mockResolvedValueOnce({
      turnId: "compact/observed",
      status: "stopped",
    });
    const commands = new NativeAgentCommands(request);
    const session = { id: "source" };
    await expect(
      commands.run(session, "fork", "retired", () => {
        throw new Error("retired attachment");
      })
    ).rejects.toThrow("retired attachment");
    await expect(
      commands.run(session, "compact", "exact", () => {})
    ).resolves.toEqual({
      command: "compact",
      turnId: "compact/observed",
      status: "stopped",
    });
    expect(request.mock.calls).toEqual([
      ["_co.grida/session/history", { sessionId: "source" }],
      [
        "_co.grida/session/compact",
        { sessionId: "source", requestId: "exact" },
      ],
    ]);
  });
});

const packaged = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

it.runIf(Boolean(packaged))(
  "drives exact fork and Stop of compaction through Main and the built host",
  async () => {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), "grida-chat-commands-")
    );
    const cwd = path.join(root, "workspace");
    fs.mkdirSync(cwd, { mode: 0o700 });
    const requests: string[] = [];
    const provider = createServer((request, response) => {
      request.setEncoding("utf8");
      let body = "";
      request.on("data", (part: string) => {
        body += part;
      });
      request.on("end", () => {
        requests.push(body);
        const chunk = (delta: unknown, reason: string | null) =>
          `data: ${JSON.stringify({ id: `response-${requests.length}`, choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`;
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write(
          chunk(
            {
              role: "assistant",
              content:
                requests.length === 1
                  ? "Original reply."
                  : "Uncommitted summary",
            },
            null
          )
        );
        if (requests.length === 1)
          response.end(chunk({}, "stop") + "data: [DONE]\n\n");
      });
    });
    provider.listen(0, "127.0.0.1");
    let chat: NativeAgentChat | undefined;
    try {
      await once(provider, "listening");
      const address = provider.address();
      if (!address || typeof address === "string")
        throw new Error("fixture_listener_unavailable");
      chat = await NativeAgentChat.start({
        resourcesPath: packaged!,
        stateDirectory: path.join(root, "state"),
        cwd,
        provider: "openai-compatible",
        endpoint: `http://127.0.0.1:${address.port}/v1`,
        model: "fixture",
      });
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
      const active = { workspaceId: "workspace", chat };
      const ipc = new NativeChatIpc(origin, (candidate) =>
        candidate === sender ? active : null
      );
      const source = await ipc.create(event);
      expect(ipc.commands(event, source.attachmentId)).toEqual([
        "compact",
        "fork",
      ]);
      await ipc.submit(
        event,
        source.attachmentId,
        "original",
        "Keep the original requirements in the transcript. ".repeat(28)
      );
      await vi.waitFor(
        async () => {
          const observed = await ipc.observe(event, source.attachmentId);
          expect(observed.snapshot.current).toBeNull();
          expect(observed.snapshot.latest?.status).toBe("succeeded");
        },
        { timeout: 5000 }
      );
      const requestId = randomUUID();
      const fork = await ipc.runCommand(
        event,
        source.attachmentId,
        "fork",
        requestId
      );
      expect(fork.command).toBe("fork");
      if (fork.command !== "fork") throw new Error("fixture_fork_missing");
      expect(
        await ipc.runCommand(event, source.attachmentId, "fork", requestId)
      ).toEqual(fork);
      expect([...(await ipc.list(event)).sessionIds].sort()).toEqual(
        [source.sessionId, fork.sessionId].sort()
      );
      const copied = await ipc.load(event, fork.sessionId);
      expect(
        (await ipc.transcript(event, copied.attachmentId)).some(
          (message) => message.text === "Original reply."
        )
      ).toBe(true);
      const compactId = randomUUID();
      const pending = ipc.runCommand(
        event,
        source.attachmentId,
        "compact",
        compactId
      );
      await vi.waitFor(() => expect(requests).toHaveLength(2), {
        timeout: 5000,
      });
      const current = await ipc.observe(event, source.attachmentId);
      expect(current.snapshot.current?.turnId).toMatch(/^compact\//);
      await ipc.control(event, source.attachmentId, {
        action: "stop",
        observationId: current.observationId,
        requestId: randomUUID(),
      });
      const outcome = await pending;
      expect(outcome).toMatchObject({
        command: "compact",
        status: "uncertain",
        turnId: current.snapshot.current?.turnId,
      });
      expect(
        await ipc.runCommand(event, source.attachmentId, "compact", compactId)
      ).toEqual(outcome);
      expect(
        (await ipc.transcript(event, source.attachmentId)).some(
          (message) => message.text === "Original reply."
        )
      ).toBe(true);
      expect(requests).toHaveLength(2);
      expect(requests.join("\n")).not.toMatch(/\/(?:compact|fork)\b/);
      expect(JSON.parse(requests[1]!).tools).toBeUndefined();
    } finally {
      await chat?.close();
      const closed = once(provider, "close");
      provider.close();
      provider.closeAllConnections();
      await closed;
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
  30_000
);
