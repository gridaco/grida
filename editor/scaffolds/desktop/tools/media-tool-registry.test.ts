import { describe, expect, it } from "vitest";
import { catalog as models } from "@grida/ai-models/grida";
import { DesktopMediaTool } from "./media-tool-registry";

describe("DesktopMediaTool", () => {
  it("keeps the menu ids unique and grouped", () => {
    expect(new Set(DesktopMediaTool.list.map((tool) => tool.id)).size).toBe(
      DesktopMediaTool.list.length
    );
    expect(DesktopMediaTool.list.map((tool) => tool.id)).toEqual([
      "image-generator",
      "video-generator",
      "model-generation",
      "3d-generator",
      "text-to-music",
      "text-to-sound-effects",
      "text-to-speech",
      "3d-viewer",
      "audio-player",
    ]);
    expect(DesktopMediaTool.groups.map((group) => group.id)).toEqual([
      "create",
      "inspect",
    ]);
  });

  it("keeps both staged and listed family members available in dedicated tools", () => {
    for (const [tool, cards] of [
      ["3d-generator", models.three_d.ordered_models()],
      ["text-to-sound-effects", models.audio.sound_effects.ordered_models()],
      ["text-to-speech", models.audio.text_to_speech.ordered_models()],
    ] as const) {
      expect(DesktopMediaTool.resolve(tool).modelIds).toEqual(
        cards.map((card) => card.id)
      );
    }
  });

  it("fails missing and unknown tool ids closed to the default", () => {
    expect(DesktopMediaTool.resolve(null).id).toBe(DesktopMediaTool.defaultId);
    expect(DesktopMediaTool.resolve("unknown-tool").id).toBe(
      DesktopMediaTool.defaultId
    );
  });

  it("infers the focused tool for every grounded generation model", () => {
    for (const card of models.image.listed_models()) {
      const selection = DesktopMediaTool.resolveSelection(null, card.id);
      expect(selection.tool.id).toBe("image-generator");
      expect(selection.initialModelId).toBe(card.id);
    }

    for (const card of models.video.listed_models()) {
      const selection = DesktopMediaTool.resolveSelection(null, card.id);
      expect(selection.tool.id).toBe("video-generator");
      expect(selection.initialModelId).toBe(card.id);
    }

    for (const modelId of models.three_d.three_d_model_ids) {
      const selection = DesktopMediaTool.resolveSelection(null, modelId);
      expect(selection.tool.id).toBe("3d-generator");
      expect(selection.initialModelId).toBe(modelId);
    }
    for (const modelId of models.three_d.model_generation.model_ids) {
      const selection = DesktopMediaTool.resolveSelection(null, modelId);
      expect(selection.tool.id).toBe("model-generation");
      expect(selection.initialModelId).toBe(modelId);
    }

    for (const modelId of models.audio.music.model_ids) {
      const selection = DesktopMediaTool.resolveSelection(null, modelId);
      expect(selection.tool.id).toBe("text-to-music");
      expect(selection.initialModelId).toBe(modelId);
    }
    for (const modelId of models.audio.sound_effects.model_ids) {
      const selection = DesktopMediaTool.resolveSelection(null, modelId);
      expect(selection.tool.id).toBe("text-to-sound-effects");
      expect(selection.initialModelId).toBe(modelId);
    }
    for (const modelId of models.audio.text_to_speech.model_ids) {
      const selection = DesktopMediaTool.resolveSelection(null, modelId);
      expect(selection.tool.id).toBe("text-to-speech");
      expect(selection.initialModelId).toBe(modelId);
    }
  });

  it("rejects a model that does not belong to the selected tool", () => {
    const selection = DesktopMediaTool.resolveSelection(
      "text-to-sound-effects",
      "google/lyria-3"
    );
    expect(selection.tool.id).toBe("text-to-sound-effects");
    expect(selection.initialModelId).toBe(
      models.audio.sound_effects.model_ids[0]
    );
  });

  it("opens image generation on the shared Flare default when no model was chosen", () => {
    expect(
      DesktopMediaTool.resolveSelection("image-generator", null).initialModelId
    ).toBe("openai/gpt-image-2.5-flare");
    expect(
      DesktopMediaTool.resolveSelection("image-generator", "unknown-model")
        .initialModelId
    ).toBe("openai/gpt-image-2.5-flare");
  });

  it("preserves an explicit legacy image model instead of applying the new default", () => {
    expect(
      DesktopMediaTool.resolveSelection("image-generator", "openai/gpt-image-2")
        .initialModelId
    ).toBe("openai/gpt-image-2");
    expect(
      DesktopMediaTool.resolveSelection(null, "openai/gpt-image-2")
        .initialModelId
    ).toBe("openai/gpt-image-2");
  });

  it("preserves existing non-image generation defaults independently of list sorting", () => {
    expect(
      DesktopMediaTool.resolveSelection("video-generator", null).initialModelId
    ).toBe("google/veo-3.1");
    expect(
      DesktopMediaTool.resolveSelection("3d-generator", null).initialModelId
    ).toBe("fal-ai/hunyuan-3d/v3.1/pro/text-to-3d");
    expect(
      DesktopMediaTool.resolveSelection("model-generation", null).initialModelId
    ).toBe("tripo/h3.1");
    expect(
      DesktopMediaTool.resolveSelection("text-to-music", null).initialModelId
    ).toBe("google/lyria-3");
  });

  it("keeps viewer selections generation-free", () => {
    expect(
      DesktopMediaTool.resolveSelection("image-viewer", null).tool.modelIds
    ).toEqual([]);
    expect(
      DesktopMediaTool.resolveSelection("video-viewer", null).tool.modelIds
    ).toEqual([]);
    expect(
      DesktopMediaTool.resolveSelection("3d-viewer", "fal-ai/trellis-2")
        .initialModelId
    ).toBeNull();
    expect(
      DesktopMediaTool.resolveSelection("audio-player", "google/lyria-3")
        .initialModelId
    ).toBeNull();
  });

  it("keeps old 3D deep links working inside the unified generator", () => {
    expect(DesktopMediaTool.resolveSelection("text-to-3d", null)).toEqual({
      tool: DesktopMediaTool.resolve("3d-generator"),
      initialModelId: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
    });
    expect(DesktopMediaTool.resolveSelection("image-to-3d", null)).toEqual({
      tool: DesktopMediaTool.resolve("3d-generator"),
      initialModelId: "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
    });
  });

  it("builds a deep link that round-trips a model handoff", () => {
    const imageModelId = models.image.listed_models()[0]!.id;
    expect(DesktopMediaTool.hrefForModel(imageModelId)).toBe(
      `/desktop/tools?tool=image-generator&model=${encodeURIComponent(imageModelId)}`
    );
    const videoModelId = models.video.listed_models()[0]!.id;
    expect(DesktopMediaTool.hrefForModel(videoModelId)).toBe(
      `/desktop/tools?tool=video-generator&model=${encodeURIComponent(videoModelId)}`
    );
    expect(DesktopMediaTool.hrefForModel("fal-ai/trellis-2")).toBe(
      "/desktop/tools?tool=3d-generator&model=fal-ai%2Ftrellis-2"
    );
    expect(DesktopMediaTool.hrefForModel("tripo/p2")).toBe(
      "/desktop/tools?tool=model-generation&model=tripo%2Fp2"
    );
    expect(DesktopMediaTool.hrefForModel("unknown-model")).toBe(
      "/desktop/tools"
    );
  });
});
