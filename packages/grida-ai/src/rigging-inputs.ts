// GRIDA-SEC-004 — rigging native/JSON validation before key lookup or upload.
import { models } from "@grida/ai-models";
import { InputSchema } from "./input-schema";
import { TripoTransport } from "./tripo-transport";
import type { RiggingClient } from "./rigging-client";

/** Private shared contract for the two mesh operations. */
export namespace RiggingInputs {
  // Conservative simple-upload ceiling; larger provider uploads are a separate workflow.
  export const maxMeshBytes = 60_000_000;
  const rawMesh = InputSchema.object({
    data: InputSchema.bytes(maxMeshBytes),
    media_type: InputSchema.enumeration(["model/gltf-binary"]),
  });
  const mesh: InputSchema.Rule<RiggingClient.Mesh> = {
    schema: InputSchema.freeze({
      ...rawMesh.schema,
      "x-grida-portable-glb": true,
    }),
    parse(value, json) {
      const parsed = rawMesh.parse(value, json);
      TripoTransport.validateGlb(parsed.data);
      return parsed;
    },
  };
  export const check = InputSchema.object({ mesh });
  const uploadedMesh = InputSchema.object({
    file_token: {
      schema: { type: "string" },
      parse(value: unknown) {
        return TripoTransport.identifier(value, "file");
      },
    },
    media_type: InputSchema.enumeration(["model/gltf-binary"]),
  });
  export const uploadedCheck = InputSchema.object({ mesh: uploadedMesh });
  export function rig<M extends RiggingClient.ModelId>(
    model: M
  ): InputSchema.Rule<RiggingClient.Input<M>> {
    return build(model, mesh) as InputSchema.Rule<RiggingClient.Input<M>>;
  }
  export function uploadedRig<M extends RiggingClient.ModelId>(
    model: M
  ): InputSchema.Rule<RiggingClient.UploadedInput<M>> {
    return build(model, uploadedMesh) as InputSchema.Rule<
      RiggingClient.UploadedInput<M>
    >;
  }
  function build<M extends RiggingClient.ModelId, I>(
    model: M,
    mesh: InputSchema.Rule<I>
  ) {
    const card = models.three_d.rigging.models[model];
    return InputSchema.object({
      mesh,
      rig_type: InputSchema.enumeration(card.rig_types),
      spec: InputSchema.enumeration(card.specs),
    });
  }
}
