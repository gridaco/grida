import { ChatGptModels } from "./chatgpt-models";
// GRIDA-SEC-008 — exact native wire shape, refresh lineage, and error-body pins.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStore } from "@grida/daemon/server";
import {
  CHATGPT_PROVIDER_ID,
  CHATGPT_SUBSCRIPTION_DEFAULT_MODEL_ID,
  CHATGPT_SUBSCRIPTION_MODEL_IDS,
  CHATGPT_SUBSCRIPTION_RETIRED_MODEL_IDS,
  isChatGptSubscriptionModelId,
} from "../protocol/chatgpt";
import { ChatGptCredentialManager } from "./chatgpt-credentials";
import {
  ChatGptProvider,
  type ChatGptProviderConfig,
  type ChatGptProviderRuntime,
} from "./chatgpt";
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
  it("preserves multiple image inputs within an 8 MiB aggregate request and refuses excess before dispatch", async () => {
    await connection("same-image-lineage");
    const request = vi.fn<typeof fetch>(async () =>
      completedResponse("gpt-5.6-terra")
    );
    const bound = await runtime(request).captureNative();
    const inputs = [17, 31].map((value) => ({
      type: "input_image",
      image_url: `data:image/png;base64,${Buffer.alloc(384 * 1024, value).toString("base64")}`,
      detail: "auto",
    }));
    const body = nativeBody({
      input: [{ type: "message", role: "user", content: inputs }],
    });
    expect(body.length).toBeGreaterThan(1024 * 1024);
    await expect(
      bound.request(body, new AbortController().signal)
    ).resolves.toMatchObject({ status: 200 });
    // Compare bytes natively; a deep equality walk over megabytes is slow.
    expect(
      Buffer.from(request.mock.calls[0][1]!.body as ArrayBuffer).equals(
        Buffer.from(body)
      )
    ).toBe(true);
    const maximum = 8 * 1024 * 1024;
    const overhead = nativeBody({ instructions: "" }).length;
    const exact = nativeBody({ instructions: "x".repeat(maximum - overhead) });
    expect(exact.length).toBe(maximum);
    await expect(
      bound.request(exact, new AbortController().signal)
    ).resolves.toMatchObject({ status: 200 });
    const oversized = nativeBody({
      instructions: "x".repeat(maximum - overhead + 1),
    });
    await expect(
      bound.request(oversized, new AbortController().signal)
    ).resolves.toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("shares fresh account discovery and dispatches only the offered tier and exact hosted search", async () => {
    await connection("offer-account");
    const model = "openai/gpt-6.2-sol";
    const wire = "gpt-6.2-sol";
    const request = vi.fn<typeof fetch>(async (_target, init) => {
      if (init?.method === "GET") {
        return Response.json({
          models: [
            {
              slug: wire,
              visibility: "list",
              use_responses_lite: true,
              supports_search_tool: false,
              service_tiers: [
                { id: "priority" },
                { id: "ultrafast" },
                { id: "unknown-tier" },
              ],
              instructions: "private provider text",
            },
          ],
        });
      }
      return completedResponse(wire);
    });
    const rt = runtime(request, true);
    const [a, b] = await Promise.all([
      rt.captureNative(model),
      rt.captureNative(model),
    ]);
    const offer = {
      status: "available",
      speeds: ["fast", "ultrafast"],
      webSearch: true,
    };
    expect(await Promise.all([a.capabilities(), b.capabilities()])).toEqual([
      offer,
      offer,
    ]);
    const tool = { type: "web_search", external_web_access: true };
    const signal = new AbortController().signal;
    const send = (options: Record<string, unknown>) =>
      a.request(nativeBody({ model: wire, ...options }), signal);
    for (const options of [
      { service_tier: "fast" },
      { service_tier: "default" },
      { tools: [tool, tool] },
      { tools: [{ ...tool, filters: {} }] },
      {
        tools: [
          { ...tool, external_web_access: false, indexed_web_access: true },
        ],
      },
    ]) {
      await expect(send(options)).resolves.toBeNull();
    }
    expect(request).toHaveBeenCalledTimes(1);
    await expect(
      send({
        service_tier: "priority",
        tools: [{ type: "function", name: "draw" }, tool],
      })
    ).resolves.toMatchObject({ status: 200 });
    expect(request).toHaveBeenCalledTimes(2);
    expect(
      request.mock.calls.map(([target, init]) => [
        target,
        init?.method,
        new Headers(init?.headers).get("authorization"),
      ])
    ).toEqual([
      [
        new URL("models?client_version=0.170.0", RESPONSES_URL).href,
        "GET",
        "Bearer access-one",
      ],
      [RESPONSES_URL, "POST", "Bearer access-one"],
    ]);
    await connection("new-lineage", "access-two");
    await expect(a.capabilities()).resolves.toEqual({
      status: "reauthenticationRequired",
      speeds: [],
      webSearch: false,
    });
    await expect(send({ service_tier: "ultrafast" })).resolves.toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("checks current search permission independently of offered response speeds", async () => {
    await connection("preferences");
    const wire = "gpt-6.2-sol";
    let webSearchAllowed = true;
    const request = vi.fn<typeof fetch>(async (_, init) =>
      init?.method === "GET"
        ? Response.json({
            models: [
              {
                slug: wire,
                visibility: "list",
                service_tiers: [{ id: "priority" }],
              },
            ],
          })
        : completedResponse(wire)
    );
    const readPreferences = vi.fn<() => Promise<{ webSearchAllowed: boolean }>>(
      async () => ({ webSearchAllowed })
    );
    const bound = await runtime(request, true, readPreferences).captureNative(
      "openai/gpt-6.2-sol"
    );
    const send = (tool: Record<string, unknown>) =>
      bound.request(
        nativeBody({ model: wire, tools: [{ type: "web_search", ...tool }] }),
        new AbortController().signal
      );
    await expect(bound.capabilities()).resolves.toEqual({
      status: "available",
      webSearch: true,
      speeds: ["fast"],
    });
    const declarations = [
      { external_web_access: true },
      { external_web_access: false },
      { external_web_access: true, indexed_web_access: true },
    ];
    for (const declaration of declarations) {
      await expect(send(declaration)).resolves.toMatchObject({ status: 200 });
      // Validate and forward the originally captured request before checking
      // that a later opt-out blocks the same declaration.
      const sent = request.mock.calls.at(-1)?.[1]?.body as ArrayBuffer;
      expect(JSON.parse(new TextDecoder().decode(sent)).tools).toEqual([
        { type: "web_search", ...declaration },
      ]);
      readPreferences
        .mockResolvedValueOnce({ webSearchAllowed: true })
        .mockResolvedValueOnce({ webSearchAllowed: false });
      await expect(send(declaration)).rejects.toThrow(
        "chat_turn_preference_changed"
      );
    }
    webSearchAllowed = false;
    const searchDisabled = {
      status: "available",
      webSearch: false,
      speeds: ["fast"],
    };
    await expect(bound.capabilities()).resolves.toEqual(searchDisabled);
    readPreferences.mockRejectedValueOnce(new Error("settings unavailable"));
    await expect(bound.capabilities()).resolves.toEqual(searchDisabled);
    for (const declaration of declarations) {
      await expect(send(declaration)).resolves.toBeNull();
    }
    const signal = new AbortController().signal;
    const searchChecks = readPreferences.mock.calls.length;
    await expect(
      bound.request(
        nativeBody({ model: wire, service_tier: "ultrafast" }),
        signal
      )
    ).resolves.toBeNull();
    const speedBody = nativeBody({ model: wire, service_tier: "priority" });
    await expect(bound.request(speedBody, signal)).resolves.toMatchObject({
      status: 200,
    });
    expect(readPreferences).toHaveBeenCalledTimes(searchChecks);
    const sent = request.mock.calls.at(-1)?.[1]?.body as ArrayBuffer;
    expect(Buffer.from(sent).equals(speedBody)).toBe(true);
    expect(
      request.mock.calls.filter(([, init]) => init?.method === "POST")
    ).toHaveLength(declarations.length + 1);
  });

  it("refuses a captured credential replaced during the dispatch preference check", async () => {
    await connection("original");
    const wire = "gpt-6.2-sol";
    const request = vi.fn<typeof fetch>(async (_, init) =>
      init?.method === "GET"
        ? Response.json({ models: [{ slug: wire, visibility: "list" }] })
        : completedResponse(wire)
    );
    const preferences = { webSearchAllowed: true } as const;
    const readPreferences = vi.fn<() => Promise<typeof preferences>>();
    readPreferences
      .mockResolvedValueOnce(preferences)
      .mockImplementationOnce(async () => {
        await connection("replacement", "access-two");
        return preferences;
      });
    const bound = await runtime(request, true, readPreferences).captureNative(
      "openai/gpt-6.2-sol"
    );
    const body = nativeBody({
      model: wire,
      tools: [{ type: "web_search", external_web_access: true }],
    });
    await expect(
      bound.request(body, new AbortController().signal)
    ).resolves.toMatchObject({ status: 401 });
    expect(request.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false
    );
  });

  it("honors a search opt-out made while refreshing a rejected request", async () => {
    await connection("refresh-preference");
    const wire = "gpt-6.2-sol";
    let enabled = true;
    const request = vi.fn<typeof fetch>(async (url, init) => {
      if (init?.method === "GET")
        return Response.json({ models: [{ slug: wire, visibility: "list" }] });
      if (url === TOKEN_URL) {
        enabled = false;
        return Response.json({
          access_token: "access-rotated",
          refresh_token: "refresh-rotated",
          expires_in: 3600,
        });
      }
      return new Response(null, { status: 401 });
    });
    const bound = await runtime(request, true, async () => ({
      webSearchAllowed: enabled,
    })).captureNative("openai/gpt-6.2-sol");
    const body = nativeBody({
      model: wire,
      tools: [{ type: "web_search", external_web_access: true }],
    });
    await expect(
      bound.request(body, new AbortController().signal)
    ).rejects.toThrow("chat_turn_preference_changed");
    expect(
      request.mock.calls.filter(([url]) => url === RESPONSES_URL)
    ).toHaveLength(1);
    expect(
      request.mock.calls.filter(([url]) => url === TOKEN_URL)
    ).toHaveLength(1);
  });

  it("expires positive offers; a failed refresh refuses optional work and preserves Standard", async () => {
    await connection("expiring-account");
    const now = vi.spyOn(Date, "now");
    const base = Date.now();
    const request = vi.fn<typeof fetch>();
    request
      .mockResolvedValueOnce(
        Response.json({
          models: [
            {
              slug: "gpt-5.6-terra",
              visibility: "list",
              service_tiers: [{ id: "priority" }],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        new Response("private backend error", { status: 503 })
      )
      .mockResolvedValueOnce(completedResponse("gpt-5.6-terra"));
    try {
      const a = await runtime(request, true).captureNative();
      expect(await a.capabilities()).toEqual({
        status: "available",
        speeds: ["fast"],
        webSearch: false,
      });
      now.mockReturnValue(base + 6 * 60 * 1000);
      const signal = new AbortController().signal;
      await expect(
        a.request(nativeBody({ service_tier: "priority" }), signal)
      ).resolves.toBeNull();
      expect(await a.capabilities()).toEqual({
        status: "unavailable",
        speeds: [],
        webSearch: false,
      });
      await expect(a.request(nativeBody(), signal)).resolves.toMatchObject({
        status: 200,
      });
      expect(request.mock.calls.map((v) => v[1]?.method)).toEqual([
        "GET",
        "GET",
        "POST",
      ]);
    } finally {
      now.mockRestore();
    }
  });

  it("rejects ambiguous member names before custody while preserving unique-member wire bytes", async () => {
    await connection("unique-member-lineage");
    const wire = "gpt-5.6-terra";
    const request = vi.fn<typeof fetch>(async () => completedResponse(wire));
    const bound = await runtime(request, true).captureNative();
    const signal = new AbortController().signal;
    const original = nativeBody({
      instructions: 'text containing ": and \\ and {}[]',
      input: [{ "": [null, { k: "x:y" }] }],
    });
    const distinct = Buffer.from(
      JSON.stringify(JSON.parse(original.toString()), null, 2)
    );
    expect(await bound.request(distinct, signal)).toMatchObject({
      status: 200,
    });
    expect(Buffer.from(request.mock.calls[0]![1]!.body as ArrayBuffer)).toEqual(
      distinct
    );
    const ordinary = nativeBody().toString().slice(0, -1);
    for (const extra of [
      ',"service_tier":"priority","service_tier":"ultrafast"}',
      ',"tools":[{"type":"web_search","type":"function"}]}',
      ',"tools":[{"type":"web_search","external_web_access":true}],"tools":[]}',
      ',"tools":[{"type":"function","t\\u0079pe":"function"}]}',
    ])
      expect(
        await bound.request(Buffer.from(ordinary + extra), signal)
      ).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("distinguishes missing catalog evidence, a hidden model, and an empty but valid offer", async () => {
    await connection("invalid-catalog-lineage");
    for (const [models, status] of [
      [[null], "unavailable"],
      [[{ slug: "gpt-5.6-terra", service_tiers: [] }], "unavailable"],
      [
        [{ slug: "gpt-5.6-terra", visibility: "list", service_tiers: [{}] }],
        "unavailable",
      ],
      [
        [{ slug: "gpt-5.6-terra", visibility: "hide", service_tiers: [] }],
        "unsupported",
      ],
      [[], "unsupported"],
      [
        [{ slug: "gpt-5.6-terra", visibility: "list", service_tiers: [] }],
        "available",
      ],
    ] as const) {
      const request = vi.fn<typeof fetch>(async () =>
        Response.json({ models })
      );
      const bound = await runtime(request, true).captureNative();
      expect(await bound.capabilities()).toEqual({
        status,
        speeds: [],
        webSearch: false,
      });
    }
  });

  it("keeps verified hosted search available when the account model omits its empty tier list", async () => {
    await connection("search-without-speed");
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ models: [{ slug: "gpt-6.2-sol", visibility: "list" }] })
    );
    const bound = await runtime(request, true).captureNative(
      "openai/gpt-6.2-sol"
    );
    expect(await bound.capabilities()).toEqual({
      status: "available",
      speeds: [],
      webSearch: true,
    });
  });

  it("offers current subscription models and keeps retired IDs outside execution", () => {
    expect(CHATGPT_SUBSCRIPTION_MODEL_IDS).toEqual([
      "openai/gpt-6.2-sol",
      "openai/gpt-6.2-astra",
      "openai/gpt-6.1-sol",
      "openai/gpt-6-astra",
      "openai/gpt-6.1-terra",
      "openai/gpt-6-luna",
      "openai/gpt-6-sol",
      "openai/gpt-5.6-sol",
      "openai/gpt-5.6-terra",
      "openai/gpt-5.6-luna",
    ]);
    expect(CHATGPT_SUBSCRIPTION_DEFAULT_MODEL_ID).toBe("openai/gpt-6.2-sol");
    expect(CHATGPT_SUBSCRIPTION_MODEL_IDS).toContain(
      CHATGPT_SUBSCRIPTION_DEFAULT_MODEL_ID
    );
    expect(CHATGPT_SUBSCRIPTION_RETIRED_MODEL_IDS).toEqual([
      "openai/gpt-5.5",
      "openai/gpt-5.4",
    ]);
    for (const id of CHATGPT_SUBSCRIPTION_MODEL_IDS) {
      expect(isChatGptSubscriptionModelId(id)).toBe(true);
    }
    expect(isChatGptSubscriptionModelId("anthropic/claude-sonnet-5")).toBe(
      false
    );
    for (const id of CHATGPT_SUBSCRIPTION_RETIRED_MODEL_IDS)
      expect(isChatGptSubscriptionModelId(id)).toBe(false);
  });

  it.each([
    ["openai/gpt-6.2-sol", "gpt-6.2-sol"],
    ["openai/gpt-6.2-astra", "gpt-6.2-astra"],
    ["openai/gpt-6.1-sol", "gpt-6.1-sol"],
    ["openai/gpt-6-astra", "gpt-6-astra"],
    ["openai/gpt-6.1-terra", "gpt-6.1-terra"],
    ["openai/gpt-6-luna", "gpt-6-luna"],
    ["openai/gpt-6-sol", "gpt-6-sol"],
    ["openai/gpt-5.6-sol", "gpt-5.6-sol"],
    ["openai/gpt-5.6-terra", "gpt-5.6-terra"],
    ["openai/gpt-5.6-luna", "gpt-5.6-luna"],
  ])("binds %s to only its exact %s wire request", async (model, wireModel) => {
    await connection("same-subscription-lineage");
    const request = vi.fn<typeof fetch>(async () =>
      completedResponse(wireModel)
    );
    const bound = await runtime(request).captureNative(model);
    expect(bound.model).toBe(model);
    const signal = new AbortController().signal;
    await expect(
      bound.request(nativeBody({ model: "gpt-other" }), signal)
    ).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
    await expect(
      bound.request(nativeBody({ model: wireModel }), signal)
    ).resolves.toMatchObject({ status: 200 });
    expect(request).toHaveBeenCalledTimes(1);
    const [target, init] = request.mock.calls[0];
    expect(target).toBe(RESPONSES_URL);
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer access-one"
    );
    expect(
      JSON.parse(Buffer.from(init!.body as Uint8Array).toString())
    ).toMatchObject({
      model: wireModel,
      store: false,
      stream: true,
    });
  });

  it.each(CHATGPT_SUBSCRIPTION_RETIRED_MODEL_IDS)(
    "refuses retired %s before credential capture or network dispatch",
    async (model) => {
      const request = vi.fn<typeof fetch>();
      const { captureNative, credentials } = runtime(request);
      const capture = vi.spyOn(credentials, "captureConnection");
      await expect(captureNative(model)).rejects.toMatchObject({
        code: "chatgpt_model_not_available",
      });
      expect(capture).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    }
  );

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

function runtime(
  request: typeof fetch,
  withCatalog = false,
  turnPreferences?: ChatGptProviderRuntime["turnPreferences"]
) {
  const providerHttp = new ProviderHttp({ request, download: request });
  const credentials = new ChatGptCredentialManager(
    auth,
    providerHttp,
    CONFIG.oauth
  );
  const providerRuntime = {
    config: withCatalog
      ? { ...CONFIG, catalog_client_version: "0.170.0" }
      : CONFIG,
    credentials,
    catalog: new ChatGptModels(),
    turnPreferences,
  };
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
