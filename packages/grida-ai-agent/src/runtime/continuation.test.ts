// GRIDA-SEC-004 — human-input settlement never grants an unanswered sibling authority.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convertToModelMessages, type UIMessage } from "ai";
import { ModelCatalogStore } from "@grida/ai";
import { catalog } from "@grida/ai-models/grida";
import {
  AuthStore,
  SecretsStore,
  WorkspaceRegistry,
} from "@grida/daemon/server";
import { openSessionsDb } from "../session/db";
import { SessionsStore } from "../session/store";
import { chunksOf } from "../testing/sse";
import { AgentRuntime, type AgentRuntimeDeps } from ".";

const OPUS = "anthropic/claude-opus-5.5";
const SOL = "openai/gpt-6-sol";
const CALL_METADATA = {
  openrouter: {
    reasoning_details: [
      {
        type: "reasoning.text",
        text: "",
        signature: "synthetic-empty-thinking-signature",
        index: 0,
      },
    ],
  },
};

function stream(chunks: unknown[]): Response {
  return new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
      "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } }
  );
}

describe("AgentRuntime continuation provenance", () => {
  let tempDir: string;
  let store: SessionsStore;
  let runtime: AgentRuntime;
  let modelCatalog: ModelCatalogStore;
  let nextSnapshot: catalog.snapshot.Snapshot;
  let runAgent: NonNullable<AgentRuntimeDeps["run_agent"]>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-continuation-"));
    const secrets = new SecretsStore(new AuthStore(tempDir));
    await secrets.set("openrouter", "synthetic-openrouter-key");
    await secrets.set("vercel", "synthetic-vercel-key");
    store = new SessionsStore(openSessionsDb({ user_data_path: tempDir }));
    nextSnapshot = catalog.snapshot.v2.seed();
    modelCatalog = new ModelCatalogStore({
      base_url: "https://catalog.example.test",
      fetch: async () => Response.json(nextSnapshot),
      refresh_interval_ms: null,
    });
    runAgent = async () => stream([]);
    runtime = new AgentRuntime({
      secrets,
      workspace_registry: new WorkspaceRegistry(tempDir),
      sessions_store: store,
      catalog: modelCatalog,
      run_agent: (...args) => runAgent(...args),
      compaction: { enabled: false },
    });
  });

  afterEach(async () => {
    runtime.dispose();
    modelCatalog.dispose();
    store.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function pause(
    modelId = OPUS,
    providerId = "openrouter",
    metadata: Record<string, Record<string, unknown>> = CALL_METADATA,
    additionalCalls: unknown[] = []
  ) {
    const session = await store.create({
      agent: "grida",
      model: { provider_id: providerId, model_id: modelId, tier: "pro" },
    });
    runAgent = async () =>
      stream([
        { type: "start", messageId: "paused-assistant" },
        { type: "start-step" },
        { type: "reasoning-start", id: "thinking" },
        {
          type: "reasoning-end",
          id: "thinking",
          providerMetadata: metadata,
        },
        {
          type: "tool-input-available",
          toolCallId: "call",
          toolName: "list_files",
          input: { path: "/" },
          providerMetadata: metadata,
        },
        {
          type: "tool-approval-request",
          toolCallId: "call",
          approvalId: "approval",
        },
        ...additionalCalls,
        { type: "finish-step" },
        { type: "finish" },
      ]);
    const response = await runtime.run(
      {
        session_id: session.id,
        messages: [{ id: "user", role: "user", content: "List files" }],
      },
      new AbortController().signal
    );
    expect(response.status).toBe(200);
    await response.text();
    return session;
  }

  const answer = {
    tool_call_id: "call",
    approval_id: "approval",
    approved: true,
  };

  it("rebuilds a same-model approval resume from persisted signed state without requiring usage", async () => {
    const session = await pause();
    const paused = await store.getMessage("paused-assistant");
    expect(paused?.metadata.model).toMatchObject({
      provider_id: "openrouter",
      model_id: OPUS,
    });
    let rebuilt: UIMessage[] = [];
    runAgent = async (_provider, req) => {
      rebuilt = req.messages as UIMessage[];
      return stream([
        { type: "start", messageId: "paused-assistant" },
        {
          type: "tool-output-available",
          toolCallId: "call",
          output: { files: [] },
        },
        { type: "start-step" },
        { type: "text-start", id: "answer" },
        { type: "text-delta", id: "answer", delta: "Done" },
        { type: "text-end", id: "answer" },
        { type: "finish-step" },
        { type: "finish" },
      ]);
    };
    const response = await runtime.run(
      {
        session_id: session.id,
        messages: [],
        approval_answer: answer,
      },
      new AbortController().signal
    );
    expect(response.status).toBe(200);
    await response.text();
    const lowered = await convertToModelMessages(rebuilt);
    const assistant = lowered.find((message) => message.role === "assistant");
    expect(assistant?.content).toEqual(
      expect.arrayContaining([
        { type: "reasoning", text: "", providerOptions: CALL_METADATA },
        {
          type: "tool-call",
          toolCallId: "call",
          toolName: "list_files",
          input: { path: "/" },
          providerOptions: CALL_METADATA,
        },
      ])
    );
    const rows = await store.listVisibleMessages(session.id);
    expect(rows.filter((row) => row.role === "assistant")).toHaveLength(1);
    expect((await store.findToolPart(session.id, "call"))?.data).toMatchObject({
      callProviderMetadata: CALL_METADATA,
      state: "output-available",
    });
  });

  it.each([
    { label: "model", overrides: { model_id: SOL } },
    { label: "provider", overrides: { provider_id: "vercel" } },
  ])(
    "rejects a $label switch before consuming a pending approval",
    async ({ overrides }) => {
      const session = await pause();
      const before = await store.get(session.id);
      let called = false;
      runAgent = async () => {
        called = true;
        return stream([]);
      };
      const response = await runtime.run(
        {
          session_id: session.id,
          messages: [],
          approval_answer: answer,
          ...overrides,
        },
        new AbortController().signal
      );
      await response.text();
      expect(response.status).toBe(409);
      expect(called).toBe(false);
      expect((await store.get(session.id))?.model).toEqual(before?.model);
      expect(await store.matchesPendingApproval(session.id, answer)).toBe(true);
    }
  );

  it("does not relabel an older assistant when a new model emits no persisted content", async () => {
    const session = await store.create({
      agent: "grida",
      model: { provider_id: "openrouter", model_id: OPUS, tier: "pro" },
    });
    const prior = await store.appendMessage(session.id, {
      role: "assistant",
      metadata: { model: { provider_id: "openrouter", model_id: OPUS } },
    });
    await store.upsertPart(prior.id, {
      index: 0,
      type: "text",
      data: { type: "text", text: "Earlier answer" },
    });
    runAgent = async () =>
      stream([
        { type: "start", messageId: "empty-new-assistant" },
        { type: "start-step" },
        { type: "error", errorText: "synthetic provider failure" },
      ]);
    const response = await runtime.run(
      {
        session_id: session.id,
        model_id: SOL,
        messages: [{ id: "new-user", role: "user", content: "New question" }],
      },
      new AbortController().signal
    );
    expect(response.status).toBe(200);
    await response.text();
    expect(await store.getMessage("empty-new-assistant")).toBeNull();
    expect((await store.getMessage(prior.id))?.metadata.model).toEqual({
      provider_id: "openrouter",
      model_id: OPUS,
    });
  });

  it("recognizes an empty-message resume as the persisted assistant continuation", async () => {
    const session = await store.create({
      agent: "grida",
      model: { provider_id: "openrouter", model_id: OPUS, tier: "pro" },
    });
    await store.appendMessage(session.id, { id: "a-user", role: "user" });
    await store.upsertPart("a-user", {
      index: 0,
      type: "text",
      data: { type: "text", text: "Earlier question" },
    });
    await store.appendMessage(session.id, {
      id: "b-assistant",
      role: "assistant",
      metadata: { model: { provider_id: "openrouter", model_id: OPUS } },
    });
    await store.upsertPart("b-assistant", {
      index: 0,
      type: "reasoning",
      data: { type: "reasoning", text: "", providerMetadata: CALL_METADATA },
    });
    let called = false;
    runAgent = async () => {
      called = true;
      return stream([]);
    };
    const response = await runtime.run(
      { session_id: session.id, model_id: SOL, messages: [] },
      new AbortController().signal
    );
    await response.text();
    expect(response.status).toBe(409);
    expect(called).toBe(false);
    expect((await store.get(session.id))?.model?.model_id).toBe(OPUS);
  });

  it("does not replay unfinished reasoning from a failed resumed step", async () => {
    const session = await pause(SOL, "vercel", {
      openai: {
        itemId: "complete-state-item",
        reasoningEncryptedContent: "synthetic-encrypted-continuation",
      },
    });
    runAgent = async () =>
      stream([
        { type: "start", messageId: "paused-assistant" },
        {
          type: "tool-output-available",
          toolCallId: "call",
          output: { files: [] },
        },
        { type: "start-step" },
        {
          type: "reasoning-start",
          id: "unfinished",
          providerMetadata: {
            openai: {
              itemId: "unfinished-state-item",
              reasoningEncryptedContent: null,
            },
          },
        },
        {
          type: "reasoning-delta",
          id: "unfinished",
          delta: "Unfinished reasoning",
        },
        { type: "error", errorText: "synthetic failure before reasoning-end" },
      ]);
    const failed = await runtime.run(
      { session_id: session.id, messages: [], approval_answer: answer },
      new AbortController().signal
    );
    await failed.text();
    await vi.waitFor(() =>
      expect(runtime.streams.isOccupied(session.id)).toBe(false)
    );
    let rebuilt: UIMessage[] = [];
    runAgent = async (_provider, req) => {
      rebuilt = req.messages as UIMessage[];
      return stream([
        { type: "start", messageId: "paused-assistant" },
        { type: "start-step" },
        { type: "reasoning-start", id: "retry-thinking" },
        {
          type: "reasoning-end",
          id: "retry-thinking",
          providerMetadata: {
            openai: {
              itemId: "retry-state-item",
              reasoningEncryptedContent: "synthetic-retry-continuation",
            },
          },
        },
        {
          type: "tool-input-available",
          toolCallId: "retry-call",
          toolName: "list_files",
          input: { path: "/" },
        },
        {
          type: "tool-approval-request",
          toolCallId: "retry-call",
          approvalId: "retry-approval",
        },
        { type: "finish-step" },
        { type: "finish" },
      ]);
    };
    const retry = await runtime.run(
      { session_id: session.id, messages: [] },
      new AbortController().signal
    );
    await retry.text();
    expect(retry.status).toBe(200);
    expect(JSON.stringify(rebuilt)).not.toContain("unfinished-state-item");
    expect(JSON.stringify(rebuilt)).not.toContain("Unfinished reasoning");
    // The earlier complete tool step remains intact; deleting it would hide
    // the completed result rather than repairing the truncated later step.
    expect(JSON.stringify(rebuilt)).toContain(
      "synthetic-encrypted-continuation"
    );
    await vi.waitFor(() =>
      expect(runtime.streams.isOccupied(session.id)).toBe(false)
    );
    runAgent = async (_provider, req) => {
      rebuilt = req.messages as UIMessage[];
      return stream([]);
    };
    const resumeRetry = await runtime.run(
      {
        session_id: session.id,
        messages: [],
        approval_answer: {
          tool_call_id: "retry-call",
          approval_id: "retry-approval",
          approved: true,
        },
      },
      new AbortController().signal
    );
    expect(resumeRetry.status).toBe(200);
    await resumeRetry.text();
    expect(JSON.stringify(rebuilt)).toContain("synthetic-retry-continuation");
    expect(JSON.stringify(rebuilt)).not.toContain("unfinished-state-item");
  });

  it("pins a tier-only run across a catalog refresh before provider execution", async () => {
    let actualModelId: string | undefined;
    runAgent = async (provider, req) => {
      expect(provider.kind).not.toBe("agent-provider");
      if (provider.kind === "agent-provider")
        throw new Error("Expected model provider");
      nextSnapshot.text.tier_model_ids.pro = "openai/gpt-5.6-sol";
      expect(await modelCatalog.refresh("interval")).toBe(true);
      const model = provider.model_factory(req.tier ?? "pro", req.model_id);
      actualModelId = typeof model === "string" ? model : model.modelId;
      return stream([
        { type: "start", messageId: "pinned-assistant" },
        { type: "start-step" },
        { type: "text-start", id: "text" },
        { type: "text-delta", id: "text", delta: "Done" },
        { type: "text-end", id: "text" },
        { type: "finish-step" },
        { type: "finish" },
      ]);
    };
    const response = await runtime.run(
      {
        tier: "pro",
        messages: [{ id: "tier-user", role: "user", content: "Start" }],
      },
      new AbortController().signal
    );
    expect(response.status).toBe(200);
    await response.text();
    expect(modelCatalog.view().tier_model_ids.pro).toBe("openai/gpt-5.6-sol");
    expect(actualModelId).toBe(SOL);
    expect(
      (await store.getMessage("pinned-assistant"))?.metadata.model
    ).toMatchObject({ model_id: actualModelId });
  });

  it.each([
    { label: "two approvals", question: false, questionFirst: false },
    { label: "approval then question", question: true, questionFirst: false },
    { label: "question then approval", question: true, questionFirst: true },
  ])(
    "waits for the whole signed batch before resuming $label",
    async ({ question, questionFirst }) => {
      const secondInput = question
        ? { questions: [{ question: "Which color?" }] }
        : { path: "/second" };
      const session = await pause(OPUS, "openrouter", CALL_METADATA, [
        {
          type: "tool-input-available",
          toolCallId: "second-call",
          toolName: question ? "question" : "list_files",
          input: secondInput,
          providerMetadata: CALL_METADATA,
        },
        ...(!question
          ? [
              {
                type: "tool-approval-request",
                toolCallId: "second-call",
                approvalId: "second-approval",
              },
            ]
          : []),
      ]);
      const answerApproval = {
        session_id: session.id,
        messages: [],
        approval_answer: answer,
      };
      const answerSecond = question
        ? {
            session_id: session.id,
            messages: [
              {
                id: "paused-assistant",
                role: "assistant",
                parts: [
                  {
                    type: "tool-question",
                    toolCallId: "second-call",
                    state: "output-available",
                    input: secondInput,
                    output: { answers: [["Blue"]] },
                  },
                ],
              },
            ],
          }
        : {
            session_id: session.id,
            messages: [],
            approval_answer: {
              tool_call_id: "second-call",
              approval_id: "second-approval",
              approved: true,
            },
          };
      let calls = 0;
      let rebuilt: UIMessage[] = [];
      runAgent = async (_provider, req) => {
        calls++;
        rebuilt = req.messages as UIMessage[];
        return stream([]);
      };

      const first = await runtime.run(
        questionFirst ? answerSecond : answerApproval,
        new AbortController().signal
      );
      expect(first.status).toBe(200);
      await first.text();
      await vi.waitFor(() =>
        expect(runtime.streams.isOccupied(session.id)).toBe(false)
      );
      expect(calls).toBe(0);
      expect(
        await store.findToolPart(
          session.id,
          questionFirst ? "second-call" : "call"
        )
      ).toMatchObject({
        data: {
          state: questionFirst ? "output-available" : "approval-responded",
        },
      });
      expect(
        await store.findToolPart(
          session.id,
          questionFirst ? "call" : "second-call"
        )
      ).toMatchObject({
        data: {
          state:
            question && !questionFirst
              ? "input-available"
              : "approval-requested",
        },
      });
      expect(await store.hasPendingHumanInput(session.id)).toBe(true);

      const final = await runtime.run(
        questionFirst ? answerApproval : answerSecond,
        new AbortController().signal
      );
      expect(final.status).toBe(200);
      await final.text();
      expect(calls).toBe(1);
      const lowered = await convertToModelMessages(rebuilt);
      const assistantContent = lowered.flatMap((message) =>
        message.role === "assistant" && Array.isArray(message.content)
          ? message.content
          : []
      );
      expect(
        assistantContent.filter((part) => part.type === "tool-call")
      ).toEqual([
        {
          type: "tool-call",
          toolCallId: "call",
          toolName: "list_files",
          input: { path: "/" },
          providerOptions: CALL_METADATA,
        },
        {
          type: "tool-call",
          toolCallId: "second-call",
          toolName: question ? "question" : "list_files",
          input: secondInput,
          providerOptions: CALL_METADATA,
        },
      ]);
      expect(
        assistantContent.filter((part) => part.type === "reasoning")
      ).toEqual([
        { type: "reasoning", text: "", providerOptions: CALL_METADATA },
      ]);
      expect(await store.findToolPart(session.id, "second-call")).toMatchObject(
        {
          data: {
            ...(question ? { output: { answers: [["Blue"]] } } : {}),
            callProviderMetadata: CALL_METADATA,
          },
        }
      );
    }
  );

  it("returns an actionable SDK error without hiding completed tools from an interrupted step", async () => {
    const session = await store.create({
      agent: "grida",
      model: { provider_id: "openrouter", model_id: OPUS, tier: "pro" },
    });
    await store.appendMessage(session.id, { id: "a-user", role: "user" });
    await store.upsertPart("a-user", {
      index: 0,
      type: "text",
      data: { type: "text", text: "Run the command" },
    });
    const priorModel = {
      provider_id: "openrouter",
      model_id: OPUS,
      tier: "pro",
    };
    await store.appendMessage(session.id, {
      id: "b-assistant",
      role: "assistant",
      metadata: { model: priorModel },
    });
    await store.upsertPart("b-assistant", {
      index: 0,
      type: "step-start",
      data: { type: "step-start" },
    });
    await store.upsertPart("b-assistant", {
      index: 1,
      type: "tool-run_command",
      tool_call_id: "executed-command",
      tool_state: "output-available",
      data: {
        type: "tool-run_command",
        toolCallId: "executed-command",
        state: "output-available",
        input: { command: "synthetic-command-already-ran" },
        output: { exit_code: 0 },
        callProviderMetadata: CALL_METADATA,
      },
    });
    await store.upsertPart("b-assistant", {
      index: 2,
      type: "reasoning",
      data: {
        type: "reasoning",
        text: "Partial reasoning",
        state: "streaming",
      },
    });
    const before = await store.listVisibleMessages(session.id);
    let called = false;
    runAgent = async () => {
      called = true;
      return stream([]);
    };
    const response = await runtime.run(
      { session_id: session.id, messages: [] },
      new AbortController().signal
    );
    expect(response.status).toBe(200);
    const chunks = chunksOf(await response.text());
    await vi.waitFor(() =>
      expect(runtime.streams.isOccupied(session.id)).toBe(false)
    );
    expect(chunks).toEqual([
      {
        type: "error",
        errorText:
          "This interrupted step already has a tool result. Start a new user turn to continue without replaying incomplete provider state.",
      },
    ]);
    expect(called).toBe(false);
    expect(await store.listVisibleMessages(session.id)).toEqual(before);
    expect((await store.getMessage("b-assistant"))?.metadata.model).toEqual(
      priorModel
    );
  });
});
