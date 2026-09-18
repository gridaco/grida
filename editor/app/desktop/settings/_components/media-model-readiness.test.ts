import { describe, expect, it } from "vitest";
import { MediaModelReadiness } from "./media-model-readiness";

// GRIDA-GG: desktop — funded Tripo readiness is feature-capability gated.
describe("MediaModelReadiness.tripo", () => {
  it("admits either ready lane and keeps unresolved lanes pending", () => {
    expect(MediaModelReadiness.tripo(false, true, true)).toBe(true);
    expect(MediaModelReadiness.tripo(true, false, true)).toBe(true);
    expect(MediaModelReadiness.tripo(null, true, true)).toBe(true);
    expect(MediaModelReadiness.tripo(false, null, true)).toBeNull();
    expect(MediaModelReadiness.tripo(false, false, true)).toBe(false);
  });
  it("does not infer hosted Tripo from an older host's unrelated GG session", () => {
    expect(MediaModelReadiness.tripo(false, true, false)).toBe(false);
    expect(MediaModelReadiness.tripo(false, null, false)).toBe(false);
    expect(MediaModelReadiness.tripo(true, null, false)).toBe(true);
  });
});

describe("MediaModelReadiness.visual", () => {
  const imageId = "openai/gpt-image-2";
  const videoId = "google/gemini-omni-1.1-flash";
  const current = "0.0.25";

  it("requires a connected BYOK provider with the exact operation", () => {
    expect(
      MediaModelReadiness.visual(
        "image",
        imageId,
        new Set(["openrouter"]),
        false,
        current
      )
    ).toBe(true);
    expect(
      MediaModelReadiness.visual(
        "video",
        videoId,
        new Set(["openrouter"]),
        false,
        current
      )
    ).toBe(false);
    expect(
      MediaModelReadiness.visual(
        "video",
        videoId,
        new Set(["fal"]),
        false,
        current
      )
    ).toBe(true);
  });

  it("admits fal-hosted media only on a compatible native client", () => {
    expect(
      MediaModelReadiness.visual("video", videoId, new Set(), true, current)
    ).toBe(true);
    expect(
      MediaModelReadiness.visual("video", videoId, new Set(), true, "0.0.24")
    ).toBe(false);
    expect(
      MediaModelReadiness.visual("image", imageId, new Set(), true, "0.0.24")
    ).toBe(true);
  });

  it("does not mistake a BYOK binding for hosted admission", () => {
    expect(
      MediaModelReadiness.visual(
        "video",
        "xai/grok-imagine-video-1.5",
        new Set(),
        true,
        current
      )
    ).toBe(false);
  });

  it("stays pending only when an unresolved source can make the route available", () => {
    expect(
      MediaModelReadiness.visual("image", imageId, null, false, current)
    ).toBeNull();
    expect(
      MediaModelReadiness.visual("image", imageId, new Set(), null, current)
    ).toBeNull();
    expect(
      MediaModelReadiness.visual("image", imageId, null, true, current)
    ).toBe(true);
    expect(
      MediaModelReadiness.visual("video", videoId, null, null, "0.0.24")
    ).toBe(false);
    expect(
      MediaModelReadiness.visual("video", "unknown", null, null, current)
    ).toBe(false);
  });
});
