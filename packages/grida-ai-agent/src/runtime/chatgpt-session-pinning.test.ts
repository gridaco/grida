// GRIDA-SEC-008 — continuations, queue drain, and auxiliary work stay provider-pinned.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthStore,
  SecretsStore,
  WorkspaceRegistry,
} from "@grida/daemon/server";
import { AGENT_SESSION_AGENT } from "../protocol/run";
import { openSessionsDb } from "../session/db";
import { SessionsStore } from "../session/store";
import type { compactor } from "../session/compactor";
import type { ChatGptCredentialManager } from "../providers/chatgpt-credentials";
import type {
  ChatGptProviderConfig,
  ChatGptProviderRuntime,
} from "../providers/chatgpt";
import { AgentRuntime } from ".";

const CHATGPT_CONFIG: ChatGptProviderConfig = {
  oauth: {
    authorize_url: "https://auth.example.test/oauth/authorize",
    token_url: "https://auth.example.test/oauth/token",
    client_id: "grida-test-client",
    redirect_uris: ["http://localhost:1455/auth/callback"],
    scopes: ["openid", "offline_access"],
    authorization_parameters: { originator: "grida" },
  },
  responses_url: "https://chatgpt.example.test/backend-api/codex/responses",
  originator: "grida",
  default_model_id: "openai/gpt-5.6-terra",
};

const fakeRunAgent = async (): Promise<Response> =>
  new Response(
    'data: {"type":"text-start","id":"t0"}\n\n' +
      'data: {"type":"text-delta","id":"t0","delta":"ok"}\n\n' +
      'data: {"type":"text-end","id":"t0"}\n\n' +
      "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } }
  );

describe("AgentRuntime — persisted ChatGPT/provider session identity", () => {
  let baseDir: string;
  let store: SessionsStore;
  let runtime: AgentRuntime;
  let chatGptReady: boolean;
  let runProviders: string[];
  let inspectCompactor:
    | ((options: compactor.SummarizeOptions) => void)
    | undefined;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "grida-chatgpt-session-pin-")
    );
    const auth = new AuthStore(baseDir);
    const secrets = new SecretsStore(auth);
    await secrets.set("openrouter", "openrouter-test-key");
    store = new SessionsStore(openSessionsDb({ user_data_path: baseDir }));
    chatGptReady = false;
    runProviders = [];
    inspectCompactor = undefined;
    const credentials = {
      supportsAccount: async () => chatGptReady,
    } as unknown as ChatGptCredentialManager;
    const chatgpt: ChatGptProviderRuntime = {
      config: CHATGPT_CONFIG,
      credentials,
    };
    runtime = new AgentRuntime({
      secrets,
      chatgpt,
      workspace_registry: new WorkspaceRegistry(baseDir),
      sessions_store: store,
      run_agent: async (provider) => {
        runProviders.push(provider.provider_id);
        return fakeRunAgent();
      },
      compaction: {
        summarize: async (options) => {
          inspectCompactor?.(options);
          return "## Summary\nPinned provider.";
        },
      },
      drain_cooldown_ms: 20,
    });
  });

  afterEach(async () => {
    runtime.dispose();
    store.close();
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("chooses and persists ChatGPT for a fresh compatible provider-unqualified run", async () => {
    chatGptReady = true;

    const response = await runtime.run(
      {
        model_id: "openai/gpt-5.6-terra",
        messages: [
          { id: "fresh-chatgpt", role: "user", content: "start with ChatGPT" },
        ],
      },
      new AbortController().signal
    );
    expect(response.status).toBe(200);
    await response.text();
    await vi.waitFor(() => expect(runProviders).toEqual(["chatgpt"]));

    const sessions = await store.list({ agent: AGENT_SESSION_AGENT });
    expect(sessions.items).toHaveLength(1);
    expect(sessions.items[0]?.model).toMatchObject({
      provider_id: "chatgpt",
      model_id: "openai/gpt-5.6-terra",
    });
  });

  it("keeps a BYOK session on BYOK after ChatGPT becomes ready", async () => {
    const session = await store.create({
      agent: AGENT_SESSION_AGENT,
      model: {
        provider_id: "openrouter",
        tier: "pro",
        model_id: "openai/gpt-5.6-terra",
      },
    });
    chatGptReady = true;

    const response = await runtime.run(
      {
        session_id: session.id,
        messages: [{ id: "byok-next", role: "user", content: "continue" }],
      },
      new AbortController().signal
    );
    expect(response.status).toBe(200);
    await response.text();
    await vi.waitFor(() => expect(runProviders).toEqual(["openrouter"]));
    expect((await store.get(session.id))?.model).toMatchObject({
      provider_id: "openrouter",
      model_id: "openai/gpt-5.6-terra",
    });
  });

  it("fails a signed-out ChatGPT session instead of falling back to BYOK", async () => {
    const session = await store.create({
      agent: AGENT_SESSION_AGENT,
      model: {
        provider_id: "chatgpt",
        tier: "pro",
        model_id: "openai/gpt-5.6-terra",
      },
    });
    chatGptReady = false;

    const response = await runtime.run(
      {
        session_id: session.id,
        messages: [
          { id: "chatgpt-signed-out", role: "user", content: "continue" },
        ],
      },
      new AbortController().signal
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "provider_down",
      provider_id: "chatgpt",
    });
    expect(runProviders).toEqual([]);
  });

  it("validates the inherited session model against an explicit provider override", async () => {
    const session = await store.create({
      agent: AGENT_SESSION_AGENT,
      model: {
        provider_id: "chatgpt",
        tier: "pro",
        model_id: "openai/gpt-5.4",
      },
    });

    const response = await runtime.run(
      {
        session_id: session.id,
        provider_id: "openrouter",
        messages: [
          {
            id: "invalid-inherited-pair",
            role: "user",
            content: "do not rebind this subscription-only model",
          },
        ],
      },
      new AbortController().signal
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "provider_down",
      provider_id: "openrouter",
    });
    expect(runProviders).toEqual([]);
  });

  it("does not fall through a subscription-only model while signed out", async () => {
    const response = await runtime.run(
      {
        model_id: "openai/gpt-5.4",
        messages: [
          {
            id: "signed-out-subscription-only",
            role: "user",
            content: "stay pinned to ChatGPT",
          },
        ],
      },
      new AbortController().signal
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "provider_down",
      provider_id: "chatgpt",
    });
    expect(runProviders).toEqual([]);
  });

  it("lets an explicit changed model re-enter automatic provider resolution", async () => {
    const session = await store.create({
      agent: AGENT_SESSION_AGENT,
      model: {
        provider_id: "openrouter",
        tier: "pro",
        model_id: "anthropic/claude-sonnet-5",
      },
    });
    chatGptReady = true;

    const response = await runtime.run(
      {
        session_id: session.id,
        model_id: "openai/gpt-5.6-terra",
        messages: [
          { id: "switch-model", role: "user", content: "use this model" },
        ],
      },
      new AbortController().signal
    );
    expect(response.status).toBe(200);
    await response.text();
    await vi.waitFor(() => expect(runProviders).toEqual(["chatgpt"]));
    expect((await store.get(session.id))?.model).toMatchObject({
      provider_id: "chatgpt",
      model_id: "openai/gpt-5.6-terra",
    });
  });

  it("lets an explicit ChatGPT provider pick switch an unchanged compatible model", async () => {
    const session = await store.create({
      agent: AGENT_SESSION_AGENT,
      model: {
        provider_id: "openrouter",
        tier: "pro",
        model_id: "openai/gpt-5.6-terra",
      },
    });
    chatGptReady = true;

    const response = await runtime.run(
      {
        session_id: session.id,
        provider_id: "chatgpt",
        model_id: "openai/gpt-5.6-terra",
        messages: [
          {
            id: "switch-provider",
            role: "user",
            content: "use my ChatGPT subscription",
          },
        ],
      },
      new AbortController().signal
    );
    expect(response.status).toBe(200);
    await response.text();
    await vi.waitFor(() => expect(runProviders).toEqual(["chatgpt"]));
    expect((await store.get(session.id))?.model).toMatchObject({
      provider_id: "chatgpt",
      model_id: "openai/gpt-5.6-terra",
    });
  });

  it("keeps a queued ChatGPT turn durable while its stored provider is signed out", async () => {
    const session = await store.create({
      agent: AGENT_SESSION_AGENT,
      model: {
        provider_id: "chatgpt",
        tier: "pro",
        model_id: "openai/gpt-5.6-terra",
      },
    });
    await store.appendQueuedMessage(session.id, {
      id: "queued-chatgpt",
      text: "wait for sign-in",
    });
    chatGptReady = false;

    await runtime.retryQueuedSessions();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(
      (await store.listQueuedMessages(session.id)).map((message) => message.id)
    ).toEqual(["queued-chatgpt"]);
    expect(runProviders).toEqual([]);
  });

  it("pins manual compaction to the session's provider boundary", async () => {
    const session = await store.create({
      agent: AGENT_SESSION_AGENT,
      model: {
        provider_id: "openrouter",
        tier: "pro",
        model_id: "openai/gpt-5.6-terra",
      },
    });
    const user = await store.appendMessage(session.id, { role: "user" });
    await store.upsertPart(user.id, {
      index: 0,
      type: "text",
      data: { type: "text", text: "compact this" },
    });
    chatGptReady = true;
    let selected: { provider: string; model_id: string } | undefined;
    inspectCompactor = ({ model_factory }) => {
      // Mirror the real compactor: auxiliary work deliberately selects the
      // provider's nano tier, without borrowing capacity from another
      // provider merely because it became ready.
      const model = model_factory("nano") as {
        provider: string;
        modelId: string;
      };
      selected = { provider: model.provider, model_id: model.modelId };
    };

    const response = await runtime.compact(session.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ compacted: true });
    expect(selected?.provider).toBe("openrouter.chat");
    expect(selected?.model_id).toBeTruthy();

    // Passing the persisted model into resolution is also load-bearing: an
    // incompatible ChatGPT row fails closed rather than silently compacting
    // with ChatGPT's default model or the available BYOK provider.
    const incompatible = await store.create({
      agent: AGENT_SESSION_AGENT,
      model: {
        provider_id: "chatgpt",
        tier: "pro",
        model_id: "anthropic/claude-sonnet-5",
      },
    });
    const blocked = await runtime.compact(incompatible.id);
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({
      code: "provider_down",
      provider_id: "chatgpt",
    });
  });
});
