// GRIDA-SEC-006 — the installed native listing retains its authenticated wire shape.
import { beforeEach, describe, expect, it, vi } from "vitest";
const fixtures = vi.hoisted(() => ({
  list: vi.fn<
    () => Promise<
      import("@/lib/ai/openai-compat/hosted-models").HostedModelEntry[]
    >
  >(async () => [
    {
      id: "fixture/new-image",
      object: "model",
      created: 0,
      owned_by: "fixture",
      grida: {
        modality: "image",
        tier: null,
        label: "Current image",
        deprecated: false,
      },
    },
  ]),
}));
vi.mock("@/lib/ai/openai-compat/limits", () => ({
  allowAiRequest: async () => ({ success: true }),
}));
vi.mock("@/lib/ai/openai-compat/hosted-models", () => ({
  hostedModelList: fixtures.list,
}));
import { GET } from "./route";
import { signGgToken } from "@/lib/auth/gg-token";
beforeEach(() => {
  process.env.GG_TOKEN_SECRET =
    "models-secret-0123456789abcdef0123456789abcdef";
});
function request(token?: string) {
  return new Request("http://grida.test/api/v1/ai/models", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}
describe("GET /api/v1/ai/models", () => {
  it("rejects missing/invalid scoped credentials before discovery", async () => {
    fixtures.list.mockClear();
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("junk"))).status).toBe(401);
    expect(fixtures.list).not.toHaveBeenCalled();
  });
  it("returns current offerings without changing the installed model-list envelope", async () => {
    const { token } = await signGgToken("fixture-user", 1);
    const response = await GET(request(token));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      object: "list",
      data: await fixtures.list(),
    });
  });
});
