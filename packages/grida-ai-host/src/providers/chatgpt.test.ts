// GRIDA-SEC-008 — exact native wire shape, refresh lineage, and error-body pins.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStore } from "@grida/daemon/server";
import {
  CHATGPT_PROVIDER_ID,
  CHATGPT_SUBSCRIPTION_MODEL_IDS,
  isChatGptSubscriptionModelId,
} from "../protocol/chatgpt";
import { ChatGptCredentialManager } from "./chatgpt-credentials";
import { ChatGptProvider, type ChatGptProviderConfig } from "./chatgpt";
import { ProviderHttp } from "./http";

const RESPONSES_URL =
  "https://chatgpt.example.test/backend-api/agent/responses";
const TOKEN_URL = "https://auth.example.test/oauth/token";
const CONFIG: ChatGptProviderConfig = {
  oauth: {
    authorize_url: "https://auth.example.test/oauth/authorize",
    token_url: TOKEN_URL,
    client_id: "grida-test-client",
    redirect_uris: ["http://localhost:1455/auth/callback"],
    scopes: ["openid", "offline_access"],
  },
  responses_url: RESPONSES_URL,
  originator: "grida-test",
  default_model_id: "openai/gpt-5.6-terra",
};

let baseDir: string;
let auth: AuthStore;

beforeEach(async () => {
  baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-chatgpt-model-"));
  auth = new AuthStore(baseDir);
  await auth.set(CHATGPT_PROVIDER_ID, {
    type: "oauth",
    access: "access-one",
    refresh: "refresh-one",
    expires: Math.floor(Date.now() / 1000) + 3600,
    account_id: "account-123",
  });
});

afterEach(async () => {
  await fs.rm(baseDir, { recursive: true, force: true });
});

describe("ChatGptProvider", () => {
  it("pins the five-model namespaced allowlist mirrored from the reference client", () => {
    expect(CHATGPT_SUBSCRIPTION_MODEL_IDS).toEqual([
      "openai/gpt-5.6-sol",
      "openai/gpt-5.6-terra",
      "openai/gpt-5.6-luna",
      "openai/gpt-5.5",
      "openai/gpt-5.4",
    ]);
    for (const id of CHATGPT_SUBSCRIPTION_MODEL_IDS) {
      expect(isChatGptSubscriptionModelId(id)).toBe(true);
    }
    expect(isChatGptSubscriptionModelId("anthropic/claude-sonnet-5")).toBe(
      false
    );
  });

  it("captures only a durable subscription connection and stateless selected wire model", async () => {
    const request = vi.fn<typeof fetch>(async () =>
      completedResponse("gpt-5.6-terra")
    );
    const { captureNative } = runtime(request);
    await expect(captureNative()).rejects.toMatchObject({
      code: "chatgpt_reauthentication_required",
    });
    await expect(captureNative("openai/other-model")).rejects.toMatchObject({
      code: "chatgpt_model_not_available",
    });
    expect(request).not.toHaveBeenCalled();

    await connection("first-lineage");
    const bound = await captureNative();
    expect(bound).toMatchObject({
      target: RESPONSES_URL,
      model: CONFIG.default_model_id,
    });
    expect(bound.scope).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(bound)).not.toMatch(
      /first-lineage|account-123|access-one|refresh-one/
    );
    for (const override of [
      { model: "gpt-5.6-sol" },
      { store: true },
      { max_output_tokens: 128 },
      { previous_response_id: "other-response" },
      { tools: [{ type: "web_search" }] },
    ]) {
      await expect(
        bound.request(nativeBody(override), new AbortController().signal)
      ).resolves.toBeNull();
    }
    expect(request).not.toHaveBeenCalled();

    await connection("first-lineage", "access-two");
    const restarted = await runtime(request).captureNative();
    expect(restarted.scope).toBe(bound.scope);
    await expect(
      bound.request(nativeBody(), new AbortController().signal)
    ).resolves.toMatchObject({ status: 200 });
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe(RESPONSES_URL);
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(Object.fromEntries(new Headers(init?.headers))).toMatchObject({
      authorization: "Bearer access-two",
      "chatgpt-account-id": "account-123",
      originator: CONFIG.originator,
      "openai-beta": "responses=experimental",
    });

    await connection("second-lineage", "access-three");
    const replacement = await captureNative();
    expect(replacement.scope).not.toBe(bound.scope);
    await expect(
      bound.request(nativeBody(), new AbortController().signal)
    ).resolves.toMatchObject({ status: 401 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("retries one unauthorized response within the selected lineage and retains safe rate evidence", async () => {
    await connection("first-lineage");
    const request = vi.fn<typeof fetch>();
    request
      .mockResolvedValueOnce(
        new Response("private first failure", { status: 401 })
      )
      .mockResolvedValueOnce(
        Response.json({
          access_token: "access-rotated",
          refresh_token: "refresh-rotated",
          expires_in: 3600,
        })
      )
      .mockResolvedValueOnce(
        new Response("private rate message", {
          status: 429,
          headers: {
            "retry-after": "17",
            "x-request-id": "rate-1",
            "set-cookie": "private",
          },
        })
      );
    const { captureNative } = runtime(request);
    const bound = await captureNative();
    const result = await bound.request(
      nativeBody(),
      new AbortController().signal
    );
    expect(result?.status).toBe(429);
    expect(await result?.text()).toBe("");
    expect(Object.fromEntries(result!.headers)).toEqual({
      "retry-after": "17",
      "x-request-id": "rate-1",
    });
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      RESPONSES_URL,
      TOKEN_URL,
      RESPONSES_URL,
    ]);
    const first = request.mock.calls[0][1];
    const retry = request.mock.calls[2][1];
    expect(new Headers(first?.headers).get("authorization")).toBe(
      "Bearer access-one"
    );
    expect(new Headers(retry?.headers).get("authorization")).toBe(
      "Bearer access-rotated"
    );
    expect(first?.body).toEqual(retry?.body);
    expect((await captureNative()).scope).toBe(bound.scope);
  });

  it("does not retry a native request with a reconnected account's credential", async () => {
    await connection("first-lineage");
    const request = vi.fn<typeof fetch>(async () => {
      await connection("new-sign-in", "access-new-account");
      return new Response("upstream rejection", { status: 401 });
    });
    const { captureNative } = runtime(request);
    const bound = await captureNative();
    const result = await bound.request(
      nativeBody(),
      new AbortController().signal
    );
    expect(result?.status).toBe(401);
    expect(await result?.text()).toBe("");
    expect(request).toHaveBeenCalledTimes(1);
    expect(await auth.get(CHATGPT_PROVIDER_ID)).toMatchObject({
      access: "access-new-account",
    });
  });

  it("refuses ambient OAuth content and stops new captures during sign-out", async () => {
    const request = vi.fn<typeof fetch>();
    const { credentials, captureNative } = runtime(request);
    await auth.remove(CHATGPT_PROVIDER_ID);
    vi.stubEnv(
      "GRIDA_AUTH_CONTENT",
      JSON.stringify({
        chatgpt: {
          type: "oauth",
          access: "ambient",
          refresh: "ambient",
          account_id: "ambient",
          expires: Math.floor(Date.now() / 1000) + 3600,
          metadata: { credential_id: "ambient-lineage" },
        },
      })
    );
    try {
      await expect(captureNative()).rejects.toMatchObject({
        code: "chatgpt_not_signed_in",
      });
      await connection("stored-lineage");
      const bound = await captureNative();
      const pending = Promise.withResolvers<void>();
      const remove = auth.remove.bind(auth);
      vi.spyOn(auth, "remove").mockImplementationOnce(async (id) => {
        await pending.promise;
        return await remove(id);
      });
      const signingOut = credentials.signOut();
      try {
        await expect(captureNative()).rejects.toMatchObject({
          code: "chatgpt_not_signed_in",
        });
        await expect(
          bound.request(nativeBody(), new AbortController().signal)
        ).resolves.toMatchObject({ status: 401 });
      } finally {
        pending.resolve();
        await signingOut;
      }
      await expect(captureNative()).rejects.toMatchObject({
        code: "chatgpt_not_signed_in",
      });
      expect(request).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

function runtime(request: typeof fetch) {
  const providerHttp = new ProviderHttp({ request, download: request });
  const credentials = new ChatGptCredentialManager(
    auth,
    providerHttp,
    CONFIG.oauth
  );
  const providerRuntime = { config: CONFIG, credentials };
  return {
    credentials,
    captureNative: (model: string = CONFIG.default_model_id) =>
      ChatGptProvider.captureNative(providerRuntime, model, providerHttp),
  };
}

async function connection(credentialId: string, access = "access-one") {
  await auth.set(CHATGPT_PROVIDER_ID, {
    type: "oauth",
    access,
    refresh: "refresh-one",
    account_id: "account-123",
    expires: Math.floor(Date.now() / 1000) + 3600,
    metadata: { credential_id: credentialId },
  });
}

function nativeBody(override: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      model: "gpt-5.6-terra",
      input: [],
      instructions: "",
      store: false,
      stream: true,
      include: ["reasoning.encrypted_content"],
      reasoning: { effort: "medium" },
      ...override,
    })
  );
}

function completedResponse(model: string): Response {
  return Response.json({
    id: "resp_1",
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model,
    output: [
      {
        id: "msg_1",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "done",
            annotations: [],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 1,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 1,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 2,
    },
  });
}
