import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NativeChatStreamUpdate } from "@grida/desktop-bridge";
import { describe, expect, it, vi } from "vitest";
import { NativeAgentBackgroundProcesses } from "./native-agent-background-processes";
import { NativeAgentChat } from "./native-agent-chat";

const CAPABILITY = NativeAgentBackgroundProcesses.capability;
const PROCESS = {
  processId: 3,
  command: "pnpm dev",
  cwd: "/fixture/workspace",
  terminal: true,
  startedAt: 1_700_000_000_000,
  state: "running",
  exitCode: null,
} as const;
const ENDED = {
  ...PROCESS,
  processId: 1,
  command: "pnpm test",
  terminal: false,
  state: "ended",
  exitCode: 1,
} as const;

/** A scripted agent that echoes requested capabilities unless overridden. */
function agent(offered: Record<string, number | null> = {}) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "grida-native-background-processes-")
  );
  const resources = path.join(root, "native-agent");
  const log = path.join(root, "requests.jsonl");
  fs.mkdirSync(resources, { mode: 0o700 });
  fs.writeFileSync(
    path.join(resources, "grida-agent"),
    `#!${process.execPath}
const fs = require('node:fs');
const readline = require('node:readline');
const lines = readline.createInterface({input:process.stdin});
const send = (value) => process.stdout.write(JSON.stringify({jsonrpc:'2.0',...value})+'\\n');
const processes = ${JSON.stringify([PROCESS, ENDED])};
lines.on('line', line => {
  const request = JSON.parse(line);
  if (request.method === 'initialize') {
    const meta = {...request.params.clientCapabilities._meta, ...${JSON.stringify(offered)}};
    for (const key of Object.keys(meta)) if (meta[key] === null) delete meta[key];
    send({id:request.id,result:{protocolVersion:1,agentInfo:{name:'grida-agent'},agentCapabilities:{_meta:meta}}});
    return;
  }
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(request) + '\\n');
  const params = request.params;
  if (request.method === 'session/new') {
    send({id:request.id,result:{sessionId:'chat'}});
    return;
  }
  if (request.method === '_co.grida/session/processes') {
    send({method:'session/update',params:{sessionId:params.sessionId,
      _meta:{${JSON.stringify(CAPABILITY)}:{processes}},
      update:{sessionUpdate:'agent_message_chunk',messageId:'processes',content:{type:'text',text:''}}}});
    send({id:request.id,result:{sessionId:params.sessionId,processes}});
    return;
  }
  if (request.method === '_co.grida/session/stop-processes') {
    send({id:request.id,result:{sessionId:params.sessionId,stopped:params.processIds ?? [3]}});
    return;
  }
  if (request.method === '_co.grida/session/enqueue') {
    send({id:request.id,result:{sessionId:params.sessionId,inputId:params.inputId,inputPosition:2,turnId:null,disposition:'queued'}});
    return;
  }
  send({id:request.id,result:{}});
});
`,
    { mode: 0o700 }
  );
  const start = () =>
    NativeAgentChat.start({
      resourcesPath: root,
      stateDirectory: path.join(root, "state"),
      provider: "openai-compatible",
      endpoint: "http://127.0.0.1:1/v1",
      model: "fixture",
      cwd: fs.realpathSync(root),
    });
  const requests = (): { method: string; params: Record<string, unknown> }[] =>
    fs.existsSync(log)
      ? fs
          .readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
  return {
    start,
    requests,
    close: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

describe.skipIf(process.platform === "win32")(
  "Native agent background processes",
  () => {
    it("lists, stops and forwards the live list for a negotiated chat", async () => {
      const fixture = agent();
      let chat: NativeAgentChat | undefined;
      try {
        chat = await fixture.start();
        expect(chat.acceptsBackgroundProcesses).toBe(true);
        const session = await chat.create();
        const live: NativeChatStreamUpdate[] = [];
        chat.subscribe(session, (update) => live.push(update));
        expect(await chat.listBackgroundProcesses(session)).toEqual([
          PROCESS,
          ENDED,
        ]);
        await vi.waitFor(() =>
          expect(live).toEqual([
            { kind: "processes", processes: [PROCESS, ENDED] },
          ])
        );
        expect(await chat.stopBackgroundProcesses(session, [3])).toEqual([3]);
        expect(await chat.stopBackgroundProcesses(session)).toEqual([3]);
        await expect(chat.stopBackgroundProcesses(session, [])).rejects.toThrow(
          "native_chat_background_processes_invalid"
        );
        const sent = fixture
          .requests()
          .filter((request) => request.method.includes("processes"));
        expect(sent).toEqual([
          expect.objectContaining({
            method: "_co.grida/session/processes",
            params: { sessionId: "chat" },
          }),
          expect.objectContaining({
            method: "_co.grida/session/stop-processes",
            params: { sessionId: "chat", processIds: [3] },
          }),
          expect.objectContaining({
            method: "_co.grida/session/stop-processes",
            params: { sessionId: "chat" },
          }),
        ]);
      } finally {
        try {
          await chat?.close();
        } finally {
          fixture.close();
        }
      }
    });

    it("refuses process controls and drops live lists when not negotiated", async () => {
      const fixture = agent({ [CAPABILITY]: null });
      let chat: NativeAgentChat | undefined;
      try {
        chat = await fixture.start();
        expect(chat.acceptsBackgroundProcesses).toBe(false);
        const session = await chat.create();
        await expect(chat.listBackgroundProcesses(session)).rejects.toThrow(
          "native_chat_background_processes_unavailable"
        );
        await expect(chat.stopBackgroundProcesses(session)).rejects.toThrow(
          "native_chat_background_processes_unavailable"
        );
        expect(
          fixture
            .requests()
            .some((request) => request.method.includes("processes"))
        ).toBe(false);
      } finally {
        try {
          await chat?.close();
        } finally {
          fixture.close();
        }
      }
    });

    it("sends a queued Act request with its editor binding", async () => {
      const fixture = agent();
      let chat: NativeAgentChat | undefined;
      try {
        chat = await fixture.start();
        const session = await chat.create();
        const binding = {
          editorEndpointId: "0b6f7c3e-8d7f-4a8e-9c55-0f1f6f2c4a10",
          editorPresentation: true,
        } as const;
        await chat.enqueue(session, "queued-act", "Open it.", "act", binding);
        await chat.enqueue(session, "queued-plan", "Plan it.", "plan", binding);
        const enqueued = fixture
          .requests()
          .filter((request) => request.method === "_co.grida/session/enqueue");
        expect(enqueued[0]?.params).toMatchObject({
          inputId: "queued-act",
          operatingRegime: "act",
          ...binding,
        });
        expect(enqueued[1]?.params).not.toHaveProperty("editorEndpointId");
      } finally {
        try {
          await chat?.close();
        } finally {
          fixture.close();
        }
      }
    });
  }
);

describe("NativeAgentBackgroundProcesses", () => {
  it("rejects replies for another session or for processes not named", async () => {
    const request =
      vi.fn<(method: string, params: unknown) => Promise<unknown>>();
    const processes = new NativeAgentBackgroundProcesses(request);
    request.mockResolvedValueOnce({ sessionId: "other", processes: [] });
    await expect(processes.list("chat")).rejects.toThrow(
      "native_chat_background_processes_invalid"
    );
    request.mockResolvedValueOnce({ sessionId: "chat", stopped: [4] });
    await expect(processes.stop("chat", [3])).rejects.toThrow(
      "native_chat_background_processes_invalid"
    );
    await expect(processes.stop("chat", ["3"])).rejects.toThrow(
      "native_chat_background_processes_invalid"
    );
  });

  it.each([
    ["a running process with an exit code", { ...PROCESS, exitCode: 0 }],
    ["a relative directory", { ...PROCESS, cwd: "workspace" }],
    ["an unknown state", { ...PROCESS, state: "paused" }],
    ["an empty command", { ...PROCESS, command: "" }],
  ])("rejects a live list with %s", (_, entry) => {
    expect(() =>
      NativeAgentBackgroundProcesses.readUpdate({ processes: [entry] })
    ).toThrow("native_chat_background_processes_invalid");
  });

  it("rejects duplicate process ids", () => {
    expect(() =>
      NativeAgentBackgroundProcesses.read([PROCESS, PROCESS])
    ).toThrow("native_chat_background_processes_invalid");
  });
});
