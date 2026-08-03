import { describe, expect, it } from "vitest";
import { models } from "@grida/ai-models";
import { resolveMediaModelHandoff } from "./media-model-handoff";

describe("resolveMediaModelHandoff", () => {
  it("routes every grounded 3D id to the 3D workspace", () => {
    for (const modelId of models.three_d.three_d_model_ids) {
      expect(resolveMediaModelHandoff(modelId)).toEqual({
        mode: "3d",
        modelId,
      });
    }
  });

  it("routes music and sound-effect ids to the audio workspace", () => {
    for (const modelId of models.audio.audio_model_ids) {
      expect(resolveMediaModelHandoff(modelId)).toEqual({
        mode: "audio",
        modelId,
      });
    }
  });

  it("rejects missing, unknown, and adjacent provider ids", () => {
    expect(resolveMediaModelHandoff(null)).toBeNull();
    expect(resolveMediaModelHandoff("")).toBeNull();
    expect(resolveMediaModelHandoff("fal-ai/unknown-model")).toBeNull();
    expect(resolveMediaModelHandoff("google/lyria-3/latest")).toBeNull();
  });
});
