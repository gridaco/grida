import { once } from "node:events";
import fs from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import type { NativeChatStreamUpdate } from "@grida/desktop-bridge";
import {
  NativeAgentChat,
  type NativeAgentChatLaunch,
} from "./native-agent-chat";
import { NativeAgentProcess } from "./native-agent-process";
import {
  NativeChatCatalog,
  readClosedChatCatalog,
} from "./native-chat-catalog";

const packaged = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

function fixture() {
  const root = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "grida-native-chat-")
  );
  const cwd = path.join(root, "workspace");
  fs.mkdirSync(cwd, { mode: 0o700 });
  return {
    root,
    cwd,
    stateDirectory: path.join(root, "state"),
    close: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

async function heldProvider() {
  const prompts: string[] = [];
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    let body = "";
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      prompts.push(body);
      if (
        request.method !== "POST" ||
        request.url !== "/v1/chat/completions" ||
        prompts.length > 2
      ) {
        response.writeHead(400).end();
        return;
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (prompts.length === 1) {
        for (const promptTokens of [4, 7, 7]) {
          response.write(
            `data: ${JSON.stringify({
              id: "fixture-1",
              choices: [],
              usage: {
                prompt_tokens: promptTokens,
                prompt_tokens_details: { cached_tokens: 0 },
              },
            })}\n\n`
          );
        }
      }
      response.write(
        `data: ${JSON.stringify({
          id: `fixture-${prompts.length}`,
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: "Working" },
              finish_reason: null,
            },
          ],
        })}\n\n`
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture_listener_unavailable");
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    prompts,
    close: async () => {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

function chatChunk(delta: unknown, finishReason: "stop" | null = null) {
  return `data: ${JSON.stringify({
    id: "fixture",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

function finishReply(text: string) {
  return (response: ServerResponse) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(
      chatChunk({ role: "assistant", content: text }) +
        chatChunk({}, "stop") +
        "data: [DONE]\n\n"
    );
  };
}

async function scriptedProvider(
  replies: ReadonlyArray<(response: ServerResponse) => void>
) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    request.setEncoding("utf8");
    let body = "";
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      const reply = replies[requests.length];
      requests.push(body);
      if (
        request.method !== "POST" ||
        request.url !== "/v1/chat/completions" ||
        !reply
      ) {
        response.writeHead(400).end();
        return;
      }
      reply(response);
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
    close: async () => {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

it("rejects a chat launch outside the main-selected workspace", async () => {
  const test = fixture();
  try {
    await expect(
      NativeAgentChat.start({
        resourcesPath: test.root,
        stateDirectory: test.stateDirectory,
        cwd: test.root,
        endpoint: "http://127.0.0.1:1/v1",
        provider: "openai-compatible",
        model: "fixture",
        workspace: {
          id: "workspace",
          primary: { id: "primary", name: "Primary", path: test.cwd },
          additionalReadRoots: [],
          protectedPaths: [],
        },
      })
    ).rejects.toThrow("native_chat_workspace_invalid");
  } finally {
    test.close();
  }
});

it("projects bounded catalog activity metadata and accepts older hosts without it", async () => {
  const test = fixture();
  const request = vi.fn<NativeAgentProcess["request"]>();
  const start = vi.spyOn(NativeAgentProcess, "start").mockResolvedValueOnce({
    request,
    close: async () => {},
  } as unknown as NativeAgentProcess);
  let client: NativeAgentChat | undefined;
  try {
    client = await NativeAgentChat.start({
      resourcesPath: test.root,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      provider: "openai-compatible",
      endpoint: "http://127.0.0.1:1/v1",
      model: "fixture",
    });
    const atMs = 1_800_000_000_000;
    const dated = {
      sessionId: "dated",
      cwd: test.cwd,
      _meta: { "co.grida/lastActivityAtMs": atMs },
    };
    for (const archived of [false, true]) {
      request.mockResolvedValueOnce({
        sessions: [dated, { sessionId: "older", cwd: test.cwd }],
        _meta: {
          "co.grida/runningSessionIds": ["dated"],
          "co.grida/inputNeededSessionIds": ["older", "dated"],
        },
      });
      await expect(client.list(null, archived)).resolves.toEqual({
        sessionIds: ["dated", "older"],
        nextCursor: null,
        lastActivity: [{ sessionId: "dated", atMs }],
        ...(!archived && {
          runningSessionIds: ["dated"],
          inputNeededSessionIds: ["older", "dated"],
        }),
      });
      expect(request).toHaveBeenLastCalledWith(
        archived ? "_co.grida/session/list-archived" : "session/list",
        { cwd: test.cwd }
      );
    }
    request.mockResolvedValueOnce({
      sessions: [{ sessionId: "older", cwd: test.cwd }],
    });
    await expect(client.list()).resolves.toEqual({
      sessionIds: ["older"],
      nextCursor: null,
    });
    request.mockResolvedValueOnce({
      sessions: [],
      _meta: { "co.grida/runningSessionIds": [] },
    });
    await expect(client.list()).resolves.toMatchObject({
      runningSessionIds: [],
    });
    for (const key of [
      "co.grida/runningSessionIds",
      "co.grida/inputNeededSessionIds",
    ])
      for (const invalid of [
        null,
        "dated",
        ["outside-page"],
        ["dated", "dated"],
      ]) {
        request.mockResolvedValueOnce({
          sessions: [dated, { sessionId: "older", cwd: test.cwd }],
          _meta: { [key]: invalid },
        });
        await expect(client.list()).rejects.toThrow(
          "native_chat_invalid_protocol_value"
        );
      }
    for (const invalid of [null, -1, 1.5, "today", 8_640_000_000_000_001]) {
      request.mockResolvedValueOnce({
        sessions: [
          { ...dated, _meta: { "co.grida/lastActivityAtMs": invalid } },
        ],
      });
      await expect(client.list()).rejects.toThrow(
        "native_chat_invalid_protocol_value"
      );
    }
    request.mockResolvedValueOnce({ sessionId: "dated" });
    const session = await client.create();
    const entry = {
      sessionId: "dated",
      revision: 1,
      title: null,
      archived: false,
    };
    request.mockResolvedValueOnce({ ...entry, lastActivityAtMs: atMs });
    await expect(client.catalogEntry(session)).resolves.toEqual({
      ...entry,
      lastActivityAtMs: atMs,
    });
    request.mockResolvedValueOnce(entry);
    await expect(client.catalogEntry(session)).resolves.toEqual(entry);
    request.mockResolvedValueOnce({
      ...entry,
      title: "First line",
      titleGenerationPending: true,
    });
    await expect(client.catalogEntry(session)).resolves.toEqual({
      ...entry,
      title: "First line",
      titleGenerationPending: true,
    });
    request.mockResolvedValueOnce({ ...entry, lastActivityAtMs: -1 });
    await expect(client.catalogEntry(session)).rejects.toThrow(
      "native_chat_invalid_protocol_value"
    );
  } finally {
    await client?.close();
    start.mockRestore();
    test.close();
  }
});

it("sends image-only batches without introducing synthetic prompt text", async () => {
  const test = fixture();
  const sessionId = "fixture-image-session";
  const inputId = "fixture-image-input";
  const request = vi.fn<NativeAgentProcess["request"]>();
  const start = vi.spyOn(NativeAgentProcess, "start").mockResolvedValueOnce({
    request,
    connected: true,
    acceptsAttachmentBatches: true,
    supportsSelectedImage: true,
    acceptsPng: true,
    close: async () => {},
  } as unknown as NativeAgentProcess);
  let client: NativeAgentChat | undefined;
  try {
    client = await NativeAgentChat.start({
      resourcesPath: test.root,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      protectedPaths: [],
      endpoint: "http://127.0.0.1:1/v1",
      provider: "openai-compatible",
      model: "fixture",
    });
    request.mockResolvedValueOnce({});
    const session = await client.load(sessionId);
    const input = {
      action: "enqueue",
      inputId,
      text: "",
      operatingRegime: "act",
    };
    const image = {
      kind: "image",
      name: "first.png",
      bytes: new Uint8Array([1]).buffer,
    };
    const file = {
      kind: "file",
      name: "description.txt",
      bytes: new Uint8Array([2]).buffer,
    };
    request.mockClear();
    await expect(
      client.submitAttachments(session, {
        ...input,
        attachments: [image, file],
      })
    ).rejects.toThrow("native_chat_text_invalid");
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce({
      sessionId,
      inputId,
      disposition: "queued",
      inputPosition: 1,
      turnId: null,
    });
    await expect(
      client.submitAttachments(session, {
        ...input,
        attachments: [image, { ...image, name: "second.png" }],
      })
    ).resolves.toMatchObject({ inputId });
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "_co.grida/session/enqueue",
      expect.objectContaining({
        prompt: [],
        attachments: [
          {
            kind: "image",
            selection: expect.objectContaining({ name: "first.png" }),
          },
          {
            kind: "image",
            selection: expect.objectContaining({ name: "second.png" }),
          },
        ],
      })
    );
  } finally {
    await client?.close();
    start.mockRestore();
    test.close();
  }
});

it("uses the observed turn for queued steering and recovers committed checkout receipts", async () => {
  const test = fixture();
  const sessionId = "fixture-queue-session";
  const inputId = "queued-input";
  const request =
    vi.fn<
      (method: string, input?: Record<string, unknown>) => Promise<unknown>
    >();
  const start = vi.spyOn(NativeAgentProcess, "start").mockResolvedValueOnce({
    request,
    acceptsQueuedMessages: true,
    acceptsQueueActions: true,
    close: async () => {},
  } as unknown as NativeAgentProcess);
  let client: NativeAgentChat | undefined;
  const active = {
    turnId: "original-turn",
    epoch: 1,
    journalPosition: 1,
    historyPosition: 1,
    controlRevision: 2,
    disposition: "running",
    status: null,
    paused: false,
    cancelled: false,
  };
  const snapshot = {
    sessionId,
    sessionRevision: 10,
    queuedInputs: 1,
    queue: [
      {
        inputId,
        inputPosition: 1,
        settings: {},
        checkoutable: true,
        steerable: true,
      },
    ],
    admissionPaused: false,
    current: active,
    latest: null,
  };
  try {
    client = await NativeAgentChat.start({
      resourcesPath: test.root,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      endpoint: "http://127.0.0.1:1/v1",
      provider: "openai-compatible",
      model: "fixture",
    });
    request.mockResolvedValueOnce({});
    const session = await client.load(sessionId);
    request.mockResolvedValueOnce(snapshot);
    const observed = await client.observe(session);
    expect(observed.queueActionRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(observed.queuePreview?.items[0]).toMatchObject({
      inputId,
      checkoutable: true,
      steerable: true,
    });
    const waiting = {
      ...snapshot,
      queuedInputs: 9,
      queue: Array.from({ length: 9 }, (_, index) => ({
        ...snapshot.queue[0],
        inputId: `queued-${index}`,
        inputPosition: index,
      })),
    };
    request.mockResolvedValueOnce(waiting);
    const steerable = await client.observe(session);
    waiting.queue[8] = { ...waiting.queue[8], steerable: false };
    request.mockResolvedValueOnce(waiting);
    const ineligible = await client.observe(session);
    expect(steerable.sessionRevision).toBe(ineligible.sessionRevision);
    expect(steerable.queuePreview).toEqual(ineligible.queuePreview);
    expect(steerable.queueActionRevision).not.toBe(
      ineligible.queueActionRevision
    );
    const action = {
      inputId,
      observationId: "original-observation",
      requestId: "transfer",
    };
    request.mockResolvedValueOnce({
      ...snapshot,
      sessionRevision: 11,
      current: { ...active, turnId: "successor" },
    });
    await client.observe(session);
    request.mockRejectedValueOnce(new Error("active_turn_mismatch"));
    await expect(client.steerQueued(session, observed, action)).rejects.toThrow(
      "active_turn_mismatch"
    );
    expect(request).toHaveBeenLastCalledWith("_co.grida/session/steer-queued", {
      inputId,
      task: {
        sessionId,
        requestId: "transfer",
        turnId: "original-turn",
        expectedSessionRevision: 10,
        expectedControlRevision: 2,
      },
    });
    expect(
      request.mock.calls.some(
        ([method]) => method === "_co.grida/session/withdraw"
      )
    ).toBe(false);

    const checkoutId = "checkout-request";
    const receipt = {
      sessionId,
      inputId,
      checkoutId,
      sessionRevision: 12,
      requestId: checkoutId,
      action: "checkout",
    };
    const message = {
      inputId,
      textEditable: true,
      prompt: [
        { type: "text", text: "Original" },
        {
          type: "resource_link",
          name: "still.png",
          mimeType: "image/png",
          uri: "urn:grida:retained-attachment:input/still",
          size: 12,
        },
      ],
    };
    request
      .mockResolvedValueOnce(receipt)
      .mockRejectedValueOnce(new Error("queue_checkout_unavailable"));
    await expect(
      client.checkoutQueued(session, observed, {
        ...action,
        requestId: checkoutId,
      })
    ).rejects.toThrow("native_chat_queue_action_unverified");

    request.mockResolvedValueOnce(receipt).mockResolvedValueOnce(message);
    const checked = await client.checkoutQueued(session, observed, {
      ...action,
      requestId: checkoutId,
    });
    const previewId = checked.message.attachments?.[0]?.previewId;
    expect(previewId).toBeDefined();
    expect(checked).toMatchObject({
      checkoutId,
      message: { inputId, text: "Original" },
    });
    expect(request).toHaveBeenLastCalledWith(
      "_co.grida/session/queued-message",
      {
        sessionId,
        inputId,
        checkoutId,
      }
    );
    const readCalls = request.mock.calls.length;
    await expect(
      client.readQueueCheckoutPreview(session, "different-checkout", previewId!)
    ).rejects.toThrow("queued_message_unavailable");
    expect(request).toHaveBeenCalledTimes(readCalls);

    request.mockResolvedValueOnce({ receipt });
    await expect(
      client.queueActionReceipt(session, checkoutId)
    ).resolves.toEqual(receipt);
    expect(request).toHaveBeenLastCalledWith(
      "_co.grida/session/queue-action-receipt",
      {
        sessionId,
        requestId: checkoutId,
      }
    );
    request.mockResolvedValueOnce({
      receipt: { ...receipt, sessionId: "another-chat" },
    });
    await expect(
      client.queueActionReceipt(session, checkoutId)
    ).rejects.toThrow("native_chat_invalid_protocol_value");

    const restore = {
      ...receipt,
      sessionRevision: 13,
      requestId: "restore-request",
      action: "reinsert",
    };
    const restoreRequest = { checkoutId, requestId: "restore-request" };
    request.mockRejectedValueOnce(new Error("sqlite_commit_unconfirmed"));
    await expect(
      client.reinsertQueued(session, restoreRequest)
    ).rejects.toThrow("sqlite_commit_unconfirmed");
    request.mockResolvedValueOnce(restore);
    await expect(
      client.reinsertQueued(session, restoreRequest)
    ).resolves.toEqual({ outcome: "reinserted", receipt: restore });
    expect(request).toHaveBeenLastCalledWith(
      "_co.grida/session/queue-reinsert",
      {
        sessionId,
        checkoutId,
        requestId: "restore-request",
      }
    );
  } finally {
    await client?.close();
    start.mockRestore();
    test.close();
  }
});

it("opens a saved queue passively and resumes idle queued work on an exact observation", async () => {
  const test = fixture();
  const sessionId = "fixture-queue-session";
  const saved = {
    sessionId,
    sessionRevision: 8,
    queuedInputs: 1,
    queue: [
      {
        inputId: "saved-input",
        inputPosition: 1,
        settings: {},
        preview: "Waiting message",
      },
    ],
    admissionPaused: false,
    current: null,
    latest: null,
  };
  const request =
    vi.fn<
      (method: string, input?: Record<string, unknown>) => Promise<unknown>
    >();
  const start = vi.spyOn(NativeAgentProcess, "start").mockResolvedValueOnce({
    request,
    acceptsQueuedMessages: true,
    close: async () => {},
  } as unknown as NativeAgentProcess);
  let client: NativeAgentChat | undefined;
  try {
    client = await NativeAgentChat.start({
      resourcesPath: test.root,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      endpoint: "http://127.0.0.1:1/v1",
      provider: "openai-compatible",
      model: "fixture",
    });
    request.mockResolvedValueOnce({});
    const session = await client.load(sessionId);
    const change = {
      action: "resume" as const,
      observationId: "saved-observation",
      requestId: "resume-saved",
    };
    request.mockResolvedValueOnce({
      ...saved,
      sessionRevision: 6,
      current: {
        turnId: "active",
        epoch: 1,
        journalPosition: 1,
        historyPosition: 1,
        controlRevision: 0,
        disposition: "running",
        status: null,
        paused: false,
        cancelled: false,
      },
    });
    const active = await client.observe(session);
    expect(active).not.toHaveProperty("idleQueueResumeAvailable");
    await expect(client.editQueue(session, active, change)).rejects.toThrow(
      "native_chat_queue_not_paused"
    );
    request.mockResolvedValueOnce({
      ...saved,
      sessionRevision: 7,
      queuedInputs: 0,
      queue: [],
    });
    const empty = await client.observe(session);
    expect(empty).not.toHaveProperty("idleQueueResumeAvailable");
    await expect(client.editQueue(session, empty, change)).rejects.toThrow(
      "native_chat_queue_not_paused"
    );
    request.mockResolvedValueOnce(saved);
    const observed = await client.observe(session);
    expect(observed.idleQueueResumeAvailable).toBe(true);
    expect(observed.queuePreview).toEqual({
      items: [{ inputId: "saved-input", preview: "Waiting message" }],
      offset: 0,
      previousOffset: null,
      nextOffset: null,
    });
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      "session/load",
      "_co.grida/session/snapshot",
      "_co.grida/session/snapshot",
      "_co.grida/session/snapshot",
    ]);

    request.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
    await expect(client.editQueue(session, observed, change)).rejects.toThrow(
      "native_agent_request_timeout"
    );
    request.mockResolvedValueOnce({ ...saved, sessionRevision: 9 });
    await client.observe(session);
    const receipt = {
      sessionId,
      requestId: change.requestId,
      sessionRevision: 9,
    };
    request.mockResolvedValueOnce(receipt);
    await expect(client.editQueue(session, observed, change)).resolves.toEqual(
      receipt
    );
    const call = [
      "_co.grida/session/resume-queue",
      { sessionId, requestId: change.requestId, expectedSessionRevision: 8 },
    ];
    expect(request.mock.calls[4]).toEqual(call);
    expect(request.mock.calls[6]).toEqual(call);

    // Identical durable state can also occur between two live workers.
    request.mockResolvedValueOnce({
      ...saved,
      idleQueueResumeAvailable: false,
    });
    const advancing = await client.observe(session);
    expect(advancing).not.toHaveProperty("idleQueueResumeAvailable");
    await expect(client.editQueue(session, advancing, change)).rejects.toThrow(
      "native_chat_queue_not_paused"
    );
    request.mockResolvedValueOnce({ ...saved, idleQueueResumeAvailable: true });
    expect((await client.observe(session)).idleQueueResumeAvailable).toBe(true);

    const unavailable = new Error("queued_input_image_unavailable");
    request.mockRejectedValueOnce(unavailable).mockResolvedValueOnce(saved);
    await expect(client.queue(session, observed, 0)).rejects.toBe(unavailable);
    request.mockRejectedValueOnce(unavailable).mockResolvedValueOnce({
      ...saved,
      sessionRevision: 9,
      queue: [],
      queuedInputs: 0,
    });
    await expect(client.queue(session, observed, 0)).rejects.toThrow(
      "native_chat_queue_changed"
    );
  } finally {
    await client?.close();
    start.mockRestore();
    test.close();
  }
});

it("leaves compaction unconfirmed after losing its host session during admission", async () => {
  const test = fixture();
  const reply = Promise.withResolvers<unknown>();
  const request = vi.fn<(method: string) => Promise<unknown>>(
    async (method) => {
      if (method === "session/new") return { sessionId: "fixture-session" };
      if (method === "_co.grida/session/compact/start") return reply.promise;
      throw new Error("unexpected_request");
    }
  );
  const process = {
    connected: true,
    acceptsCompactionStart: true,
    request,
    close: async () => {},
  };
  const start = vi
    .spyOn(NativeAgentProcess, "start")
    .mockResolvedValueOnce(process as unknown as NativeAgentProcess);
  let client: NativeAgentChat | undefined;
  try {
    client = await NativeAgentChat.start({
      resourcesPath: test.root,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      endpoint: "http://127.0.0.1:1/v1",
      provider: "responses",
      model: "fixture",
    });
    const session = await client.create();
    const pending = client.startCompaction(session, "request", () => {});
    expect(request).toHaveBeenLastCalledWith(
      "_co.grida/session/compact/start",
      {
        sessionId: session.id,
        requestId: "request",
      }
    );
    await client.close();
    await expect(
      client.startCompaction(session, "another-request", () => {})
    ).rejects.toThrow("native_chat_closed");
    reply.resolve({
      status: "admitted",
      requestId: "request",
      turnId: "compact/observed",
    });
    await expect(pending).rejects.toThrow("native_chat_command_unverified");
  } finally {
    await client?.close();
    start.mockRestore();
    test.close();
  }
});

it("projects the exact negotiated Library wait and sends only a bounded choice", async () => {
  const test = fixture();
  const sessionId = "fixture-session";
  const turnId = "fixture-turn";
  const waitId = "library-selection/fixture";
  let controlRevision = 3;
  const request = vi.fn<
    (method: string, params?: Record<string, unknown>) => Promise<unknown>
  >(async (method: string, params?: Record<string, unknown>) => {
    switch (method) {
      case "session/new":
        return { sessionId };
      case "_co.grida/session/submit":
        return {
          sessionId,
          turnId,
          inputId: params?.inputId,
          inputPosition: 1,
          disposition: "claimed",
        };
      case "_co.grida/session/snapshot":
        return {
          sessionId,
          sessionRevision: 5,
          queuedInputs: 0,
          queue: [],
          admissionPaused: false,
          current: {
            turnId,
            epoch: 1,
            journalPosition: 4,
            historyPosition: 2,
            controlRevision: 3,
            disposition: "suspended",
            status: null,
            paused: false,
            cancelled: false,
          },
          latest: null,
        };
      case "_co.grida/session/library-selections":
        return {
          sessionId,
          turnId,
          controlRevision,
          selections: [{ waitId, initialSearchQuery: "geometric print" }],
        };
      case "_co.grida/session/answer-library-selection":
        return {
          sessionId,
          turnId,
          requestId: params?.requestId,
          sessionRevision: 6,
          journalPosition: 5,
        };
      default:
        throw new Error("unexpected_request");
    }
  });
  const process = {
    connected: true,
    acceptsLibrarySelection: false,
    request,
    close: async () => {},
  };
  const start = vi
    .spyOn(NativeAgentProcess, "start")
    .mockResolvedValueOnce(process as unknown as NativeAgentProcess);
  let client: NativeAgentChat | undefined;
  try {
    client = await NativeAgentChat.start({
      resourcesPath: test.root,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      endpoint: "http://127.0.0.1:1/v1",
      provider: "responses",
      model: "gpt-5.4",
    });
    const session = await client.create();
    await expect(
      client.submitWithLibrarySelection(
        session,
        "unavailable",
        "Find a reference."
      )
    ).rejects.toThrow("native_chat_library_selection_unavailable");
    process.acceptsLibrarySelection = true;
    await client.submit(session, "ordinary", "Continue.");
    expect(request.mock.lastCall?.[1]).not.toHaveProperty(
      "allowLibrarySelection"
    );
    await client.submitWithLibrarySelection(
      session,
      "library",
      "Find a reference.",
      "plan"
    );
    expect(request).toHaveBeenLastCalledWith("_co.grida/session/submit", {
      sessionId,
      inputId: "library",
      prompt: [{ type: "text", text: "Find a reference." }],
      operatingRegime: "plan",
      allowLibrarySelection: true,
    });
    const basis = await client.observe(session);
    controlRevision += 1;
    await expect(client.librarySelections(session, basis)).rejects.toThrow(
      "native_chat_library_selection_changed"
    );
    controlRevision -= 1;
    const [review] = await client.librarySelections(session, basis);
    expect(review.initialSearchQuery).toBe("geometric print");
    const id = "2869F043-E4EE-41BD-8965-1D5B739E0542";
    const source = Uint8Array.from([
      99, 137, 80, 78, 71, 13, 10, 26, 10, 42, 88,
    ]);
    const png = source.subarray(1, 10);
    const answer = { kind: "selected", id, png };
    await expect(
      client.answerLibrarySelection(session, { ...review }, answer)
    ).rejects.toThrow("native_chat_library_selection_unavailable");
    await expect(
      client.answerLibrarySelection(session, review, {
        ...answer,
        url: "https://fixture.invalid",
      })
    ).rejects.toThrow("native_chat_library_selection_answer_invalid");
    await expect(
      client.answerLibrarySelection(session, review, {
        ...answer,
        png: new Uint8Array(256 * 1024 + 1),
      })
    ).rejects.toThrow("image_size_limit");
    await expect(
      client.answerLibrarySelection(session, review, {
        ...answer,
        png: new Uint8Array(8),
      })
    ).rejects.toThrow("invalid_png_image");
    expect(
      request.mock.calls.filter(
        ([method]) => method === "_co.grida/session/answer-library-selection"
      )
    ).toHaveLength(0);
    const accepted = await client.answerLibrarySelection(
      session,
      review,
      answer
    );
    expect(
      await client.answerLibrarySelection(session, review, answer)
    ).toEqual(accepted);
    expect(request).toHaveBeenLastCalledWith(
      "_co.grida/session/answer-library-selection",
      {
        sessionId,
        turnId,
        waitId,
        requestId: accepted.requestId,
        expectedSessionRevision: 5,
        expectedControlRevision: 3,
        answer: {
          kind: "selected",
          id: id.toLowerCase(),
          data: Buffer.from(png).toString("base64"),
        },
      }
    );
  } finally {
    await client?.close();
    start.mockRestore();
    test.close();
  }
});

it("projects only a valid retry wait for the currently running turn", async () => {
  const test = fixture();
  const running = {
    turnId: "fixture-turn",
    epoch: 1,
    journalPosition: 2,
    historyPosition: 1,
    controlRevision: 0,
    paused: false,
    cancelled: false,
    disposition: "running",
    status: null,
  };
  const previous = {
    sessionId: "fixture-session",
    sessionRevision: 1,
    queuedInputs: 0,
    queue: [],
    admissionPaused: false,
    current: running,
    latest: null,
  };
  let wire: Omit<typeof previous, "current"> & {
    current: typeof running | null;
    retryNotBeforeMs?: unknown;
  } = previous;
  const start = vi.spyOn(NativeAgentProcess, "start");
  start.mockResolvedValueOnce({
    request: async (method: string) =>
      method === "session/new" ? { sessionId: previous.sessionId } : wire,
    close: async () => {},
  } as unknown as NativeAgentProcess);
  let client: NativeAgentChat | undefined;
  try {
    client = await NativeAgentChat.start({
      resourcesPath: test.root,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      endpoint: "http://127.0.0.1:1/v1",
      provider: "openai-compatible",
      model: "fixture",
    });
    const session = await client.create();
    const read = () => client!.observe(session);
    expect(await read()).not.toHaveProperty("retryNotBeforeMs");
    const retryAt = 1_800_000_000_000;
    wire = { ...previous, retryNotBeforeMs: retryAt };
    expect(await read()).toMatchObject({ retryNotBeforeMs: retryAt });
    for (const retryNotBeforeMs of [String(retryAt), -1, 1.5, Infinity]) {
      wire = { ...previous, retryNotBeforeMs };
      expect(await read()).not.toHaveProperty("retryNotBeforeMs");
    }
    for (const current of [
      { ...running, paused: true },
      { ...running, cancelled: true },
      { ...running, disposition: "suspended" },
      null,
    ]) {
      wire = { ...previous, current, retryNotBeforeMs: retryAt };
      const result = await read();
      expect(result.current).toEqual(current);
      expect(result).not.toHaveProperty("retryNotBeforeMs");
    }
  } finally {
    await client?.close();
    start.mockRestore();
    test.close();
  }
});

it("keeps older settled summaries and projects only bounded reported token counts", async () => {
  const test = fixture();
  const sessionId = "fixture-session";
  const latest = {
    turnId: "fixture-turn",
    epoch: 1,
    journalPosition: 3,
    historyPosition: 2,
    controlRevision: 0,
    paused: false,
    cancelled: false,
    disposition: "settled",
    status: "succeeded",
  };
  const summary = {
    turnId: latest.turnId,
    status: latest.status,
    text: "The turn finished.",
    textTruncated: false,
    steps: 1,
    unresolvedOperations: 0,
    toolActivity: null,
    checks: [],
  };
  let wire: typeof summary & {
    tokenUsage?: unknown;
    reviewFindingsCollected?: unknown;
    childId?: unknown;
    artifacts?: unknown;
    artifactsOmitted?: unknown;
  } = summary;
  const start = vi.spyOn(NativeAgentProcess, "start");
  start.mockResolvedValueOnce({
    acceptsArtifacts: true,
    request: async (method: string) => {
      if (method === "session/new") return { sessionId };
      if (method === "_co.grida/session/turn-summary") return wire;
      return {
        sessionId,
        sessionRevision: 1,
        queuedInputs: 0,
        queue: [],
        admissionPaused: false,
        current: null,
        latest,
      };
    },
    close: async () => {},
  } as unknown as NativeAgentProcess);
  let client: NativeAgentChat | undefined;
  try {
    client = await NativeAgentChat.start({
      resourcesPath: test.root,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      endpoint: "http://127.0.0.1:1/v1",
      provider: "openai-compatible",
      model: "fixture",
    });
    const session = await client.create();
    const snapshot = await client.observe(session);
    const read = () => client!.turnSummary(session, snapshot);
    await expect(read()).resolves.toEqual(summary);
    for (const reviewFindingsCollected of [true, false]) {
      wire = { ...summary, reviewFindingsCollected, childId: "private-child" };
      await expect(read()).resolves.toEqual({
        ...summary,
        reviewFindingsCollected,
      });
    }
    wire = { ...summary, reviewFindingsCollected: "true" };
    await expect(read()).resolves.toEqual(summary);
    const artifacts = Array.from({ length: 8 }, (_, index) => ({
      id: `artifact-${index}`,
      kind: "image",
      mimeType: "image/png",
      label: "Cropped PNG",
      width: 1,
      height: 1,
      bytes: 70,
    }));
    wire = { ...summary, artifactsOmitted: 1 };
    await expect(read()).resolves.toEqual(summary);
    wire = { ...summary, artifacts, artifactsOmitted: 1 };
    await expect(read()).resolves.toEqual(wire);
    const output = { category: "output", tokens: "0", partial: true };
    const usage = { reported: [output], attemptsWithoutCounts: 1 };
    wire = { ...summary, tokenUsage: usage };
    await expect(read()).resolves.toEqual(wire);
    for (const reported of [
      [output, output],
      [{ ...output, tokens: 0 }],
      [{ ...output, tokens: "1".repeat(40) }],
      [{ ...output, category: "estimated_input" }],
    ]) {
      wire = { ...summary, tokenUsage: { ...usage, reported } };
      await expect(read()).resolves.toEqual(summary);
    }
  } finally {
    await client?.close();
    start.mockRestore();
    test.close();
  }
});

it("reads and refreshes only the exact ordinary child assignment on the requested page", async () => {
  const test = fixture();
  const sessionId = "parent-session";
  const latest = {
    turnId: "parent-turn",
    epoch: 1,
    journalPosition: 3,
    historyPosition: 2,
    controlRevision: 0,
    paused: false,
    cancelled: false,
    disposition: "settled",
    status: "succeeded",
  };
  const summary = {
    turnId: latest.turnId,
    status: latest.status,
    text: "The parent finished.",
    textTruncated: false,
    steps: 1,
    unresolvedOperations: 0,
    toolActivity: null,
    checks: [],
  };
  const attempt = {
    operationId: "child-operation",
    attemptId: "child-attempt",
  };
  const billing = { attempts: [], omittedAttempts: 0 };
  const first = { childId: "child-1", inputId: "assignment-1" };
  const second = { childId: "child-2", inputId: "assignment-2" };
  const firstPage = {
    assignments: [{ ...first, name: "First", disposition: { kind: "queued" } }],
    nextAfter: first,
    coverageIncomplete: true,
  };
  const secondAssignment = {
    ...second,
    name: "Second",
    disposition: { kind: "completed", turn: "child-turn" },
    billing: {
      attempts: [{ ...attempt, kind: "pending", refreshable: true }],
      omittedAttempts: 0,
    },
  };
  const secondPage = {
    assignments: [secondAssignment],
    coverageIncomplete: true,
  };
  let negotiated = false;
  let firstPageWire: unknown = firstPage;
  const request = vi.fn<NativeAgentProcess["request"]>(
    async (method, params) => {
      if (method === "session/new") return { sessionId };
      if (method === "_co.grida/session/turn-summary") {
        const page = (params as { childBillingAfter?: unknown })
          .childBillingAfter;
        return {
          ...summary,
          gatewayBilling: {
            ...billing,
            children: page ? secondPage : firstPageWire,
          },
        };
      }
      return {
        sessionId,
        sessionRevision: 1,
        queuedInputs: 0,
        queue: [],
        admissionPaused: false,
        current: null,
        latest,
      };
    }
  );
  const status = vi.fn<NativeAgentProcess["gatewayBillingStatus"]>(
    async () => ({
      kind: "settled",
      chargedMills: "0.75",
    })
  );
  const start = vi.spyOn(NativeAgentProcess, "start").mockResolvedValueOnce({
    get acceptsChildGatewayBilling() {
      return negotiated;
    },
    request,
    gatewayBillingStatus: status,
    close: async () => {},
  } as unknown as NativeAgentProcess);
  const requireCurrent = vi.fn<() => void>();
  let client: NativeAgentChat | undefined;
  try {
    client = await NativeAgentChat.start({
      resourcesPath: test.root,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      endpoint: "http://127.0.0.1:1/v1",
      provider: "openai-compatible",
      model: "fixture",
    });
    const session = await client.create();
    const snapshot = await client.observe(session);
    const read = () => client!.turnSummary(session, snapshot);
    const page = { childBillingAfter: first, requireCurrent };
    const refresh = { ...page, attempt: { ...attempt, child: second } };

    await expect(read()).resolves.toEqual(summary);
    const calls = request.mock.calls.length;
    await expect(client.turnSummary(session, snapshot, page)).rejects.toThrow(
      "native_chat_gateway_billing_unavailable"
    );
    expect(request).toHaveBeenCalledTimes(calls);
    negotiated = true;
    await expect(read()).resolves.toMatchObject({
      gatewayBilling: { children: firstPage },
    });
    firstPageWire = { ...firstPage, nextAfter: second };
    await expect(read()).resolves.toEqual(summary);
    firstPageWire = firstPage;
    await expect(
      client.turnSummary(session, snapshot, page)
    ).resolves.toMatchObject({ gatewayBilling: { children: secondPage } });
    expect(request).toHaveBeenLastCalledWith("_co.grida/session/turn-summary", {
      sessionId,
      turnId: latest.turnId,
      childBillingAfter: first,
    });
    await expect(
      client.turnSummary(session, snapshot, {
        ...refresh,
        attempt: { ...attempt, child: first },
      })
    ).rejects.toThrow("native_chat_gateway_billing_unavailable");
    expect(status).not.toHaveBeenCalled();
    requireCurrent.mockImplementationOnce(() => {
      throw new Error("stale-attachment");
    });
    await expect(
      client.turnSummary(session, snapshot, refresh)
    ).rejects.toThrow("stale-attachment");
    expect(status).not.toHaveBeenCalled();
    await expect(
      client.turnSummary(session, snapshot, refresh)
    ).resolves.toMatchObject({
      gatewayBilling: {
        children: {
          assignments: [
            {
              ...secondAssignment,
              billing: {
                ...secondAssignment.billing,
                attempts: [
                  {
                    ...attempt,
                    kind: "settled",
                    chargedMills: "0.75",
                    refreshable: false,
                  },
                ],
              },
            },
          ],
        },
      },
    });
    expect(status).toHaveBeenCalledExactlyOnceWith({
      ...attempt,
      child: second,
      sessionId,
      turnId: latest.turnId,
    });
    await expect(
      client.turnSummary(session, snapshot, page)
    ).resolves.toMatchObject({ gatewayBilling: { children: secondPage } });
    expect(status).toHaveBeenCalledTimes(1);
  } finally {
    await client?.close();
    start.mockRestore();
    test.close();
  }
});

it.runIf(Boolean(packaged))(
  "requests one prediction through the negotiated Desktop host for the observed reply",
  async () => {
    const test = fixture();
    const provider = await scriptedProvider([
      finishReply("The moth exhibit title is ready."),
      finishReply("Write the audio guide for young visitors."),
    ]);
    let client: NativeAgentChat | undefined;
    try {
      client = await NativeAgentChat.start({
        resourcesPath: packaged!,
        stateDirectory: test.stateDirectory,
        cwd: test.cwd,
        endpoint: provider.endpoint,
        provider: "openai-compatible",
        model: "fixture",
      });
      const session = await client.create();
      await client.submit(
        session,
        "exhibit",
        "Write a title first. We need an audio guide for young visitors next."
      );
      const snapshot = await vi.waitFor(async () => {
        const observed = await client!.observe(session);
        expect(observed.latest?.status).toBe("succeeded");
        return observed;
      });
      expect(await client.predictPrompt(session, snapshot)).toBe(
        "Write the audio guide for young visitors."
      );
      expect(await client.predictPrompt(session, snapshot)).toBeNull();
      expect(provider.requests).toHaveLength(2);
      expect(await client.observe(session)).toEqual(snapshot);
    } finally {
      await client?.close();
      await provider.close();
      test.close();
    }
  }
);

it.runIf(Boolean(packaged))(
  "observes and stops the built host's pending retry without another provider request",
  async () => {
    const test = fixture();
    const requests: string[] = [];
    const provider = createServer((request, response) => {
      request.resume();
      request.on("end", () => {
        requests.push(request.url ?? "");
        response
          .writeHead(429, {
            "content-type": "application/json",
            "retry-after": "5",
          })
          .end(JSON.stringify({ error: { code: "rate_limit_exceeded" } }));
      });
    });
    provider.listen(0, "127.0.0.1");
    let client: NativeAgentChat | undefined;
    try {
      await once(provider, "listening");
      const address = provider.address();
      if (!address || typeof address === "string")
        throw new Error("fixture_listener_unavailable");
      client = await NativeAgentChat.start({
        resourcesPath: packaged!,
        stateDirectory: test.stateDirectory,
        cwd: test.cwd,
        endpoint: `http://127.0.0.1:${address.port}/v1`,
        provider: "responses",
        model: "fixture",
      });
      const session = await client.create();
      const accepted = await client.submit(session, "retry-input", "Wait.");
      const waiting = await vi.waitFor(
        async () => {
          const observed = await client!.observe(session);
          expect(observed.retryNotBeforeMs).toBeGreaterThan(Date.now());
          return observed;
        },
        { timeout: 3000 }
      );
      expect(waiting.current?.turnId).toBe(accepted.turnId);
      await client.stop(session, waiting, "stop-retry");
      await vi.waitFor(
        async () => {
          const observed = await client!.observe(session);
          expect(observed.current).toBeNull();
          expect(observed.latest).toMatchObject({
            turnId: accepted.turnId,
            status: "cancelled",
          });
          expect(observed).not.toHaveProperty("retryNotBeforeMs");
        },
        { timeout: 3000 }
      );
      expect(requests).toEqual(["/v1/responses"]);
      expect((await client.list()).runningSessionIds).toEqual([]);
    } finally {
      await client?.close();
      if (provider.listening) {
        const closed = once(provider, "close");
        provider.close();
        provider.closeAllConnections();
        await closed;
      }
      test.close();
    }
  },
  15_000
);

it.runIf(Boolean(packaged))(
  "continues a reopened chat after an uncertain provider stream without repeating the original input",
  async () => {
    const test = fixture();
    const original = "Keep this context for the next turn.";
    const partial = "Partial response before the connection closed.";
    const followUp = "Continue from the retained request.";
    const answer = "Successful answer after reopening.";
    let interrupted: ServerResponse | undefined;
    const provider = await scriptedProvider([
      (response) => {
        interrupted = response;
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write(chatChunk({ role: "assistant", content: partial }));
      },
      finishReply(answer),
    ]);
    const launch: NativeAgentChatLaunch = {
      resourcesPath: packaged!,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      endpoint: provider.endpoint,
      provider: "openai-compatible",
      model: "fixture",
    };
    let client: NativeAgentChat | undefined;
    try {
      client = await NativeAgentChat.start(launch);
      const session = await client.create();
      const updates: NativeChatStreamUpdate[] = [];
      client.subscribe(session, (update) => updates.push(update));
      const first = await client.submit(session, "interrupted-input", original);
      await vi.waitFor(() => {
        expect(updates).toContainEqual(
          expect.objectContaining({
            kind: "text",
            turnId: first.turnId,
            text: partial,
          })
        );
      });
      interrupted!.destroy();
      await vi.waitFor(async () => {
        const snapshot = await client!.observe(session);
        expect(snapshot.current).toBeNull();
        expect(snapshot.latest).toMatchObject({
          turnId: first.turnId,
          status: "uncertain",
        });
      });
      expect(provider.requests).toHaveLength(1);

      await client.close();
      client = await NativeAgentChat.start(launch);
      expect((await client.list()).titles).toEqual([
        { sessionId: session.id, title: original },
      ]);
      const reopened = await client.load(session.id);
      expect(reopened.id).toBe(session.id);
      const snapshot = await client.observe(reopened);
      expect(snapshot.latest).toMatchObject({
        turnId: first.turnId,
        status: "uncertain",
      });
      expect(
        (await client.transcript(reopened))
          .filter((entry) => entry.role === "user")
          .map((entry) => entry.text)
      ).toEqual([original]);
      expect(provider.requests).toHaveLength(1);

      const second = await client.submit(reopened, "follow-up-input", followUp);
      expect(second.turnId).toEqual(expect.any(String));
      expect(second.turnId).not.toBe(first.turnId);
      await vi.waitFor(async () => {
        const settled = await client!.observe(reopened);
        expect(settled.current).toBeNull();
        expect(settled.latest).toMatchObject({
          turnId: second.turnId,
          status: "succeeded",
        });
      });
      expect(provider.requests).toHaveLength(2);
      const { messages } = JSON.parse(provider.requests[1]);
      expect(
        messages.filter(({ role }: { role: string }) => role === "user")
      ).toEqual([
        { role: "user", content: original },
        { role: "user", content: followUp },
      ]);
      expect((await client.transcript(reopened)).at(-1)).toMatchObject({
        role: "assistant",
        text: answer,
      });
    } finally {
      await client?.close();
      await provider.close();
      test.close();
    }
  },
  15_000
);

it.runIf(Boolean(packaged))(
  "recovers one native acceptance and dispatch when its acknowledgement is lost",
  async () => {
    const test = fixture();
    const inputId = "unconfirmed-input";
    const text = "Persist the request before reporting its result.";
    const answer = "One completed response.";
    const provider = await scriptedProvider([finishReply(answer)]);
    let client: NativeAgentChat | undefined;
    try {
      client = await NativeAgentChat.start({
        resourcesPath: packaged!,
        stateDirectory: test.stateDirectory,
        cwd: test.cwd,
        endpoint: provider.endpoint,
        provider: "openai-compatible",
        model: "fixture",
      });
      const session = await client.create();
      const request = NativeAgentProcess.prototype.request;
      let discarded: unknown;
      const loseAcknowledgement = vi
        .spyOn(NativeAgentProcess.prototype, "request")
        .mockImplementationOnce(async function (
          this: NativeAgentProcess,
          ...args
        ) {
          // Drop the reply only after the real native host commits acceptance.
          discarded = await request.apply(this, args);
          throw new Error("native_agent_request_timeout");
        });
      try {
        await expect(client.submit(session, inputId, text)).rejects.toThrow(
          "native_agent_request_timeout"
        );
      } finally {
        loseAcknowledgement.mockRestore();
      }
      const recovered = await client.inputReceipt(session, inputId);
      expect(recovered).toMatchObject({
        sessionId: session.id,
        inputId,
        turnId: expect.any(String),
      });
      expect(discarded).toMatchObject({
        sessionId: recovered.sessionId,
        inputId: recovered.inputId,
        inputPosition: recovered.inputPosition,
        turnId: recovered.turnId,
      });
      const retried = await client.submit(session, inputId, text);
      expect(retried).toMatchObject({
        inputId,
        inputPosition: recovered.inputPosition,
        turnId: recovered.turnId,
      });
      await vi.waitFor(async () => {
        const snapshot = await client!.observe(session);
        expect(snapshot.current).toBeNull();
        expect(snapshot.latest).toMatchObject({
          turnId: recovered.turnId,
          status: "succeeded",
        });
      });
      expect(
        (await client.transcript(session)).map(({ text }) => text)
      ).toEqual([text, answer]);
      expect(provider.requests).toHaveLength(1);
    } finally {
      await client?.close();
      await provider.close();
      test.close();
    }
  },
  15_000
);

it.runIf(Boolean(packaged))(
  "reads and revises the selected earlier message through the built host",
  async () => {
    const test = fixture();
    const requests: string[] = [];
    const provider = createServer((request, response) => {
      request.setEncoding("utf8");
      let body = "";
      request.on("data", (chunk: string) => {
        body += chunk;
      });
      request.on("end", () => {
        requests.push(body);
        const chunk = (delta: unknown, reason: string | null) =>
          `data: ${JSON.stringify({ id: `revision-${requests.length}`, choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`;
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          chunk({ role: "assistant", content: "Recorded reply." }, null) +
            chunk({}, "stop") +
            "data: [DONE]\n\n"
        );
      });
    });
    provider.listen(0, "127.0.0.1");
    let client: NativeAgentChat | undefined;
    try {
      await once(provider, "listening");
      const address = provider.address();
      if (!address || typeof address === "string")
        throw new Error("fixture_listener_unavailable");
      client = await NativeAgentChat.start({
        resourcesPath: packaged!,
        stateDirectory: test.stateDirectory,
        cwd: test.cwd,
        endpoint: `http://127.0.0.1:${address.port}/v1`,
        provider: "openai-compatible",
        model: "fixture",
      });
      const session = await client.create();
      const settle = (turnId: string | null) =>
        vi.waitFor(
          async () => {
            const snapshot = await client!.observe(session);
            expect(snapshot.current).toBeNull();
            expect(snapshot.latest).toMatchObject({
              turnId,
              status: "succeeded",
            });
            return snapshot;
          },
          { timeout: 5000 }
        );
      const original = "First input with its original text. ".repeat(12);
      const first = await client.submit(session, "first", original);
      await settle(first.turnId);
      const later = await vi.waitFor(
        () => client!.submit(session, "later", "Later original input."),
        { timeout: 5000 }
      );
      const old = await settle(later.turnId);
      expect(old.historyRevisionAvailable).toBe(true);
      const transcript = await client.transcript(session);
      const message = transcript.find((entry) => entry.text === original);
      expect(message?.role).toBe("user");
      const attachment = {};
      const check = () => {};
      const target = await client.prepareRevision(
        attachment,
        session,
        old,
        message!.messageId,
        check
      );
      expect(target.text).toBe(original);
      expect(target.subsequentMessages).toBe(3);
      const input = {
        reviewId: target.reviewId,
        operatingRegime: "act",
        text: "Revised first request.",
      } as const;
      const revised = await vi.waitFor(
        () => client!.revise(attachment, session, input, check),
        { timeout: 5000 }
      );
      expect(revised.sessionId).toBe(session.id);
      expect(revised.view).toBeGreaterThan(old.sessionRevision);
      await expect(
        client.revise(attachment, session, input, check)
      ).resolves.toEqual(revised);
      const replacement = await vi.waitFor(async () => {
        const accepted = await client!.inputReceipt(session, revised.inputId);
        expect(accepted.turnId).toEqual(expect.any(String));
        return accepted;
      });
      await settle(replacement.turnId);
      expect(
        (await client.transcript(session)).map((entry) => entry.text)
      ).toEqual(["Revised first request.", "Recorded reply."]);
      expect(requests).toHaveLength(3);
      expect(requests[2]).toContain("Revised first request.");
      expect(requests[2]).not.toContain("Later original input.");
    } finally {
      await client?.close();
      if (provider.listening) {
        const closed = once(provider, "close");
        provider.close();
        provider.closeAllConnections();
        await closed;
      }
      test.close();
    }
  },
  30_000
);

it.runIf(Boolean(packaged))(
  "finds an old chat with a new reply across live and closed workspace stores",
  async () => {
    const a = fixture();
    const b = fixture();
    const projectA = { id: "000000000000000a", root: a.cwd };
    const projectB = { id: "000000000000000b", root: b.cwd };
    const provider = await scriptedProvider([
      finishReply("First."),
      finishReply("Latest."),
    ]);
    const launch = (test: ReturnType<typeof fixture>) =>
      NativeAgentChat.start({
        resourcesPath: packaged!,
        stateDirectory: test.stateDirectory,
        cwd: test.cwd,
        provider: "openai-compatible",
        model: "fixture",
        endpoint: provider.endpoint,
      });
    let active: NativeAgentChat | undefined;
    let other: NativeAgentChat | undefined;
    const openCatalog = () =>
      new NativeChatCatalog({
        workspaces: async () => [projectB, projectA],
        resolve: async (id) => (id === projectA.id ? projectA : projectB),
        read: (workspace, cursor) =>
          active && workspace.id === projectA.id
            ? active.messageActivityCatalog(cursor)
            : readClosedChatCatalog(
                packaged!,
                workspace.id === projectA.id
                  ? a.stateDirectory
                  : b.stateDirectory,
                workspace.root,
                cursor
              ),
      });
    try {
      active = await launch(a);
      const original = await active.create();
      for (let i = 0; i < 32; i++) await active.create();
      expect((await active.list()).sessionIds).not.toContain(original.id);
      other = await launch(b);
      const otherChat = await other.create();
      await other.submit(otherChat, "other-message", "First message.");
      await vi.waitFor(async () =>
        expect((await other!.observe(otherChat)).latest?.status).toBe(
          "succeeded"
        )
      );
      await other.close();
      other = undefined;
      await active.submit(original, "new-reply", "Resume this chat.");
      await vi.waitFor(async () =>
        expect((await active!.observe(original)).latest?.status).toBe(
          "succeeded"
        )
      );
      const catalog = openCatalog();
      const first = await catalog.list({ limit: 1 });
      expect(first.entries).toEqual([
        expect.objectContaining({
          sessionId: original.id,
          workspaceId: projectA.id,
          lastMessageAtMs: expect.any(Number),
        }),
      ]);
      expect(
        (await catalog.list({ cursor: first.nextCursor, limit: 1 })).entries[0]
          .sessionId
      ).toBe(otherChat.id);
      expect(
        (await catalog.list({ workspaceId: projectA.id, limit: 1 })).entries
      ).toEqual(first.entries);
      expect(
        (await catalog.list({ workspaceId: projectB.id })).entries.map(
          (chat) => chat.sessionId
        )
      ).toEqual([otherChat.id]);
      await active.close();
      active = undefined;
      expect((await openCatalog().list({ limit: 1 })).entries).toEqual(
        first.entries
      );
      expect(provider.requests).toHaveLength(2);
    } finally {
      await Promise.all([active?.close(), other?.close()]);
      await provider.close();
      a.close();
      b.close();
    }
  },
  30_000
);

it.runIf(Boolean(packaged))(
  "lists detached workspace pages and restores a renamed archive after restart",
  async () => {
    const test = fixture();
    const otherWorkspace = path.join(test.root, "other-workspace");
    fs.mkdirSync(otherWorkspace, { mode: 0o700 });
    const launch: NativeAgentChatLaunch = {
      resourcesPath: packaged!,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      provider: "openai-compatible",
      endpoint: "http://127.0.0.1:1/v1",
      model: "fixture",
    };
    let client: NativeAgentChat | undefined;
    try {
      client = await NativeAgentChat.start({ ...launch, cwd: otherWorkspace });
      const other = await client.create();
      await client.close();

      client = await NativeAgentChat.start(launch);
      const saved: string[] = [];
      for (let index = 0; index < 34; index++)
        saved.unshift((await client.create()).id);
      await client.close();

      client = await NativeAgentChat.start(launch);
      const first = await client.list();
      expect(first.sessionIds).toEqual(saved.slice(0, 32));
      expect(first.nextCursor).toEqual(expect.any(String));
      const emptyReadState = { unread: false, revision: 0, replyId: null };
      await expect(client.list(first.nextCursor)).resolves.toEqual({
        sessionIds: saved.slice(32),
        nextCursor: null,
        runningSessionIds: [],
        inputNeededSessionIds: [],
        readStates: saved.slice(32).map((sessionId) => ({
          sessionId,
          ...emptyReadState,
        })),
      });
      await expect(
        client.list({ cwd: otherWorkspace } as unknown as string)
      ).rejects.toThrow("native_chat_cursor_invalid");
      await expect(client.observe({ id: saved[0] })).rejects.toThrow(
        "native_chat_attachment_required"
      );
      await expect(client.load(other.id)).rejects.toThrow(
        "session_workspace_mismatch"
      );
      const selected = await client.load(saved[0]);
      expect((await client.observe(selected)).current).toBeNull();
      const entry = await client.catalogEntry(selected);
      const name = {
        revision: entry.revision,
        title: "  An organized chat  ",
        archived: false,
      };
      await expect(
        client.organize(selected, { ...name, sessionId: other.id })
      ).rejects.toThrow("native_chat_invalid_protocol_value");
      const renamed = await client.organize(selected, name);
      expect(renamed.title).toBe("An organized chat");
      expect(renamed.revision).toBeGreaterThan(entry.revision);
      await expect(client.organize(selected, name)).resolves.toEqual(renamed);
      await expect(
        client.organize(selected, { ...name, title: "A conflicting title" })
      ).rejects.toThrow("session_catalog_revision_changed");
      await expect(
        client.organize(selected, { ...name, title: "🙂".repeat(65) })
      ).rejects.toThrow("native_chat_invalid_protocol_value");
      expect((await client.list()).titles).toContainEqual({
        sessionId: selected.id,
        title: renamed.title,
      });
      const archived = await client.organize(selected, {
        revision: renamed.revision,
        title: renamed.title,
        archived: true,
      });
      expect((await client.list()).sessionIds).not.toContain(selected.id);
      expect(await client.list(null, true)).toEqual({
        sessionIds: [selected.id],
        nextCursor: null,
        titles: [{ sessionId: selected.id, title: renamed.title }],
        readStates: [{ sessionId: selected.id, ...emptyReadState }],
      });

      await client.close();
      client = await NativeAgentChat.start(launch);
      const reopened = await client.load(selected.id);
      expect(await client.catalogEntry(reopened)).toEqual({
        ...archived,
        readState: emptyReadState,
      });
      expect((await client.observe(reopened)).current).toBeNull();
      const restored = await client.organize(reopened, {
        revision: archived.revision,
        title: archived.title,
        archived: false,
      });
      expect((await client.list()).sessionIds).toContain(selected.id);
      expect((await client.list(null, true)).sessionIds).toEqual([]);
      await expect(
        client.organize(reopened, {
          revision: restored.revision,
          title: null,
          archived: false,
        })
      ).resolves.toMatchObject({ title: null });
      expect((await client.list()).titles).toBeUndefined();

      await client.close();
      client = await NativeAgentChat.start({ ...launch, cwd: otherWorkspace });
      await expect(client.list(first.nextCursor)).rejects.toThrow(
        "invalid_session_cursor"
      );
      await expect(client.list()).resolves.toEqual({
        sessionIds: [other.id],
        nextCursor: null,
        runningSessionIds: [],
        inputNeededSessionIds: [],
        readStates: [{ sessionId: other.id, ...emptyReadState }],
      });
    } finally {
      await client?.close();
      test.close();
    }
  },
  20_000
);

it.runIf(Boolean(packaged))(
  "keeps archived work running, then pauses, resumes, and reads the stopped turn",
  async () => {
    const test = fixture();
    const provider = await heldProvider();
    const launch: NativeAgentChatLaunch = {
      resourcesPath: packaged!,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      provider: "openai-compatible",
      endpoint: provider.endpoint,
      model: "fixture",
    };
    let client: NativeAgentChat | undefined;
    try {
      client = await NativeAgentChat.start(launch);
      const session = await client.create();
      expect(client.acceptsPng).toBe(false);
      await expect(client.submitImage(session, {})).rejects.toThrow(
        "image_input_unavailable"
      );
      const other = await client.create();
      const updates: NativeChatStreamUpdate[] = [];
      const otherUpdates: NativeChatStreamUpdate[] = [];
      client.subscribe(session, (update) => updates.push(update));
      client.subscribe(other, (update) => otherUpdates.push(update));
      await expect(client.observe({ id: session.id })).rejects.toThrow(
        "native_chat_attachment_required"
      );
      const accepted = await client.submit(
        session,
        "fixture-input",
        "Keep working until stopped"
      );
      expect(accepted).toEqual(
        expect.objectContaining({
          disposition: "claimed",
          turnId: expect.any(String),
        })
      );
      await vi.waitFor(() => {
        expect(updates).toContainEqual(
          expect.objectContaining({
            kind: "text",
            role: "assistant",
            turnId: accepted.turnId,
            offsetBytes: 0,
            text: "Working",
            replace: false,
          })
        );
      });
      expect(otherUpdates).toEqual([]);
      const committed = await client.transcript(session);
      expect(committed).toEqual([
        expect.objectContaining({
          role: "user",
          text: "Keep working until stopped",
        }),
      ]);
      expect(
        await client.submit(
          session,
          "fixture-input",
          "Keep working until stopped"
        )
      ).toEqual(accepted);
      const running = await vi.waitFor(
        async () => {
          expect(provider.prompts).toHaveLength(1);
          const snapshot = await client!.observe(session);
          expect(snapshot.current).toEqual(
            expect.objectContaining({
              turnId: accepted.turnId,
              disposition: "running",
            })
          );
          return snapshot;
        },
        { timeout: 5000 }
      );
      await expect(
        client.pause(other, running, "wrong-session")
      ).rejects.toThrow("native_chat_turn_observation_required");
      await expect(
        client.pause(session, { ...running }, "fabricated")
      ).rejects.toThrow("native_chat_turn_observation_required");
      await expect(
        client.resume(session, running, "unverified")
      ).rejects.toThrow("native_chat_verified_pause_required");
      await expect(client.turnSummary(session, running)).rejects.toThrow(
        "native_chat_turn_summary_unavailable"
      );
      expect((await client.list()).runningSessionIds).toEqual([session.id]);
      const entry = await client.catalogEntry(session);
      await client.organize(session, {
        revision: entry.revision,
        title: "Still running",
        archived: true,
      });
      expect((await client.observe(session)).current).toEqual(running.current);
      expect((await client.list()).runningSessionIds).toEqual([]);
      const pause = await client.pause(session, running, "pause-fixture");
      expect(await client.pause(session, running, "pause-fixture")).toEqual(
        pause
      );
      const paused = await vi.waitFor(
        async () => {
          const snapshot = await client!.observe(session);
          expect(snapshot.current).toEqual(
            expect.objectContaining({
              turnId: accepted.turnId,
              disposition: "suspended",
              paused: true,
            })
          );
          return snapshot;
        },
        { timeout: 5000 }
      );
      expect(provider.prompts).toHaveLength(1);
      await client.close();
      client = await NativeAgentChat.start(launch);
      await expect(client.observe(session)).rejects.toThrow(
        "native_chat_attachment_required"
      );
      const reattached = await client.load(session.id);
      expect(await client.load(session.id)).toBe(reattached);
      expect(await client.inputReceipt(reattached, "fixture-input")).toEqual(
        accepted
      );
      expect((await client.observe(reattached)).current).toEqual(
        paused.current
      );
      const resumed = await client.resume(reattached, paused, "resume-fixture");
      expect(resumed.turnId).toBe(accepted.turnId);
      expect(resumed.epoch).toBeGreaterThan(paused.current!.epoch);
      expect(
        (await client.resume(reattached, paused, "resume-fixture")).epoch
      ).toBe(resumed.epoch);
      const resumedRunning = await vi.waitFor(
        async () => {
          expect(provider.prompts).toHaveLength(2);
          const snapshot = await client!.observe(reattached);
          expect(snapshot.current).toEqual(
            expect.objectContaining({
              turnId: accepted.turnId,
              epoch: resumed.epoch,
            })
          );
          return snapshot;
        },
        { timeout: 5000 }
      );
      await expect(
        client.stop(reattached, running, "stale-stop")
      ).rejects.toThrow("stale_session_revision");
      const stopped = await client.stop(
        reattached,
        resumedRunning,
        "stop-fixture"
      );
      expect(
        await client.stop(reattached, resumedRunning, "stop-fixture")
      ).toEqual(stopped);
      const settled = await vi.waitFor(
        async () => {
          const snapshot = await client!.observe(reattached);
          expect(snapshot).toEqual(
            expect.objectContaining({
              current: null,
              admissionPaused: true,
              latest: expect.objectContaining({
                turnId: accepted.turnId,
                disposition: "settled",
                status: "cancelled",
              }),
            })
          );
          return snapshot;
        },
        { timeout: 5000 }
      );
      const summary = await client.turnSummary(reattached, settled);
      expect(summary).toMatchObject({
        turnId: accepted.turnId,
        status: "cancelled",
        text: expect.any(String),
        textTruncated: false,
        toolActivity: { succeeded: 0, failed: 0, cancelled: 0, unresolved: 0 },
        checks: [],
        tokenUsage: {
          reported: [
            { category: "input", tokens: "7", partial: true },
            { category: "cached_input", tokens: "0", partial: true },
          ],
          attemptsWithoutCounts: 1,
        },
      });
      await expect(
        client.turnSummary(reattached, { ...settled })
      ).rejects.toThrow("native_chat_turn_observation_required");
      expect(provider.prompts).toHaveLength(2);
      expect(await client.inputReceipt(reattached, "fixture-input")).toEqual(
        expect.objectContaining({
          inputId: accepted.inputId,
          inputPosition: accepted.inputPosition,
          turnId: accepted.turnId,
          disposition: "completed",
        })
      );
      await client.close();
      client = await NativeAgentChat.start(launch);
      const reopened = await client.load(session.id);
      expect(
        await client.turnSummary(reopened, await client.observe(reopened))
      ).toEqual(summary);
      await client.close();
      client = await NativeAgentChat.start({ ...launch, cwd: test.root });
      await expect(client.load(session.id)).rejects.toThrow(
        "session_workspace_mismatch"
      );
      expect(provider.prompts).toHaveLength(2);
    } finally {
      try {
        await client?.close();
      } finally {
        await provider.close();
        test.close();
      }
    }
  },
  20000
);

it("reports a goal start the host may have accepted as unverified", async () => {
  const test = fixture();
  const request =
    vi.fn<
      (method: string, input?: Record<string, unknown>) => Promise<unknown>
    >();
  const start = vi.spyOn(NativeAgentProcess, "start").mockResolvedValueOnce({
    request,
    close: async () => {},
  } as unknown as NativeAgentProcess);
  let client: NativeAgentChat | undefined;
  try {
    client = await NativeAgentChat.start({
      resourcesPath: test.root,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      endpoint: "http://127.0.0.1:1/v1",
      provider: "openai-compatible",
      model: "fixture",
    });
    request.mockResolvedValueOnce({ sessionId: "parent" });
    const parent = await client.create();
    const goal = {
      objective: "Review the export",
      criteria: ["Collect the review"],
      automatic: true,
    };
    // A lost reply or an unreadable receipt leaves acceptance unknown.
    request.mockRejectedValueOnce(new Error("native_agent_request_timeout"));
    await expect(client.startGoal(parent, "goal-1", goal)).rejects.toThrow(
      "native_chat_goal_start_unverified"
    );
    request.mockResolvedValueOnce({ sessionId: "parent", inputId: "other" });
    await expect(client.startGoal(parent, "goal-1", goal)).rejects.toThrow(
      "native_chat_goal_start_unverified"
    );
    // A refusal made before acceptance reaches the renderer as it is.
    request.mockRejectedValueOnce(new Error("session_goal_queued"));
    await expect(client.startGoal(parent, "goal-1", goal)).rejects.toThrow(
      /^session_goal_queued$/
    );
  } finally {
    await client?.close();
    start.mockRestore();
    test.close();
  }
});

it("lends a side chat only through the attachment that opened it", async () => {
  const test = fixture();
  const request =
    vi.fn<
      (method: string, input?: Record<string, unknown>) => Promise<unknown>
    >();
  const start = vi.spyOn(NativeAgentProcess, "start").mockResolvedValueOnce({
    request,
    close: async () => {},
  } as unknown as NativeAgentProcess);
  const sideId = "side/0123456789abcdef0123456789abcdef";
  let client: NativeAgentChat | undefined;
  try {
    client = await NativeAgentChat.start({
      resourcesPath: test.root,
      stateDirectory: test.stateDirectory,
      cwd: test.cwd,
      endpoint: "http://127.0.0.1:1/v1",
      provider: "openai-compatible",
      model: "fixture",
    });
    request.mockResolvedValueOnce({ sessionId: "parent" });
    const parent = await client.create();
    request.mockResolvedValueOnce({
      sideChatId: sideId,
      parentSessionId: "parent",
      sourceContext: { view: 3, tail: null, fingerprint: "f" },
      compacted: true,
      omissions: { reasoning: 2, media: 0 },
      temporary: true,
    });
    const { session, side } = await client.openSideChat(parent);
    expect(request.mock.calls.at(-1)).toEqual([
      "_co.grida/side-chat/open",
      { sessionId: "parent", requestId: expect.any(String) },
    ]);
    expect(side).toEqual({
      id: sideId,
      parent: "parent",
      compacted: true,
      omitted: true,
    });
    expect(client.ownsSession(session)).toBe(true);

    request.mockResolvedValueOnce({
      sessionId: sideId,
      sessionRevision: 1,
      queuedInputs: 0,
      queue: [],
      admissionPaused: false,
      current: null,
      latest: null,
      side: {
        parentSessionId: "parent",
        temporary: true,
        unavailable: ["fork", "catalog", "a_future_refusal"],
      },
    });
    const snapshot = await client.observe(session);
    expect(snapshot.side).toEqual({
      parentSessionId: "parent",
      temporary: true,
      unavailable: ["fork", "catalog"],
    });

    // A generated title arrives through the side chat's snapshot.
    const titled = (title: unknown) => ({
      sessionId: sideId,
      sessionRevision: 2,
      queuedInputs: 0,
      queue: [],
      admissionPaused: false,
      current: null,
      latest: null,
      side: {
        parentSessionId: "parent",
        temporary: true,
        unavailable: [],
        title,
      },
    });
    request.mockResolvedValueOnce(titled("Banner sizes"));
    expect((await client.observe(session)).side?.title).toBe("Banner sizes");
    request.mockResolvedValueOnce(titled("Bad\u0007title"));
    await expect(client.observe(session)).rejects.toThrow(
      "native_chat_invalid_protocol_value"
    );

    // No other attachment can load the side chat by its id.
    const calls = request.mock.calls.length;
    await expect(client.load(sideId)).rejects.toThrow(
      "native_chat_side_unavailable"
    );
    expect(request.mock.calls).toHaveLength(calls);

    // Unconfirmed cleanup is retried for the same side chat.
    request.mockRejectedValueOnce(new Error("side_chat_discard_pending"));
    request.mockResolvedValueOnce({});
    await client.closeSideChat(session);
    expect(request.mock.calls.slice(-2)).toEqual([
      ["_co.grida/side-chat/close", { sideChatId: sideId }],
      ["_co.grida/side-chat/close", { sideChatId: sideId }],
    ]);
    expect(client.ownsSession(session)).toBe(false);
    await expect(client.closeSideChat(session)).rejects.toThrow(
      "native_chat_side_unavailable"
    );
    await expect(client.closeSideChat(parent)).rejects.toThrow(
      "native_chat_side_unavailable"
    );
  } finally {
    await client?.close();
    start.mockRestore();
    test.close();
  }
});
