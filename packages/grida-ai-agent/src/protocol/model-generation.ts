/**
 * GRIDA-SEC-004 — model-generation wire contract. Provider credentials and
 * expiring asset URLs remain inside the host; image data is inline base64.
 */
import type { TripoClient } from "@grida/ai";
import type { MediaItem } from "@grida/daemon";
import type { ThreeDGeneratedGlb } from "./three-d";

/** Base64 encodes bytes only; strings are never file paths or download grants. */
type Encoded<T> = T extends Uint8Array
  ? string
  : T extends object
    ? { [K in keyof T]: Encoded<T[K]> }
    : T;

export type ModelGenerationGenerateRequest = {
  [M in TripoClient.ModelId]: {
    [V in TripoClient.Variant]: {
      model_id: M;
      provider: "tripo";
      variant: V;
      /** SDK JSON input: image.data contains base64 without a data: prefix. */
      input: Encoded<Omit<TripoClient.Input<M, V>, "signal">>;
    };
  }[TripoClient.Variant];
}[TripoClient.ModelId];

export type ModelGenerationGenerateResult = {
  feature: "model-generation";
  model_id: TripoClient.ModelId;
  provider_id: "tripo";
  variant: TripoClient.Variant;
  glb: ThreeDGeneratedGlb;
  /** Safe provider task identity and actual charged credits, when reported. */
  task: TripoClient.Result["task"];
  /** Present when the host media store accepted the downloaded model. */
  stored_media?: MediaItem;
};
