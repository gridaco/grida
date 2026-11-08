// GRIDA-SEC-006 — public GG availability is independent of bundled provider bindings.
import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  models: [] as Record<string, unknown>[],
  ready: vi.fn<() => Promise<void>>(),
}));
vi.mock("@grida/ai/discovery", async (original) => {
  const actual = await original<typeof import("@grida/ai/discovery")>();
  return {
    ...actual,
    GGDiscoveryStore: class {
      ready = fixture.ready;
      model(id: string) {
        return fixture.models.find((model) => model.id === id);
      }
      list() {
        return fixture.models;
      }
      dispose() {}
    },
  };
});
vi.mock("@/lib/gg/config", () => ({
  ggConfig: { publicModels: () => ({ origin: "https://gateway.grida.ai" }) },
}));
vi.mock("../models", () => {
  throw new Error("provider seam must not initialize");
});
vi.mock("ai", () => {
  throw new Error("provider SDK must not initialize");
});
vi.mock("@ai-sdk/openai-compatible", () => {
  throw new Error("provider SDK must not initialize");
});
import { hostedModelList, isHostedTextModel } from "./hosted-models";
function model(id: string, kind: string, interfaces: string[]) {
  return { id, kind, interfaces, label: id, created: 0, owned_by: "fixture" };
}
beforeEach(() => {
  fixture.models = [
    model("fixture/fresh-text", "text", ["chat.completions"]),
    model("fixture/responses-only", "text", ["responses"]),
    model("fixture/fresh-image", "image", ["images.generations"]),
    model("fixture/fresh-video", "video", ["videos"]),
    model("fixture/music", "music", ["endpoints"]),
  ];
});
describe("current hosted catalogue", () => {
  it("offers new IDs using implemented interfaces without requiring a Vercel binding", async () => {
    expect(await isHostedTextModel("fixture/fresh-text")).toBe(true);
    expect(await isHostedTextModel("fixture/responses-only")).toBe(false);
    const listed = await hostedModelList();
    expect(listed.map((entry) => entry.id)).toEqual(["fixture/fresh-text"]);
    expect(listed.map((entry) => entry.grida.modality)).toEqual(["text"]);
    expect(JSON.stringify(listed)).not.toMatch(/price|mills|provider_key/i);
  });
  it("retains the rigging feature for both installed Tripo contracts", async () => {
    fixture.models = [
      model("tripo/rig-v1.0", "three-d", ["endpoints"]),
      model("tripo/rig-v2.5", "three-d", ["endpoints"]),
    ];
    expect(
      (await hostedModelList()).map(({ id, grida }) => [id, grida.feature])
    ).toEqual([
      ["tripo/rig-v1.0", "rigging"],
      ["tripo/rig-v2.5", "rigging"],
    ]);
  });
  it("withdraws removed IDs rather than silently falling back to compiled facts", async () => {
    fixture.models = [];
    expect(await isHostedTextModel("fixture/fresh-text")).toBe(false);
    expect(await hostedModelList()).toEqual([]);
  });
  it("never treats prototype members or bare aliases as model IDs", async () => {
    for (const id of [
      "constructor",
      "toString",
      "fresh-text",
      "fixture/fresh-text-new",
    ])
      expect(await isHostedTextModel(id)).toBe(false);
  });
});
