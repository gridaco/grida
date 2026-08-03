import { models } from "@grida/ai-models";

export type MediaModelHandoff =
  | Readonly<{
      mode: "3d";
      modelId: models.three_d.ThreeDModelId;
    }>
  | Readonly<{
      mode: "audio";
      modelId: models.audio.AudioModelId;
    }>;

const THREE_D_MODEL_IDS = new Set<string>(models.three_d.three_d_model_ids);
const AUDIO_MODEL_IDS = new Set<string>(models.audio.audio_model_ids);

/**
 * Resolve the exact catalogue id accepted by the media-formats playground.
 *
 * The query is a handoff, not an open provider/model route. Unknown ids fail
 * closed and let the playground use its normal local-viewer default.
 */
export function resolveMediaModelHandoff(
  value: string | null | undefined
): MediaModelHandoff | null {
  if (!value) return null;
  if (THREE_D_MODEL_IDS.has(value)) {
    return {
      mode: "3d",
      modelId: value as models.three_d.ThreeDModelId,
    };
  }
  if (AUDIO_MODEL_IDS.has(value)) {
    return {
      mode: "audio",
      modelId: value as models.audio.AudioModelId,
    };
  }
  return null;
}
