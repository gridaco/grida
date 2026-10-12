// No hosted runtime or provider credentials. Fixture only the HTTP boundary.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { generateText, generateImage, Output, jsonSchema } from "ai";
import {
  gatewayFetch,
  gatewayLanguageModel,
  gatewayImageModel,
  gatewayCostMills,
  GatewayProductError,
} from "../gateway-product";
const context = { organizationId: 7, feature: "canvas/generate" };
const opts = { grida: context };
const imageDefaults = {
  seed: undefined,
  files: undefined,
  mask: undefined,
  size: undefined,
  aspectRatio: undefined,
};
let submitted: RequestInit[] = [];
let text = "hello";
let status = 200;
let statusUnavailable = false;
const requestId = "req_fixture";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
beforeEach(() => {
  submitted = [];
  text = "hello";
  status = 200;
  statusUnavailable = false;
  vi.stubEnv("GRIDA_AI_GATEWAY_ORIGIN", "http://127.0.0.1:8080");
  vi.stubEnv("GRIDA_AI_GATEWAY_ALLOW_LOCAL", "1");
  vi.stubEnv("GRIDA_AI_GATEWAY_KEY_ID", "product-test");
  vi.stubEnv("GRIDA_AI_GATEWAY_TOKEN", "a".repeat(43));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      assert.match(url, /^http:\/\/127\.0\.0\.1:8080\/internal\/grida\/v1\//);
      const h = new Headers(init.headers);
      assert.equal(h.get("X-Grida-Organization-ID"), "7");
      assert.equal(h.get("X-Grida-Feature"), context.feature);
      assert.equal(h.get("Cookie"), null);
      assert.equal(init.credentials, "omit");
      if (url.includes("/jobs/"))
        return statusUnavailable
          ? Response.json(
              { error: { code: "account_unavailable" } },
              { status: 503 }
            )
          : Response.json({
              id: requestId,
              request_id: requestId,
              status: "succeeded",
              result_status: "unavailable",
              billing: {
                status: "settled",
                authorized_mills: "1",
                charged_mills: "0.25",
              },
            });
      submitted.push(init);
      if (status !== 200)
        return Response.json(
          { error: { code: "invalid_request" } },
          { status, headers: { "X-Request-ID": requestId } }
        );
      if (url.includes("/images/")) {
        const n =
          init.body instanceof FormData
            ? Number(init.body.get("n"))
            : JSON.parse(init.body as string).n;
        return Response.json(
          {
            data: Array.from({ length: n }, () => ({
              b64_json: png,
              media_type: "image/png",
            })),
          },
          { headers: { "X-Request-ID": requestId } }
        );
      }
      return Response.json(
        {
          id: "completion_fixture",
          created: 1,
          model: "openai/gpt-5.6-luna",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: text },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
        },
        { headers: { "X-Request-ID": requestId } }
      );
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("trusted GG product adapter", () => {
  it("uses one submission and authoritative financial metadata", async () => {
    const r = await generateText({
      model: gatewayLanguageModel("openai/gpt-5.6-luna"),
      prompt: "hello",
      maxOutputTokens: 32,
      providerOptions: opts,
    });
    expect(r.text).toBe("hello");
    expect(gatewayCostMills(r.providerMetadata)).toBe(0.25);
    expect(submitted).toHaveLength(1);
    expect(
      new Headers(submitted[0].headers).get("Idempotency-Key")
    ).toBeTruthy();
  });
  it("preserves JSON-schema output and function-tool definitions", async () => {
    text = '{"name":"cube"}';
    const r = await generateText({
      model: gatewayLanguageModel("openai/gpt-5.6-luna"),
      prompt: "hello",
      providerOptions: opts,
      output: Output.object({
        schema: jsonSchema<{ name: string }>({
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
          additionalProperties: false,
        }),
      }),
      tools: {
        inspect: {
          inputSchema: jsonSchema({
            type: "object",
            properties: {},
            additionalProperties: false,
          }),
        },
      },
    });
    expect(r.output).toEqual({ name: "cube" });
    const body = JSON.parse(submitted[0].body as string);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.tools[0].function.name).toBe("inspect");
  });
  it("never retries rejected or uncertain paid submissions", async () => {
    status = 503;
    await expect(
      generateText({
        model: gatewayLanguageModel("openai/gpt-5.6-luna"),
        prompt: "x",
        providerOptions: opts,
      })
    ).rejects.toBeInstanceOf(GatewayProductError);
    expect(submitted).toHaveLength(1);
    vi.mocked(fetch).mockRejectedValue(new Error("network"));
    await expect(
      generateText({
        model: gatewayLanguageModel("openai/gpt-5.6-luna"),
        prompt: "x",
        providerOptions: opts,
      })
    ).rejects.toMatchObject({
      code: "submission_uncertain",
      isRetryable: false,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("keeps delivered content when a subsequent charge read is unavailable", async () => {
    statusUnavailable = true;
    const r = await generateText({
      model: gatewayLanguageModel("openai/gpt-5.6-luna"),
      prompt: "x",
      providerOptions: opts,
    });
    expect(r.text).toBe("hello");
    expect(gatewayCostMills(r.providerMetadata)).toBeUndefined();
    expect(r.providerMetadata?.gg).toMatchObject({
      requestId,
      billingStatus: "pending",
      chargedMills: null,
    });
    expect(submitted).toHaveLength(1);
  });
  it.each([0, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid organization %s before network",
    async (id) => {
      await expect(
        gatewayFetch({ ...context, organizationId: id }, "/v1/videos")
      ).rejects.toMatchObject({ code: "missing_organization_id" });
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it.each([
    "http://evil.example",
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com/?secret=x",
  ])("rejects unsafe configured origin %s", async (origin) => {
    vi.stubEnv("GRIDA_AI_GATEWAY_ORIGIN", origin);
    await expect(gatewayFetch(context, "/v1/videos")).rejects.toThrow(
      "billing_unavailable"
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ["openai/gpt-image-2", "1024x1024", "1:1", { size: "1024x1024" }],
    [
      "google/gemini-3-pro-image",
      "1024x1024",
      "1:1",
      { size: "1K", aspect_ratio: "1:1" },
    ],
    [
      "google/gemini-3.1-flash-image-preview",
      "2048x2048",
      "1:1",
      { size: "2K", aspect_ratio: "1:1" },
    ],
    [
      "xai/grok-imagine-image-2.0",
      "2048x2048",
      "1:1",
      { size: "2k", aspect_ratio: "1:1" },
    ],
    ["recraft/recraft-v4.1", "1024x1024", "1:1", { size: "square_hd" }],
    ["bfl/flux-2-pro", undefined, "1:1", { size: "1024x1024" }],
  ] as const)(
    "maps native geometry for %s",
    async (model, size, aspect, expected) => {
      await gatewayImageModel(model).doGenerate({
        ...imageDefaults,
        prompt: "x",
        n: 1,
        size,
        aspectRatio: aspect,
        providerOptions: opts,
      });
      expect(JSON.parse(submitted[0].body as string)).toMatchObject(expected);
      expect(JSON.parse(submitted[0].body as string).aspect_ratio).toBe(
        "aspect_ratio" in expected ? expected.aspect_ratio : undefined
      );
    }
  );
  it("sends an image batch once and keeps edit bytes transient", async () => {
    const r = await generateImage({
      model: gatewayImageModel("openai/gpt-image-2"),
      prompt: {
        text: "edit",
        images: [Uint8Array.from(Buffer.from(png, "base64"))],
      },
      n: 2,
      providerOptions: opts,
    });
    expect(r.images).toHaveLength(2);
    expect(submitted).toHaveLength(1);
    expect(submitted[0].body).toBeInstanceOf(FormData);
    expect((submitted[0].body as FormData).getAll("image")).toHaveLength(1);
  });
  it("rejects unsupported size or format before dispatch", async () => {
    await expect(
      gatewayImageModel("recraft/recraft-v4.1").doGenerate({
        ...imageDefaults,
        prompt: "x",
        n: 1,
        size: "333x444",
        providerOptions: opts,
      })
    ).rejects.toMatchObject({ code: "unsupported_image_size" });
    await expect(
      gatewayImageModel("openai/gpt-image-2").doGenerate({
        ...imageDefaults,
        prompt: "x",
        n: 1,
        providerOptions: { ...opts, openai: { output_format: "jpeg" } },
      })
    ).rejects.toMatchObject({ code: "unsupported_image_format" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
