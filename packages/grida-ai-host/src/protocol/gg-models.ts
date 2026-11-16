// GRIDA-SEC-004 — credential-free host discovery projection for installed clients.
import type { GGModel, GGOperation } from "@grida/ai";
export type GGModelsView = {
  revision: string;
  expires_at: number;
  models: (Omit<GGModel, "request_schemas"> & {
    client_supported_options?: {
      background?: readonly string[];
      /** This installed native client can submit a prompt-only video operation. */
      video_text?: boolean;
    };
  })[];
  operations: Omit<GGOperation, "input_schema">[];
  /** Includes model-less structured features such as typed rig eligibility. */
  endpoint_ids: string[];
};
