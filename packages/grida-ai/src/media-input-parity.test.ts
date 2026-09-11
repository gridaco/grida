// GRIDA-SEC-004 / GRIDA-SEC-006 — JSON and native pre-submission validation have one owner.
// GRIDA-GG: token — synthetic authority only; discovery itself receives none.
import { describe, expect, it, vi } from "vitest";
import {
  MediaOperations,
  ImageClient,
  VideoClient,
  MusicClient,
  SoundEffectClient,
  TextToSpeechClient,
  ThreeDClient,
  ProviderHttp,
} from "./index";

const operations = new MediaOperations();
const image = operations
  .list({ kind: "image", provider: "openrouter" })
  .find((item) => item.variant === "references")!;
const cases: {
  selector: MediaOperations.Selector;
  valid: unknown;
  invalid: unknown[];
}[] = [
  {
    selector: {
      kind: "image",
      model_id: image.model_id,
      provider: "openrouter",
    },
    valid: {
      prompt: " preserve whitespace ",
      n: 1,
      seed: 0,
      aspect_ratio: "0.5:1",
      quality: "auto",
    },
    invalid: [
      { prompt: " " },
      { prompt: "x", n: 0 },
      { prompt: "x", n: 17 },
      { prompt: "x", n: Number.MAX_SAFE_INTEGER },
      { prompt: "x", size: "0x1" },
      { prompt: "x", references: ["https://asset.example/image"] },
    ],
  },
  {
    selector: {
      kind: "image",
      model_id: image.model_id,
      provider: "openrouter",
      variant: "references",
    },
    valid: { prompt: "x", references: ["data:image/png;base64,AQID"] },
    invalid: [
      { prompt: "x" },
      { prompt: "x", references: [] },
      {
        prompt: "x",
        references: Array(image.references_max! + 1).fill(
          "https://asset.example/image"
        ),
      },
    ],
  },
  {
    selector: { kind: "video", model_id: "google/veo-3.1", provider: "vercel" },
    valid: { prompt: " x ", seed: 1, duration: 0.5, resolution: "640x480" },
    invalid: [
      { prompt: "x", seed: 0 },
      { prompt: "x", duration: 0 },
      { prompt: "x", resolution: "720p" },
    ],
  },
  {
    selector: {
      kind: "video",
      model_id: "google/veo-3.1",
      provider: "fal",
      variant: "image",
    },
    valid: { prompt: "x", image_url: "https://asset.example/frame", seed: 0 },
    invalid: [
      { prompt: "x" },
      { prompt: "x", image_url: "https://asset.example/frame#fragment" },
    ],
  },
  {
    selector: { kind: "music", model_id: "google/lyria-3", provider: "gg" },
    valid: { prompt: ` ${"😀".repeat(2048)} `, seed: 0 },
    invalid: [{ prompt: "😀".repeat(2048) + "x" }, { prompt: "x", seed: 0.1 }],
  },
  {
    selector: {
      kind: "sound-effect",
      model_id: "eleven_text_to_sound_v2",
      provider: "elevenlabs",
    },
    valid: {
      prompt: ` ${"😀".repeat(450)} `,
      duration_seconds: 0.5,
      loop: false,
      prompt_influence: 0,
    },
    invalid: [
      { prompt: "😀".repeat(451) },
      { prompt: "x", duration_seconds: 0.49 },
      { prompt: "x", loop: null },
    ],
  },
  {
    selector: {
      kind: "text-to-speech",
      model_id: "eleven_v3",
      provider: "elevenlabs",
    },
    valid: { voice_id: " chosen-voice ", text: "😀".repeat(5000) },
    invalid: [
      { voice_id: "chosen-voice", text: "😀".repeat(5001) },
      { voice_id: "chosen-voice", text: " " },
    ],
  },
  {
    selector: {
      kind: "three-d",
      model_id: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
      provider: "fal",
    },
    valid: { prompt: ` ${"😀".repeat(1024)} ` },
    invalid: [{ prompt: "😀".repeat(1025) }, { prompt: "x", image: {} }],
  },
  {
    selector: {
      kind: "three-d",
      model_id: "fal-ai/trellis-2",
      provider: "fal",
    },
    valid: { image: { data: "AQID", media_type: "image/png" } },
    invalid: [
      { image: { data: "", media_type: "image/png" } },
      { image: { data: "AQID", media_type: "image/gif" } },
      { image: { data: "AQID", media_type: "image/png" }, prompt: " " },
    ],
  },
];

describe("MediaOperations and native operation validation", () => {
  it("describes and accepts the finite image submission ceiling", () => {
    const selector = cases[0]!.selector;
    const descriptor = operations.inspect(selector);
    expect(descriptor.input_schema.properties).toMatchObject({
      n: { minimum: 1, maximum: 16, default: 1 },
    });
    expect(
      operations.parseInput(selector, { prompt: "x", n: 16 }).input
    ).toMatchObject({ n: 16 });
  });

  it.each(cases)(
    "shares $selector.kind/$selector.provider/$selector.variant input policy before submission",
    async ({ selector, valid, invalid }) => {
      const request = vi.fn<typeof fetch>(async () => {
        throw new Error("Unexpected provider request");
      });
      const get = vi.fn<(provider: string) => string>(
        () => "synthetic-authorized-key"
      );
      const http = new ProviderHttp({ request, download: request });
      const prepared = operations.parseInput(selector, valid);
      let generate: (input: never) => Promise<unknown>;
      switch (prepared.kind) {
        case "image":
          generate = (
            await new ImageClient({ keys: { get }, http }).resolve(
              prepared.selection
            )
          ).generate;
          break;
        case "video":
          generate = (
            await new VideoClient({ keys: { get }, http }).resolve(
              prepared.selection
            )
          ).generate;
          break;
        case "music":
          generate = (
            await new MusicClient({
              gg: { getAccessToken: () => "synthetic-scoped-token" },
              gg_base_url: "https://fixture.example",
              http,
            }).resolve(prepared.selection)
          ).generate;
          break;
        case "sound-effect":
          generate = (
            await new SoundEffectClient({ keys: { get }, http }).resolve(
              prepared.selection
            )
          ).generate;
          break;
        case "text-to-speech":
          generate = (
            await new TextToSpeechClient({ keys: { get }, http }).resolve(
              prepared.selection
            )
          ).generate;
          break;
        case "three-d":
          if (prepared.provider_id !== "fal")
            throw new Error("Expected the legacy fal case");
          generate = (
            await new ThreeDClient({ keys: { get }, http }).resolve(
              prepared.selection
            )
          ).generate;
          break;
      }
      const reads = get.mock.calls.length;
      // Passing a native cancellation control proves accepted input reaches the
      // execution perimeter while keeping this validation proof free of submission.
      await expect(
        generate({ ...prepared.input, signal: AbortSignal.abort() } as never)
      ).rejects.toMatchObject({ code: "aborted" });
      for (const value of invalid) {
        expect(() => operations.parseInput(selector, value)).toThrowError(
          expect.objectContaining({ code: "invalid_input" })
        );
        const native = JSON.parse(JSON.stringify(value));
        if (prepared.kind === "text-to-speech") delete native.voice_id;
        if (prepared.kind === "three-d" && native.image?.data !== undefined) {
          native.image.data = Uint8Array.from(
            atob(native.image.data),
            (character) => character.charCodeAt(0)
          );
        }
        await expect(generate(native as never)).rejects.toMatchObject({
          code: "invalid_input",
        });
      }
      expect(get).toHaveBeenCalledTimes(reads);
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("keeps native optional-undefined compatibility outside the stricter JSON contract", async () => {
    const request = vi.fn<typeof fetch>(async () => {
      throw 0;
    });
    const http = new ProviderHttp({ request, download: request });
    const keys = { get: () => "synthetic-key" };
    const selected = await new ImageClient({ keys, http }).resolve({
      model_id: image.model_id,
      provider: "openrouter",
    });
    await expect(
      selected.generate({
        prompt: "x",
        references: undefined,
        signal: AbortSignal.abort(),
      })
    ).rejects.toMatchObject({ code: "aborted" });
    const video = await new VideoClient({ keys, http }).resolve({
      model_id: "google/veo-3.1",
      provider: "vercel",
    });
    await expect(
      video.generate({
        prompt: "x",
        image_url: undefined,
        signal: AbortSignal.abort(),
      })
    ).rejects.toMatchObject({ code: "aborted" });
    expect(request).not.toHaveBeenCalled();
  });
});
