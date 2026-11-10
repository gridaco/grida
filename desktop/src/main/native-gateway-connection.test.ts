// GRIDA-SEC-006 — the account-scoped bearer stays in the main connector.
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent, WebContents } from "electron";
import { expect, it, vi } from "vitest";
import type {
  DesktopAccountSession,
  DesktopGatewayGrant,
} from "./account-session";
import { NativeGatewayConnection } from "./native-gateway-connection";
import type { NativeProviderNetwork } from "./native-provider-egress";
import { NativeAgentProcess } from "./native-agent-process";
import { NativeAgentChat } from "./native-agent-chat";
import { NativeChatIpc } from "./native-chat-ipc";
import { IPC_CHANNELS } from "../bridge/contract";
import { NativeEditorSurfaceEndpoints } from "./native-editor-surfaces";

const origin = "https://grida.test";
const target = `${origin}/api/v1/ai/chat/completions`;
const body = Buffer.from("{}");

function fixture(first?: Partial<DesktopGatewayGrant>) {
  const grant = {
    token: "synthetic.fixture.initial",
    expiresAt: Date.now() + 120_000,
    subject: "fixture-user",
    organizationId: 12,
    isCurrent: () => true,
    ...first,
  };
  const mint = vi.fn<DesktopAccountSession["withGatewayGrant"]>(
    async (_, accept) => accept(grant)
  );
  const dispatch = vi.fn<
    (body: Buffer, signal: AbortSignal) => Promise<Response>
  >(async () => new Response("fixture"));
  const prepare = vi.fn<NativeProviderNetwork["prepare"]>(() => dispatch);
  return {
    grant,
    mint,
    dispatch,
    prepare,
    options: {
      origin,
      account: { withGatewayGrant: mint },
      network: { prepare },
    },
  };
}

it("injects only the current scoped bearer into the fixed Gateway chat request", async () => {
  let live = true;
  const owner = fixture({ isCurrent: () => live });
  const connection = await NativeGatewayConnection.open(owner.options);
  expect(connection.scope).toMatch(/^[a-f0-9]{64}$/);
  expect(connection.endpoint).toBe(`${origin}/api/v1/ai`);
  expect(JSON.stringify(connection)).not.toContain("synthetic.fixture.initial");
  expect(connection.prepare(`${target}?extra=1`, new Headers())).toBeNull();
  expect(
    connection.prepare(
      target,
      new Headers({ authorization: "Bearer untrusted" })
    )
  ).toBeNull();
  const headers = new Headers({ accept: "text/event-stream" });
  const request = connection.prepare(target, headers)!;
  expect(await request(body, new AbortController().signal)).toBeInstanceOf(
    Response
  );
  expect(headers.has("authorization")).toBe(false);
  expect(owner.prepare.mock.calls[0][0]).toBe(target);
  expect(owner.prepare.mock.calls[0][1].get("authorization")).toBe(
    "Bearer synthetic.fixture.initial"
  );
  expect(owner.dispatch).toHaveBeenCalledTimes(1);
  live = false;
  expect(await request(body, new AbortController().signal)).toBeNull();
  expect(owner.dispatch).toHaveBeenCalledTimes(1);
  connection.close();
});

it("shares renewal within the captured account and organization", async () => {
  const owner = fixture({ expiresAt: Date.now() + 1_000 });
  const connection = await NativeGatewayConnection.open(owner.options);
  const replacement = Promise.withResolvers<void>();
  owner.mint.mockImplementationOnce(async (_, accept) => {
    await replacement.promise;
    accept({
      ...owner.grant,
      token: "synthetic.fixture.renewed",
      expiresAt: Date.now() + 120_000,
    });
  });
  const request = connection.prepare(target, new Headers())!;
  const signal = new AbortController().signal;
  const attempts = [request(body, signal), request(body, signal)];
  expect(owner.mint).toHaveBeenCalledTimes(2);
  expect(owner.mint.mock.calls[1][0]).toBe(12);
  expect(owner.dispatch).not.toHaveBeenCalled();
  replacement.resolve();
  await Promise.all(attempts);
  expect(owner.dispatch).toHaveBeenCalledTimes(2);
  expect(
    owner.prepare.mock.calls.map(([, headers]) => headers.get("authorization"))
  ).toEqual(Array(2).fill("Bearer synthetic.fixture.renewed"));
  connection.close();
});

it("does not dispatch after a scope change, a cancelled request, or close during renewal", async () => {
  const owner = fixture({ expiresAt: Date.now() + 1_000 });
  const connection = await NativeGatewayConnection.open(owner.options);
  const request = connection.prepare(target, new Headers())!;
  const signal = new AbortController();
  signal.abort();
  expect(await request(body, signal.signal)).toBeNull();
  owner.mint.mockImplementationOnce(async (_, accept) =>
    accept({
      ...owner.grant,
      subject: "someone-else",
      expiresAt: Date.now() + 120_000,
    })
  );
  expect(await request(body, new AbortController().signal)).toBeNull();
  const replacement = Promise.withResolvers<void>();
  owner.mint.mockImplementationOnce(async (_, accept) => {
    await replacement.promise;
    accept({ ...owner.grant, expiresAt: Date.now() + 120_000 });
  });
  const pending = request(body, new AbortController().signal);
  connection.close();
  replacement.resolve();
  expect(await pending).toBeNull();
  expect(owner.dispatch).not.toHaveBeenCalled();
});

const resourcesPath = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
it.skipIf(!resourcesPath || !["darwin", "linux"].includes(process.platform))(
  "retains an unconfirmed presentation without repeating the send or stopping artifact work",
  async () => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-desktop-presentation-")
    );
    const cwd = path.join(root, "workspace");
    await fs.mkdir(cwd, { mode: 0o700 });
    const owner = fixture();
    const connection = await NativeGatewayConnection.open(owner.options);
    const editor = "https://editor.fixture.invalid";
    const send = vi.fn<(channel: string, payload: unknown) => void>();
    const frame = { url: `${editor}/desktop/workspace?id=workspace`, send };
    const contents = Object.assign(new EventEmitter(), {
      mainFrame: frame,
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
    });
    const event = {
      sender: contents,
      senderFrame: frame,
    } as unknown as IpcMainInvokeEvent;
    const original = NativeEditorSurfaceEndpoints.prototype.open;
    let lostCallId: string | undefined;
    const open = vi
      .spyOn(NativeEditorSurfaceEndpoints.prototype, "open")
      .mockImplementation(function (this: NativeEditorSurfaceEndpoints, value) {
        const reply = original.call(this, value);
        if (!reply?.requested) return reply;
        const { path } = value as { path: string };
        if (path === "/unconfirmed.svg")
          return { ...reply, callId: randomUUID() };
        if (path === "/lost.svg") lostCallId = reply.callId;
        return reply;
      });
    const channel = NativeAgentProcess.prototype as unknown as {
      write(message: { result?: { callId?: string } }): void;
    };
    const sendFrame = channel.write;
    let droppedAcks = 0;
    const write = vi
      .spyOn(channel, "write")
      .mockImplementation(function (this: NativeAgentProcess, message) {
        if (lostCallId && message.result?.callId === lostCallId) {
          droppedAcks++;
          return;
        }
        sendFrame.call(this, message);
      });
    const providerInputs: {
      messages: { role: string; content: string }[];
      tools: { function: { name: string } }[];
    }[] = [];
    owner.dispatch.mockImplementation(async (body) => {
      providerInputs.push(JSON.parse(body.toString()));
      const step = providerInputs.length;
      const chunk = (delta: unknown, reason: string | null) =>
        `data: ${JSON.stringify({ id: `presentation-${step}`, choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`;
      const reply =
        step <= 3
          ? chunk(
              {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: `present-${step}`,
                    type: "function",
                    function: {
                      name: "surface_open",
                      arguments: JSON.stringify({
                        path: ["/ready.svg", "/unconfirmed.svg", "/lost.svg"][
                          step - 1
                        ],
                      }),
                    },
                  },
                ],
              },
              null
            ) + chunk({}, "tool_calls")
          : chunk({ content: "Artifact work finished." }, null) +
            chunk({}, "stop");
      return new Response(reply + "data: [DONE]\n\n", {
        headers: { "content-type": "text/event-stream" },
      });
    });
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        ...connection.launch("fixture"),
        resourcesPath: resourcesPath!,
        stateDirectory: path.join(root, "state"),
        cwd,
      });
      const active = { workspaceId: "workspace", chat };
      const ipc = new NativeChatIpc(
        editor,
        (sender) => (sender === event.sender ? active : null),
        undefined,
        undefined,
        async () => true
      );
      const attached = await ipc.create(event);
      const id = attached.attachmentId;
      ipc.publishEditorSurfaces(
        event,
        id,
        { active: null, open: [], truncated: false },
        1
      );
      const accepted = await ipc.submit(
        event,
        id,
        "present",
        "Show the artifact.",
        "act"
      );
      const observed = await vi.waitFor(
        async () => {
          const observation = await ipc.observe(event, id);
          expect(observation.snapshot.current).toBeNull();
          expect(observation.snapshot.latest).toMatchObject({
            turnId: accepted.turnId,
            status: "succeeded",
          });
          return observation;
        },
        { timeout: 8000 }
      );
      expect(providerInputs).toHaveLength(4);
      expect(
        providerInputs[0].tools.map((tool) => tool.function.name)
      ).toContain("surface_open");
      const results = providerInputs[3].messages
        .filter((message) => message.role === "tool")
        .map((message) => JSON.parse(message.content));
      expect(results).toEqual([
        expect.objectContaining({
          status: "succeeded",
          structured: expect.objectContaining({
            path: "/ready.svg",
            requested: true,
          }),
        }),
        expect.objectContaining({ status: "uncertain" }),
        expect.objectContaining({ status: "uncertain" }),
      ]);
      expect(send.mock.calls).toEqual(
        ["/ready.svg", "/unconfirmed.svg", "/lost.svg"].map((path) => [
          IPC_CHANNELS.NATIVE_CHAT_EDITOR_SURFACE_OPEN,
          {
            attachmentId: id,
            path,
            revision: 1,
            expiresAtMs: expect.any(Number),
          },
        ])
      );
      expect(open).toHaveBeenCalledTimes(3);
      expect(droppedAcks).toBe(1);
      await expect(
        ipc.turnSummary(event, id, observed.observationId)
      ).resolves.toMatchObject({
        status: "succeeded",
        text: "Artifact work finished.",
        unresolvedOperations: 2,
        toolActivity: { succeeded: 1, unresolved: 2 },
      });
      expect(chat.acceptsSavedChatDeletion).toBe(true);
      const entry = await ipc.catalogEntry(event, id);
      await expect(
        ipc.deleteSavedChat(event, id, observed.observationId, entry.revision)
      ).resolves.toBe(true);
      expect(send).toHaveBeenCalledTimes(3);
    } finally {
      write.mockRestore();
      open.mockRestore();
      try {
        await chat?.close();
      } finally {
        connection.close();
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  },
  20_000
);

it.skipIf(!resourcesPath)(
  "reads the current tabs through one exact workbench attachment and refuses replacement state",
  async () => {
    const root = await fs.mkdtemp(
      path.join(
        await fs.realpath(os.tmpdir()),
        "grida-desktop-editor-surfaces-"
      )
    );
    const cwd = path.join(root, "workspace");
    await fs.mkdir(cwd, { mode: 0o700 });
    const owner = fixture();
    const connection = await NativeGatewayConnection.open(owner.options);
    const editor = "https://editor.fixture.invalid";
    const window = () => {
      const frame = { url: `${editor}/desktop/workspace?id=workspace` };
      const contents = Object.assign(new EventEmitter(), {
        mainFrame: frame,
        isDestroyed: () => false,
        isLoadingMainFrame: () => false,
      });
      return {
        contents,
        event: {
          sender: contents,
          senderFrame: frame,
        } as unknown as IpcMainInvokeEvent,
      };
    };
    const first = window();
    const other = window();
    const accepted = Promise.withResolvers<void>();
    const providerInputs: {
      messages: { role: string; content: string }[];
      tools: { function: { name: string } }[];
    }[] = [];
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        ...connection.launch("fixture"),
        resourcesPath: resourcesPath!,
        stateDirectory: path.join(root, "state"),
        cwd,
      });
      const active = { workspaceId: "workspace", chat };
      const ipc = new NativeChatIpc(editor, (sender) =>
        sender === first.event.sender || sender === other.event.sender
          ? active
          : null
      );
      const parent = await ipc.create(first.event);
      const alternative = await ipc.load(other.event, parent.sessionId);
      const open = ["/first.svg", "/second.canvas"];
      const snapshot = (active: string) => ({ active, open, truncated: false });
      ipc.publishEditorSurfaces(
        first.event,
        parent.attachmentId,
        snapshot(open[0])
      );
      ipc.publishEditorSurfaces(other.event, alternative.attachmentId, {
        active: "/unrelated.svg",
        open: ["/unrelated.svg"],
        truncated: false,
      });
      owner.dispatch.mockImplementation(async (body) => {
        providerInputs.push(JSON.parse(body.toString()));
        const step = providerInputs.length;
        if (step === 2)
          ipc.publishEditorSurfaces(
            first.event,
            parent.attachmentId,
            snapshot(open[1])
          );
        if (step === 3) {
          await accepted.promise;
          first.contents.emit("did-start-navigation", { isMainFrame: true });
        }
        const event = (delta: unknown, reason: string | null) =>
          `data: ${JSON.stringify({ id: `step-${step}`, choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`;
        const reply =
          step <= 3
            ? event(
                {
                  role: "assistant",
                  tool_calls: [
                    {
                      index: 0,
                      id: `read-${step}`,
                      type: "function",
                      function: { name: "surface_list_open", arguments: "{}" },
                    },
                  ],
                },
                null
              ) + event({}, "tool_calls")
            : event({ content: "Finished reading editor tabs." }, null) +
              event({}, "stop");
        return new Response(reply + "data: [DONE]\n\n", {
          headers: { "content-type": "text/event-stream" },
        });
      });
      const submitted = await ipc.submitWithWakeup(
        first.event,
        parent.attachmentId,
        "surface-fixture",
        "Tell me what is open."
      );
      accepted.resolve();
      await vi.waitFor(
        async () => {
          const { snapshot } = await ipc.observe(
            other.event,
            alternative.attachmentId
          );
          expect(snapshot.current).toBeNull();
          expect(snapshot.latest).toMatchObject({
            turnId: submitted.turnId,
            status: "succeeded",
          });
        },
        { timeout: 5000 }
      );
      expect(providerInputs).toHaveLength(4);
      expect(
        providerInputs[0].tools.map((tool) => tool.function.name)
      ).toContain("surface_list_open");
      const results = providerInputs[3].messages
        .filter((message) => message.role === "tool")
        .map((message) => JSON.parse(message.content));
      expect(results).toEqual([
        expect.objectContaining({
          status: "succeeded",
          structured: { interactive: true, ...snapshot(open[0]) },
        }),
        expect.objectContaining({
          status: "succeeded",
          structured: { interactive: true, ...snapshot(open[1]) },
        }),
        expect.objectContaining({
          status: "failed",
          content: ["editor_surface_endpoint_unavailable"],
          structured: null,
        }),
      ]);
      expect(JSON.stringify(providerInputs)).not.toContain("/unrelated.svg");
    } finally {
      accepted.resolve();
      try {
        await chat?.close();
      } finally {
        connection.close();
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  },
  20_000
);

it.skipIf(!resourcesPath)(
  "restarts a native Gateway chat under its captured scope only",
  async () => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-gateway-scope-")
    );
    const cwd = path.join(root, "workspace");
    await fs.mkdir(cwd);
    const first = fixture();
    const rotated = fixture({ token: "synthetic.fixture.rotated" });
    const changed = fixture({ organizationId: 19 });
    const connections = await Promise.all(
      [first, rotated, changed].map((owner) =>
        NativeGatewayConnection.open(owner.options)
      )
    );
    expect(connections[0].scope).toBe(connections[1].scope);
    expect(connections[2].scope).not.toBe(connections[0].scope);
    for (const owner of [first, rotated, changed]) {
      owner.dispatch.mockImplementation(async (data) => {
        expect(JSON.parse(data.toString()).model).toBe("fixture");
        const reply =
          'data: {"id":"fixture","choices":[{"index":0,"delta":{"content":"Scoped reply"},"finish_reason":null}]}\n\n' +
          'data: {"id":"fixture","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
          "data: [DONE]\n\n";
        return new Response(reply, {
          headers: { "content-type": "text/event-stream" },
        });
      });
    }
    const stateDirectory = path.join(root, "state");
    const open = (connection: NativeGatewayConnection) =>
      NativeAgentProcess.start({
        ...connection.launch("fixture"),
        resourcesPath: resourcesPath!,
        stateDirectory,
      });
    const prompt = (agent: NativeAgentProcess, sessionId: string) =>
      agent.request("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text: "Fixture prompt" }],
      });
    let agent: NativeAgentProcess | undefined;
    try {
      agent = await open(connections[0]);
      const { sessionId } = (await agent.request("session/new", {
        cwd,
        mcpServers: [],
      })) as { sessionId: string };
      await expect(prompt(agent, sessionId)).resolves.toMatchObject({
        stopReason: "end_turn",
      });
      await agent.close();
      agent = await open(connections[1]);
      await agent.request("session/load", { sessionId, cwd, mcpServers: [] });
      await expect(prompt(agent, sessionId)).resolves.toMatchObject({
        stopReason: "end_turn",
      });
      await agent.close();
      agent = await open(connections[2]);
      await agent.request("session/load", { sessionId, cwd, mcpServers: [] });
      await expect(prompt(agent, sessionId)).rejects.toThrow(
        "session_execution_configuration_changed"
      );
      expect(first.dispatch).toHaveBeenCalledTimes(1);
      expect(rotated.dispatch).toHaveBeenCalledTimes(1);
      expect(changed.dispatch).not.toHaveBeenCalled();
    } finally {
      try {
        await agent?.close();
      } finally {
        connections.forEach((connection) => connection.close());
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  },
  20_000
);

it.skipIf(!resourcesPath)(
  "keeps a named child's exact assignment under the captured supervised Gateway scope",
  async () => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-gateway-child-")
    );
    const cwd = path.join(root, "workspace");
    await fs.mkdir(cwd, { mode: 0o700 });
    const initial = fixture();
    const rotated = fixture({ token: "synthetic.fixture.rotated" });
    const changed = fixture({ organizationId: 19 });
    const connections = await Promise.all(
      [initial, rotated, changed].map((owner) =>
        NativeGatewayConnection.open(owner.options)
      )
    );
    const [first, renewed, other] = connections;
    let cancelledStream = false;
    function reply(text: string, hold = false): Response {
      const event = (delta: unknown, reason: string | null) =>
        `data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`;
      const content = event({ role: "assistant", content: text }, null);
      const stream = hold
        ? new ReadableStream<Uint8Array>({
            start: (controller) =>
              controller.enqueue(new TextEncoder().encode(content)),
            cancel: () => {
              cancelledStream = true;
            },
          })
        : content + event({}, "stop") + "data: [DONE]\n\n";
      return new Response(stream, {
        headers: { "content-type": "text/event-stream" },
      });
    }
    initial.dispatch.mockImplementation(async (body) => {
      const prompt = JSON.parse(body.toString());
      expect(prompt.model).toBe("fixture");
      const input = prompt.messages.at(-1)?.content;
      if (input === "First child assignment")
        return reply("First child result.");
      if (input === "Held child assignment")
        return reply("Partial child answer.", true);
      return reply("Parent result.");
    });
    rotated.dispatch.mockImplementation(async (body) => {
      expect(body.includes("Held child assignment")).toBe(true);
      return reply("Continued child result.");
    });
    const stateDirectory = path.join(root, "state");
    const open = (connection: NativeGatewayConnection) =>
      NativeAgentProcess.start({
        ...connection.launch("fixture"),
        resourcesPath: resourcesPath!,
        stateDirectory,
        subagents: true,
        capabilities: { "co.grida/session/snapshot": 1 },
      });
    type ChildTurn = {
      turnId: string;
      epoch: number;
      journalPosition: number;
      controlRevision: number;
      paused: boolean;
      disposition: string;
    };
    type ChildView = {
      sessionRevision: number;
      current: ChildTurn | null;
      assignment: {
        inputId: string;
        parentTurnId: string;
        turn: ChildTurn | null;
        result: { turnId: string; status: string; text: string } | null;
      } | null;
    };
    let agent: NativeAgentProcess | undefined;
    try {
      agent = await open(first);
      expect(agent.acceptsSubagents).toBe(true);
      const { sessionId: parentSessionId } = (await agent.request(
        "session/new",
        {
          cwd,
          mcpServers: [],
        }
      )) as { sessionId: string };
      await expect(
        agent.request("session/prompt", {
          sessionId: parentSessionId,
          prompt: [{ type: "text", text: "Private parent context" }],
        })
      ).resolves.toMatchObject({ stopReason: "end_turn" });
      const { latest } = (await agent.request("_co.grida/session/snapshot", {
        sessionId: parentSessionId,
      })) as { latest: { turnId: string } };
      const { childId } = (await agent.request("_co.grida/subagent/create", {
        parentSessionId,
        requestId: "create-reviewer",
        name: "Reviewer",
        workTurns: 3,
      })) as { childId: string };
      const assign = (inputId: string, instructions: string) =>
        agent!.request("_co.grida/subagent/assign", {
          parentSessionId,
          childId,
          parentTurnId: latest.turnId,
          inputId,
          instructions,
        });
      const inspect = (inputId: string) =>
        agent!.request("_co.grida/subagent/inspect", {
          parentSessionId,
          childId,
          inputId,
        }) as Promise<ChildView>;
      const load = () =>
        agent!.request("session/load", {
          sessionId: parentSessionId,
          cwd,
          mcpServers: [],
        });
      const control = (view: ChildView, requestId: string) => ({
        parentSessionId,
        childId,
        requestId,
        turnId: view.current!.turnId,
        expectedSessionRevision: view.sessionRevision,
        expectedControlRevision: view.current!.controlRevision,
      });
      const resume = (view: ChildView, requestId: string) =>
        agent!.request("_co.grida/subagent/resume", {
          task: control(view, requestId),
          expectedEpoch: view.current!.epoch,
          expectedJournalPosition: view.current!.journalPosition,
        });
      await assign("first-assignment", "First child assignment");
      const completed = await vi.waitFor(async () => {
        const view = await inspect("first-assignment");
        expect(view.assignment?.result?.text).toBe("First child result.");
        expect(view.assignment?.result?.turnId).toBe(
          view.assignment?.turn?.turnId
        );
        return view.assignment;
      });
      expect(initial.dispatch).toHaveBeenCalledTimes(2);
      const childRequest = initial.dispatch.mock.calls[1][0].toString();
      expect(JSON.parse(childRequest).tools).toBeUndefined();
      expect(childRequest).not.toContain("Private parent context");
      await assign("held-assignment", "Held child assignment");
      const active = await vi.waitFor(async () => {
        expect(initial.dispatch).toHaveBeenCalledTimes(3);
        const view = await inspect("held-assignment");
        expect(view.current?.disposition).toBe("running");
        return view;
      });
      await agent.request(
        "_co.grida/subagent/pause",
        control(active, "pause-child")
      );
      await vi.waitFor(async () => {
        const view = await inspect("held-assignment");
        expect(view.current).toMatchObject({
          paused: true,
          disposition: "suspended",
        });
      });
      await agent.close();
      expect(cancelledStream).toBe(true);

      agent = await open(other);
      await load();
      const held = await inspect("held-assignment");
      expect(held.current?.turnId).toBe(active.current?.turnId);
      await expect(resume(held, "other-resume")).rejects.toThrow(
        "subagent_authority_changed"
      );
      await expect(assign("other-input", "New work")).rejects.toThrow(
        "session_execution_configuration_changed"
      );
      expect(changed.dispatch).not.toHaveBeenCalled();
      await agent.close();

      agent = await open(renewed);
      await load();
      expect((await inspect("first-assignment")).assignment).toEqual(completed);
      await expect(
        resume(await inspect("held-assignment"), "same-resume")
      ).resolves.toMatchObject({
        turn: { turnId: active.current?.turnId },
      });
      await vi.waitFor(async () => {
        const view = await inspect("held-assignment");
        expect(view.assignment).toMatchObject({
          inputId: "held-assignment",
          parentTurnId: latest.turnId,
          result: {
            text: "Continued child result.",
            turnId: active.current?.turnId,
          },
        });
      });
      expect(rotated.dispatch).toHaveBeenCalledTimes(1);
      expect(rotated.prepare.mock.calls[0][0]).toBe(target);
      expect(rotated.prepare.mock.calls[0][1].get("authorization")).toBe(
        "Bearer synthetic.fixture.rotated"
      );
      expect(initial.prepare.mock.calls.every(([url]) => url === target)).toBe(
        true
      );
    } finally {
      try {
        await agent?.close();
      } finally {
        connections.forEach((connection) => connection.close());
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  },
  30_000
);

it.skipIf(!resourcesPath)(
  "controls exact named work, messages, and its held queue through the guarded Desktop bridge",
  async () => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-desktop-subagent-")
    );
    const cwd = path.join(root, "workspace");
    await fs.mkdir(cwd, { mode: 0o700 });
    const owner = fixture();
    const connection = await NativeGatewayConnection.open(owner.options);
    let cancellations = 0;
    const correction = "Use the newer draft.";
    owner.dispatch.mockImplementation(async (body) => {
      const messages = JSON.parse(body.toString()).messages;
      const input = messages.at(-1).content;
      const steered = input === correction;
      const hold =
        !steered &&
        (input === "Hold this review." || input === "Stop this review.");
      const text = steered
        ? "Review of the newer draft."
        : input === "Review the first draft."
          ? "First review."
          : "Fixture answer.";
      const chunk = `data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] })}\n\n`;
      const response = hold
        ? new ReadableStream<Uint8Array>({
            start: (stream) => stream.enqueue(new TextEncoder().encode(chunk)),
            cancel: () => {
              cancellations++;
            },
          })
        : chunk +
          'data: {"id":"fixture","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
          "data: [DONE]\n\n";
      return new Response(response, {
        headers: { "content-type": "text/event-stream" },
      });
    });
    let chat: NativeAgentChat | undefined;
    try {
      chat = await NativeAgentChat.start({
        ...connection.launch("fixture"),
        subagents: true,
        resourcesPath: resourcesPath!,
        stateDirectory: path.join(root, "state"),
        cwd,
      });
      const editor = "https://editor.fixture.invalid";
      const window = () => {
        const frame = { url: `${editor}/desktop/workspace?id=workspace` };
        const sender = Object.assign(new EventEmitter(), {
          mainFrame: frame,
          isDestroyed: () => false,
          isLoadingMainFrame: () => false,
        }) as unknown as WebContents;
        return { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent;
      };
      const first = window();
      const second = window();
      const active = { workspaceId: "workspace", chat };
      const ipc = new NativeChatIpc(editor, (sender) =>
        sender === first.sender || sender === second.sender ? active : null
      );
      const parent = await ipc.create(first);
      const aid = parent.attachmentId;
      const submitted = await ipc.submit(
        first,
        aid,
        "sponsor",
        "Review the project."
      );
      const sponsor = await vi.waitFor(async () => {
        const observed = await ipc.observe(first, aid);
        expect(observed.snapshot.subagentsAvailable).toBe(true);
        expect(observed.snapshot.current).toBeNull();
        expect(observed.snapshot.latest?.turnId).toBe(submitted.turnId);
        return observed;
      });
      const create = {
        requestId: randomUUID(),
        name: "Reviewer",
        workTurns: 5,
      };
      const child = await ipc.createSubagent(first, aid, create);
      await expect(ipc.createSubagent(first, aid, create)).resolves.toEqual(
        child
      );
      await expect(ipc.listSubagents(first, aid, undefined)).resolves.toEqual({
        children: [child],
        nextAfterChildId: null,
      });
      const assign = (instructions: string) => ({
        childId: child.childId,
        parentObservationId: sponsor.observationId,
        inputId: randomUUID(),
        instructions,
      });
      const completed = assign("Review the first draft.");
      await ipc.assignSubagent(first, aid, completed);
      await vi.waitFor(async () => {
        const observed = await ipc.inspectSubagent(
          first,
          aid,
          child.childId,
          undefined
        );
        expect(observed.child.assignment).toMatchObject({
          inputId: completed.inputId,
          parentTurnId: submitted.turnId,
          instructionPreview: completed.instructions,
          result: { text: "First review." },
        });
      });
      const held = assign("Hold this review.");
      await ipc.assignSubagent(first, aid, held);
      const running = await vi.waitFor(async () => {
        expect(owner.dispatch).toHaveBeenCalledTimes(3);
        const observed = await ipc.inspectSubagent(
          first,
          aid,
          child.childId,
          held.inputId
        );
        expect(observed.stopObservationId).toEqual(expect.any(String));
        expect(observed.turnControls).toEqual(["pause", "steer"]);
        return observed;
      });
      const old = await ipc.inspectSubagent(
        first,
        aid,
        child.childId,
        completed.inputId
      );
      expect(old.stopObservationId).toBeNull();
      expect(old.turnControls).toBeUndefined();
      expect(old.child.assignment?.result?.text).toBe("First review.");
      const attached = await ipc.load(second, parent.sessionId);
      const pause = { kind: "pause" };
      const pauseId = randomUUID();
      await expect(
        ipc.controlSubagentTurn(
          first,
          aid,
          running.stopObservationId!,
          randomUUID(),
          {
            kind: "pause",
            expectedControlRevision: 0,
          }
        )
      ).rejects.toThrow("native_chat_subagent_invalid_input");
      await expect(
        ipc.controlSubagentTurn(
          first,
          aid,
          running.stopObservationId!,
          randomUUID(),
          {
            kind: "resume",
          }
        )
      ).rejects.toThrow("native_chat_subagent_invalid_input");
      await expect(
        ipc.controlSubagentTurn(
          second,
          attached.attachmentId,
          running.stopObservationId!,
          pauseId,
          pause
        )
      ).rejects.toThrow("native_chat_subagent_observation_unavailable");
      await ipc.controlSubagentTurn(
        first,
        aid,
        running.stopObservationId!,
        pauseId,
        pause
      );
      await ipc.controlSubagentTurn(
        first,
        aid,
        running.stopObservationId!,
        pauseId,
        pause
      );
      const paused = await vi.waitFor(async () => {
        const view = await ipc.inspectSubagent(
          first,
          aid,
          child.childId,
          held.inputId
        );
        expect(view.child.current).toMatchObject({
          paused: true,
          disposition: "suspended",
        });
        expect(view.turnControls).toEqual(["resume", "steer"]);
        expect(cancellations).toBe(1);
        return view;
      });
      const steer = { kind: "steer", instructions: correction };
      const steerId = randomUUID();
      await ipc.controlSubagentTurn(
        first,
        aid,
        paused.stopObservationId!,
        steerId,
        steer
      );
      await ipc.controlSubagentTurn(
        first,
        aid,
        paused.stopObservationId!,
        steerId,
        steer
      );
      expect(owner.dispatch).toHaveBeenCalledTimes(3);
      const steered = await ipc.inspectSubagent(
        first,
        aid,
        child.childId,
        held.inputId
      );
      expect(steered.stopObservationId).not.toBe(paused.stopObservationId);
      const resume = { kind: "resume" };
      const resumeId = randomUUID();
      await ipc.controlSubagentTurn(
        first,
        aid,
        steered.stopObservationId!,
        resumeId,
        resume
      );
      await ipc.controlSubagentTurn(
        first,
        aid,
        steered.stopObservationId!,
        resumeId,
        resume
      );
      await vi.waitFor(async () => {
        const view = await ipc.inspectSubagent(
          first,
          aid,
          child.childId,
          held.inputId
        );
        expect(view.child.assignment?.result).toMatchObject({
          turnId: running.child.current?.turnId,
          text: "Review of the newer draft.",
        });
      });
      expect(owner.dispatch).toHaveBeenCalledTimes(4);

      const stopping = assign("Stop this review.");
      await ipc.assignSubagent(first, aid, stopping);
      const activeStop = await vi.waitFor(async () => {
        expect(owner.dispatch).toHaveBeenCalledTimes(5);
        const observed = await ipc.inspectSubagent(
          first,
          aid,
          child.childId,
          stopping.inputId
        );
        expect(observed.stopObservationId).toEqual(expect.any(String));
        return observed;
      });
      const stopId = randomUUID();
      await ipc.stopSubagent(first, aid, activeStop.stopObservationId!, stopId);
      await ipc.stopSubagent(first, aid, activeStop.stopObservationId!, stopId);
      await vi.waitFor(async () => {
        const ended = await ipc.inspectSubagent(
          first,
          aid,
          child.childId,
          stopping.inputId
        );
        expect(ended.child.admissionPaused).toBe(true);
        expect(ended.child.assignment?.disposition).toBe("completed");
        expect(ended.stopObservationId).toBeNull();
        expect(cancellations).toBe(2);
      });
      expect(owner.dispatch).toHaveBeenCalledTimes(5);

      const inspect = (inputId?: string) =>
        ipc.inspectSubagent(first, aid, child.childId, inputId);
      const heldQueue = (await inspect()).childControls!;
      expect(heldQueue.available).toEqual(["message", "resume-queue"]);
      const message = { kind: "message", text: "Use the author's checklist." };
      const messageId = randomUUID();
      await expect(
        ipc.controlSubagentChild(
          second,
          attached.attachmentId,
          heldQueue.observationId,
          messageId,
          message
        )
      ).rejects.toThrow("native_chat_subagent_observation_unavailable");
      const childControl = (
        observationId: string,
        requestId: string,
        control: unknown
      ) =>
        ipc.controlSubagentChild(first, aid, observationId, requestId, control);
      await childControl(heldQueue.observationId, messageId, message);
      await childControl(heldQueue.observationId, messageId, message);
      expect((await inspect()).childControls?.pendingMessages).toBe(1);
      expect(owner.dispatch).toHaveBeenCalledTimes(5);

      const withdrawn = assign("Do not start this assignment.");
      await ipc.assignSubagent(first, aid, withdrawn);
      const stale = (await inspect(withdrawn.inputId)).childControls!;
      const retained = assign("Use the retained assignment.");
      await ipc.assignSubagent(first, aid, retained);
      const withdraw = { kind: "withdraw", inputId: withdrawn.inputId };
      await expect(
        childControl(stale.observationId, randomUUID(), withdraw)
      ).rejects.toThrow("stale_session_revision");
      const withBoth = (await inspect(withdrawn.inputId)).childControls!;
      const withdrawalId = randomUUID();
      await childControl(withBoth.observationId, withdrawalId, withdraw);
      await childControl(withBoth.observationId, withdrawalId, withdraw);
      expect((await inspect(withdrawn.inputId)).child).toMatchObject({
        admissionPaused: true,
        queuedInputIds: [retained.inputId],
        assignment: { disposition: "withdrawn" },
      });
      expect(owner.dispatch).toHaveBeenCalledTimes(5);

      const afterWithdrawal = (await inspect()).childControls!;
      const queueResumeId = randomUUID();
      const resumeQueue = { kind: "resume-queue" };
      await childControl(
        afterWithdrawal.observationId,
        queueResumeId,
        resumeQueue
      );
      await vi.waitFor(async () => {
        const next = await inspect(retained.inputId);
        expect(next.child.assignment?.result?.status).toBe("succeeded");
        expect(next.child.admissionPaused).toBe(false);
        expect(next.childControls?.pendingMessages).toBe(0);
      });
      await childControl(
        afterWithdrawal.observationId,
        queueResumeId,
        resumeQueue
      );
      expect(owner.dispatch).toHaveBeenCalledTimes(6);
      const nextRequest = owner.dispatch.mock.calls[5][0].toString();
      expect(nextRequest).toContain(message.text);
      expect(nextRequest).toContain(retained.instructions);
      expect(nextRequest).not.toContain(withdrawn.instructions);
    } finally {
      try {
        await chat?.close();
      } finally {
        connection.close();
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  },
  30_000
);
