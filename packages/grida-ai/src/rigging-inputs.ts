// GRIDA-SEC-004 — neutral rigging contracts and portable GLB validation.
import contracts from "../schemas/inputs.generated.json";
import { InputSchema } from "./input-schema";
import { TripoTransport } from "./tripo-transport";
import type { RiggingClient } from "./rigging-client";

export namespace RiggingInputs {
  export const maxMeshBytes = 60_000_000;
  function byteRule<T extends { mesh: RiggingClient.Mesh }>(
    schema: InputSchema.Schema
  ): InputSchema.Rule<T> {
    const base = InputSchema.fromJson<T>(schema);
    return {
      schema: base.schema,
      parse(value, json) {
        const parsed = base.parse(value, json);
        TripoTransport.validateGlb(parsed.mesh.data);
        return parsed;
      },
    };
  }
  export const check = byteRule<RiggingClient.CheckInput>(contracts.rig_check);
  export function rig<M extends RiggingClient.ModelId>(
    model: M
  ): InputSchema.Rule<RiggingClient.Input<M>> {
    return byteRule(contracts.rigging[model]);
  }
  function uploaded<T extends { mesh: RiggingClient.UploadedMesh }>(
    source: InputSchema.Schema
  ): InputSchema.Rule<T> {
    const schema = InputSchema.mutableObject(structuredClone(source));
    schema.properties.mesh = {
      type: "object",
      additionalProperties: false,
      properties: {
        file_token: { type: "string" },
        media_type: { type: "string", enum: ["model/gltf-binary"] },
      },
      required: ["file_token", "media_type"],
    };
    const base = InputSchema.fromJson<T>(schema);
    return {
      schema: base.schema,
      parse(value, json) {
        const parsed = base.parse(value, json);
        TripoTransport.identifier(parsed.mesh.file_token, "file");
        return parsed;
      },
    };
  }
  export const uploadedCheck = uploaded<RiggingClient.UploadedCheckInput>(
    contracts.rig_check
  );
  export function uploadedRig<M extends RiggingClient.ModelId>(
    model: M
  ): InputSchema.Rule<RiggingClient.UploadedInput<M>> {
    return uploaded(contracts.rigging[model]);
  }
}
