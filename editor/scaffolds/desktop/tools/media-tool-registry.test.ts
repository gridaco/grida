import { describe, expect, it } from "vitest";
import { models } from "@grida/ai-models";
import { DesktopMediaTool } from "./media-tool-registry";

describe("DesktopMediaTool", () => {
  it("keeps the menu ids unique and grouped", () => {
    expect(new Set(DesktopMediaTool.list.map((tool) => tool.id)).size).toBe(
      DesktopMediaTool.list.length
    );
    expect(DesktopMediaTool.list.map((tool) => tool.id)).toEqual([
      "image-generator",
      "video-generator",
      "3d-generator",
      "text-to-music",
      "text-to-sound-effects",
      "3d-viewer",
      "audio-player",
    ]);
    expect(DesktopMediaTool.groups.map((group) => group.id)).toEqual([
      "create",
      "inspect",
    ]);
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
      expect(selection.initialHandoff).toBeNull();
    }

    for (const card of models.video.listed_models()) {
      const selection = DesktopMediaTool.resolveSelection(null, card.id);
      expect(selection.tool.id).toBe("video-generator");
      expect(selection.initialModelId).toBe(card.id);
      expect(selection.initialHandoff).toBeNull();
    }

    for (const modelId of models.three_d.three_d_model_ids) {
      const selection = DesktopMediaTool.resolveSelection(null, modelId);
      expect(selection.tool.id).toBe("3d-generator");
      expect(selection.initialModelId).toBe(modelId);
      expect(selection.initialHandoff).toEqual({ mode: "3d", modelId });
    }

    for (const modelId of models.audio.audio_model_ids) {
      const selection = DesktopMediaTool.resolveSelection(null, modelId);
      expect(selection.tool.id).toBe(
        models.audio.models[modelId].category === "audio/music"
          ? "text-to-music"
          : "text-to-sound-effects"
      );
      expect(selection.initialModelId).toBe(modelId);
      expect(selection.initialHandoff).toEqual({ mode: "audio", modelId });
    }
  });

  it("rejects a model that does not belong to the selected tool", () => {
    const selection = DesktopMediaTool.resolveSelection(
      "text-to-sound-effects",
      "google/lyria-3"
    );
    expect(selection.tool.id).toBe("text-to-sound-effects");
    expect(selection.initialModelId).toBe(
      models.audio.sound_effect_model_ids[0]
    );
    expect(selection.initialHandoff).toEqual({
      mode: "audio",
      modelId: models.audio.sound_effect_model_ids[0],
    });
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
        .initialHandoff
    ).toBeNull();
    expect(
      DesktopMediaTool.resolveSelection("audio-player", "google/lyria-3")
        .initialHandoff
    ).toBeNull();
  });

  it("keeps old 3D deep links working inside the unified generator", () => {
    expect(DesktopMediaTool.resolveSelection("text-to-3d", null)).toEqual({
      tool: DesktopMediaTool.resolve("3d-generator"),
      initialModelId: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
      initialHandoff: {
        mode: "3d",
        modelId: "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d",
      },
    });
    expect(DesktopMediaTool.resolveSelection("image-to-3d", null)).toEqual({
      tool: DesktopMediaTool.resolve("3d-generator"),
      initialModelId: "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
      initialHandoff: {
        mode: "3d",
        modelId: "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d",
      },
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
    expect(DesktopMediaTool.hrefForModel("unknown-model")).toBe(
      "/desktop/tools"
    );
  });
});
