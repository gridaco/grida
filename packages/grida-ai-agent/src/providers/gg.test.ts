// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
/**
 * GRIDA-SEC-006 — the grida hosted text factory.
 *
 * Pins: the token is read AT REQUEST TIME (a fresh push between calls is
 * honored), the base URL is `<origin>/api/v1/ai`, tiers map through the
 * canonical TIER_MODEL_IDS table (NOT the endpoint collapse), and
 * 401/402 map to the typed errors whose literal code LEADS the message
 * (the contextBridge detection contract).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TIER_MODEL_IDS } from "@grida/ai-models";
import {
  GridaGatewayAuthError,
  GridaGatewayCreditsError,
  gridaGatewayApiBase,
  makeGridaGatewayFactory,
} from "./gg";
import { GridaGatewaySessionStore } from "./gg-session";

const realFetch = globalThis.fetch;
const fetchMock =
  vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function liveStore(token = "tok-1"): GridaGatewaySessionStore {
  const store = new GridaGatewaySessionStore();
  store.set({ access_token: token, expires_at: Date.now() + 900_000 });
  return store;
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Minimal V3 generate roundtrip through the model's real request path. */
async function callModel(
  store: GridaGatewaySessionStore,
  modelId?: string
): Promise<void> {
  const factory = makeGridaGatewayFactory(store, "https://grida.test");
  const model = factory("pro", modelId) as unknown as {
    doGenerate: (o: unknown) => Promise<unknown>;
  };
  fetchMock.mockResolvedValue(
    okJson({
      id: "chatcmpl-1",
      object: "chat.completion",
      created: 0,
      model: modelId ?? TIER_MODEL_IDS.pro,
      choices: [
        {
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    })
  );
  await model.doGenerate({
    prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  });
}

describe("makeGridaGatewayFactory", () => {
  it("builds the /api/v1/ai base and sends the LIVE token per request", async () => {
    expect(gridaGatewayApiBase("https://grida.co")).toBe(
      "https://grida.co/api/v1/ai"
    );
    const store = liveStore("tok-first");
    await callModel(store);
    const [url1, init1] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(String(url1)).toBe("https://grida.test/api/v1/ai/chat/completions");
    expect(new Headers(init1.headers).get("authorization")).toBe(
      "Bearer tok-first"
    );

    // A fresh push between calls is honored — token read at request time.
    store.set({ access_token: "tok-second", expires_at: Date.now() + 900_000 });
    await callModel(store);
    const [, init2] = fetchMock.mock.calls[1]! as [string, RequestInit];
    expect(new Headers(init2.headers).get("authorization")).toBe(
      "Bearer tok-second"
    );
  });

  it("tiers map through TIER_MODEL_IDS; explicit ids pass through", async () => {
    const store = liveStore();
    await callModel(store);
    const body1 = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string
    ) as { model: string };
    expect(body1.model).toBe(TIER_MODEL_IDS.pro);

    await callModel(store, "openai/gpt-5.4-mini");
    const body2 = JSON.parse(
      (fetchMock.mock.calls[1]![1] as RequestInit).body as string
    ) as { model: string };
    expect(body2.model).toBe("openai/gpt-5.4-mini");
  });

  it("missing/expired session → GridaGatewayAuthError before any fetch", async () => {
    const store = new GridaGatewaySessionStore();
    await expect(callModel(store)).rejects.toBeInstanceOf(
      GridaGatewayAuthError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401/402 responses map to code-led typed errors", async () => {
    const store = liveStore();
    const factory = makeGridaGatewayFactory(store, "https://grida.test");
    const model = factory("pro") as unknown as {
      doGenerate: (o: unknown) => Promise<unknown>;
    };
    const prompt = {
      prompt: [{ role: "user", content: [{ type: "text", text: "x" }] }],
    };

    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(model.doGenerate(prompt)).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof GridaGatewayAuthError &&
        err.message.startsWith("gg_token_expired")
      );
    });

    fetchMock.mockResolvedValue(new Response("{}", { status: 402 }));
    await expect(model.doGenerate(prompt)).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof GridaGatewayCreditsError &&
        err.message.startsWith("insufficient_credits")
      );
    });
  });
});
