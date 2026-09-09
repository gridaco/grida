import { beforeEach, describe, expect, it, vi } from "vitest";
import { models } from "@grida/ai-models";
import { generateAiImage } from "./image-generate";

const mocks = vi.hoisted(() => ({
  generate: vi.fn<(input: unknown) => Promise<unknown>>(),
  model:
    vi.fn<
      (
        id: string
      ) =>
        | { card: models.image.ImageModelCard; model: { modelId: string } }
        | undefined
    >(),
  auth: vi.fn<
    (
      feature: string,
      organizationId: number | undefined,
      run: (organizationId: number) => Promise<unknown>
    ) => Promise<unknown>
  >(),
  options:
    vi.fn<
      (input: {
        organizationId: number;
        feature: string;
        costMills: number;
      }) => { grida: Record<string, string | number> }
    >(),
  upload: vi.fn<
    (
      path: string,
      bytes: Uint8Array,
      options: { contentType: string }
    ) => Promise<{
      data: { id: string };
      error: null;
    }>
  >(),
  single: vi.fn<() => Promise<{ data: { id: string }; error: null }>>(),
}));

vi.mock("ai", () => ({ generateImage: mocks.generate }));
// These action tests verify option forwarding, not raster parsing. Deliberate
// sentinel bytes avoid adding a duplicate image fixture or invoking a provider.
vi.mock("image-size", () => ({
  default: () => ({ width: 1024, height: 1024 }),
}));
vi.mock("@/lib/ai/server", () => ({
  methods: { getSDKImageModel: mocks.model },
  withAiAuth: mocks.auth,
  gridaProviderOptions: mocks.options,
}));
vi.mock("@/lib/supabase/server", () => ({
  service_role: {
    library: {
      storage: {
        from: () => ({
          upload: mocks.upload,
          getPublicUrl: () => ({
            data: { publicUrl: "https://example.invalid/image.png" },
          }),
        }),
      },
      from: () => ({
        insert: () => ({ select: () => ({ single: mocks.single }) }),
      }),
    },
  },
}));

const variants = [
  "openai/gpt-image-2.5-flare",
  "openai/gpt-image-2.5-sunburst",
] as const;
const bytes = Uint8Array.of(1, 2, 3);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.model.mockImplementation((id) => {
    const card = models.image.models[id];
    return card ? { card, model: { modelId: id } } : undefined;
  });
  mocks.auth.mockImplementation(async (_feature, _organizationId, run) => ({
    success: true,
    data: await run(42),
  }));
  mocks.options.mockImplementation((input) => ({ grida: input }));
  mocks.generate.mockResolvedValue({
    image: { uint8Array: bytes, mediaType: "image/png" },
    responses: [
      {
        modelId: "provider-result",
        timestamp: new Date("2026-09-09T00:00:00Z"),
      },
    ],
  });
  mocks.upload.mockResolvedValue({ data: { id: "stored-image" }, error: null });
  mocks.single.mockResolvedValue({ data: { id: "stored-image" }, error: null });
});

describe.each(variants)("generateAiImage (%s)", (model) => {
  it.each(["xhigh", "max", "auto"])(
    "forwards %s explicitly to OpenAI while retaining the fallback cost meter",
    async (quality) => {
      const result = await generateAiImage({
        model,
        prompt: "A geometric icon",
        width: 1024,
        height: 1024,
        quality,
        organizationId: 42,
      });
      const billing = {
        organizationId: 42,
        feature: "ai/image/generate",
        costMills: Math.ceil(models.image.models[model]!.avg_cost_usd * 1000),
      };
      expect(mocks.options).toHaveBeenCalledWith(billing);
      expect(mocks.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          size: "1024x1024",
          providerOptions: { grida: billing, openai: { quality } },
        })
      );
      expect(mocks.upload.mock.calls[0]?.[1]).toBe(bytes);
      expect(result).toMatchObject({ success: true });
    }
  );

  it.each(["ultra", ""])(
    "rejects unsupported quality %j before authentication, generation, or storage",
    async (quality) => {
      expect(
        await generateAiImage({ model, prompt: "An icon", quality })
      ).toMatchObject({ success: false, code: "bad_request", status: 400 });
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(mocks.generate).not.toHaveBeenCalled();
      expect(mocks.upload).not.toHaveBeenCalled();
    }
  );
});

const legacyModels = ["openai/gpt-image-2", "bfl/flux-2-pro"] as const;

it.each(legacyModels)(
  "does not newly forward quality for %s without declared options",
  async (model) => {
    expect(models.image.models[model]!.quality).toBeUndefined();
    expect(
      await generateAiImage({ model, prompt: "An icon", quality: "high" })
    ).toMatchObject({ success: false, code: "bad_request", status: 400 });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  }
);

it.each([variants[0], ...legacyModels])(
  "preserves the existing omitted-quality request shape for %s",
  async (model) => {
    expect(await generateAiImage({ model, prompt: "An icon" })).toMatchObject({
      success: true,
    });
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { grida: expect.any(Object) },
      })
    );
  }
);
