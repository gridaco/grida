// GRIDA-SEC-006 / GRIDA-SEC-012 — one fixed bridge, caller-owned inputs, trusted org authority.
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  execute: vi.fn<typeof import("../ai/gateway-product").gatewayFetch>(),
  ready:
    vi.fn<() => Promise<{ operations: Record<string, unknown>[] } | null>>(),
  limit: vi.fn<typeof import("../ai/openai-compat/limits").allowAiRequest>(),
}));
vi.mock("../ai/gateway-product", () => ({ gatewayFetch: h.execute }));
vi.mock("../ai/openai-compat/hosted-models", () => ({
  hostedDiscovery: () => ({ ready: h.ready }),
}));
vi.mock("../ai/openai-compat/limits", () => ({ allowAiRequest: h.limit }));
import { ggOperationsApi } from "./gg-operations";
import { signGgToken } from "../auth/gg-token";
const post = ggOperationsApi.bind("gg.operations");
const jobs = ggOperationsApi.bind("gg.jobs");
let token: string;
const image = {
  id: "image.fixture.new.text",
  model_id: "fixture/new",
  kind: "image",
  variant: "text",
  path: "/v1/images/generations",
};
function submit(
  value: unknown = {
    operation_id: image.id,
    input: { prompt: "A blue square" },
  },
  init: RequestInit = {}
) {
  return new Request("https://grida.co/api/v1/ai/operations", {
    method: "POST",
    body: JSON.stringify(value),
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      cookie: "organization=999",
      "x-grida-organization-id": "999",
      ...init.headers,
    },
  });
}
beforeEach(async () => {
  process.env.GG_TOKEN_SECRET =
    "fixture-gg-secret-0123456789abcdef0123456789abcdef";
  token = (await signGgToken("fixture-user", 1)).token;
  h.execute.mockReset();
  h.ready.mockReset();
  h.limit.mockReset();
  h.ready.mockResolvedValue({ operations: [image] });
  h.limit.mockResolvedValue({ success: true });
  h.execute.mockImplementation(async () =>
    Response.json({
      created: 0,
      data: [{ b64_json: "ZGF0YQ==", media_type: "image/png" }],
    })
  );
});
describe("generic scoped operation bridge", () => {
  it("retrieves accepted jobs without consuming the model-listing budget", async () => {
    h.limit.mockImplementation(async (name) => ({
      success: name !== "models",
    }));
    h.execute.mockResolvedValue(
      Response.json({ id: "req_existing", status: "queued" })
    );
    const response = await jobs.GET(
      new Request("https://grida.co/api/v1/ai/jobs?request_id=req_existing", {
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(response.status).toBe(200);
    expect(h.limit).toHaveBeenCalledExactlyOnceWith("jobs", "fixture-user");
    expect((await post.POST(submit())).status).toBe(429);
    expect(h.execute).toHaveBeenCalledTimes(1);
  });
  it("uses the verified organization and discovery-selected path, never caller headers", async () => {
    const response = await post.POST(submit());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const [context, path, init, identity] = h.execute.mock.calls[0];
    expect(context.organizationId).toBe(1);
    expect(path).toBe("/v1/images/generations");
    expect(JSON.parse(String(init?.body))).toEqual({
      prompt: "A blue square",
      model: "fixture/new",
    });
    expect(identity).toMatch(/^[a-f0-9-]{36}$/);
  });
  it("rejects missing/foreign credentials before discovery or paid dispatch", async () => {
    const response = await post.POST(
      submit(undefined, { headers: { authorization: "Bearer wrong" } })
    );
    expect(response.status).toBe(401);
    expect(h.ready).not.toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
  });
  it.each([
    { operation_id: "https://evil.invalid/path", input: {} },
    { operation_id: image.id, input: {}, organization_id: 99 },
    { operation_id: image.id, input: { model: "fixture/other" } },
    { operation_id: image.id, input: [] },
    { operation_id: "not-offered", input: {} },
  ])("rejects unsupported caller authority and routes %j", async (value) => {
    expect((await post.POST(submit(value))).status).toBe(400);
    expect(h.execute).not.toHaveBeenCalled();
  });
  it("retains async acceptance and safe request identity", async () => {
    h.ready.mockResolvedValue({
      operations: [
        {
          ...image,
          id: "video.fixture.new.text",
          kind: "video",
          path: "/v1/videos",
        },
      ],
    });
    h.execute.mockResolvedValue(
      Response.json(
        {
          id: "req_fixture",
          request_id: "req_fixture",
          result_status: "pending",
        },
        {
          status: 202,
          headers: {
            "x-request-id": "req_fixture",
            "set-cookie": "never-forward",
            location: "/internal/path",
          },
        }
      )
    );
    const response = await post.POST(
      submit({
        operation_id: "video.fixture.new.text",
        input: { prompt: "A moving square" },
      })
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("x-request-id")).toBe("req_fixture");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.has("location")).toBe(false);
    expect((await response.json()).id).toBe("req_fixture");
  });
  it("retrieves accepted work without current discovery or a replacement submission", async () => {
    h.ready.mockResolvedValue(null);
    h.execute.mockResolvedValue(
      Response.json({
        id: "req_retired",
        request_id: "req_retired",
        result_status: "available",
        result: {},
      })
    );
    const response = await jobs.GET(
      new Request("https://grida.co/api/v1/ai/jobs?request_id=req_retired", {
        headers: { authorization: `Bearer ${token}` },
      })
    );
    expect(response.status).toBe(200);
    expect(h.ready).not.toHaveBeenCalled();
    expect(h.execute).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 1 }),
      "/v1/jobs/req_retired",
      expect.objectContaining({ method: "GET" })
    );
  });
  it.each([
    "",
    "?request_id=req_one&request_id=req_two",
    "?request_id=../other",
    "?request_id=req_one&organization=2",
  ])("rejects invalid polling selectors %s", async (query) => {
    expect(
      (
        await jobs.GET(
          new Request(`https://grida.co/api/v1/ai/jobs${query}`, {
            headers: { authorization: `Bearer ${token}` },
          })
        )
      ).status
    ).toBe(400);
    expect(h.execute).not.toHaveBeenCalled();
  });
  it("reports unavailable discovery without dispatching or substituting a local model", async () => {
    h.ready.mockResolvedValue(null);
    expect((await post.POST(submit())).status).toBe(503);
    expect(h.execute).not.toHaveBeenCalled();
  });
  it("bounds bodies and rejects compressed input", async () => {
    expect(
      (
        await post.POST(
          submit({
            operation_id: image.id,
            input: { prompt: "x".repeat(3 * 1024 * 1024) },
          })
        )
      ).status
    ).toBe(400);
    expect(
      (
        await post.POST(
          submit(undefined, { headers: { "content-encoding": "gzip" } })
        )
      ).status
    ).toBe(400);
    expect(h.execute).not.toHaveBeenCalled();
  });
  it("offers only fixed methods and bodyless OPTIONS", async () => {
    expect(
      (
        await post.OPTIONS(
          new Request("https://grida.co/api/v1/ai/operations", {
            method: "OPTIONS",
          })
        )
      ).status
    ).toBe(204);
    expect(
      (await post.GET(new Request("https://grida.co/api/v1/ai/operations")))
        .status
    ).toBe(405);
    expect(h.ready).not.toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
  });
});
