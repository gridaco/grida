/**
 * GRIDA-SEC-004 — rig eligibility and rigged-model wire contracts.
 * Mesh data is inline base64; paths, provider URLs and secrets never cross here.
 */
import type { RiggingClient } from "@grida/ai";
import type { MediaItem } from "@grida/daemon";
import type { ThreeDGeneratedGlb } from "./three-d";

type Encoded<T> = T extends Uint8Array
  ? string
  : T extends object
    ? { [K in keyof T]: Encoded<T[K]> }
    : T;

export type RigCheckRequest = {
  provider: RiggingClient.Provider;
  input: Encoded<Omit<RiggingClient.CheckInput, "signal">>;
};

export type RigCheckResult = RiggingClient.CheckResult & {
  feature: "rig-check";
  provider_id: RiggingClient.Provider;
};

export type RiggingGenerateRequest = {
  [M in RiggingClient.ModelId]: {
    provider: RiggingClient.Provider;
    model_id: M;
    input: Encoded<Omit<RiggingClient.Input<M>, "signal">>;
  };
}[RiggingClient.ModelId];

export type RiggingGenerateResult = {
  feature: "rigging";
  provider_id: RiggingClient.Provider;
  model_id: RiggingClient.ModelId;
  glb: ThreeDGeneratedGlb;
  task: RiggingClient.Task;
  stored_media?: MediaItem;
};
