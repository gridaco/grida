import { once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import type { NativeChatStreamUpdate } from "@grida/desktop-bridge";
import {
  NativeAgentChat,
  type NativeAgentChatLaunch,
} from "./native-agent-chat";
import { NativeAgentProcess } from "./native-agent-process";

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
      await expect(client.list(first.nextCursor)).resolves.toEqual({
        sessionIds: saved.slice(32),
        nextCursor: null,
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
      });

      await client.close();
      client = await NativeAgentChat.start(launch);
      const reopened = await client.load(selected.id);
      expect(await client.catalogEntry(reopened)).toEqual(archived);
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
      const entry = await client.catalogEntry(session);
      await client.organize(session, {
        revision: entry.revision,
        title: "Still running",
        archived: true,
      });
      expect((await client.observe(session)).current).toEqual(running.current);
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
