import { catalog } from "@grida/ai-models/grida";
import type { RiggingGenerateRequest } from "@/lib/desktop/bridge";
import { LocalGltfBundle } from "../media-formats/local-gltf-bundle";

/** Local file admission and compatible-model selection for the rigging tool. */
export namespace RiggingForm {
  // Conservative UI limit matching the native mesh admission, below Tripo's 150 MB limit.
  export const maxMeshBytes = 60_000_000;
  export type Mesh = { data: string; media_type: "model/gltf-binary" };
  export const bodyLabels: Record<catalog.three_d.rigging.RigType, string> = {
    biped: "Humanoid",
    quadruped: "Four-legged",
    hexapod: "Six-legged",
    octopod: "Eight-legged",
    avian: "Bird",
    serpentine: "Serpentine",
    aquatic: "Aquatic",
  };

  export function compatibleModels(rigType: catalog.three_d.rigging.RigType) {
    return catalog.three_d.rigging
      .listed_models()
      .filter((model) => model.rig_types.includes(rigType));
  }

  export function request(
    modelId: catalog.three_d.rigging.ModelId,
    mesh: Mesh,
    rigType: catalog.three_d.rigging.RigType,
    spec: catalog.three_d.rigging.Spec,
    provider: RiggingGenerateRequest["provider"] = "tripo"
  ): RiggingGenerateRequest {
    const model = catalog.three_d.rigging.models[modelId];
    if (
      !(model.rig_types as readonly string[]).includes(rigType) ||
      !(model.specs as readonly string[]).includes(spec)
    ) {
      throw new Error("Choose a rigging model compatible with this body type.");
    }
    // The runtime compatibility check establishes the correlated wire union.
    return {
      // GRIDA-GG: desktop — preserve the selected funding lane.
      provider,
      model_id: modelId,
      input: { mesh, rig_type: rigType, spec },
    } as RiggingGenerateRequest;
  }

  export async function mesh(file: File): Promise<Mesh> {
    if (!file.name.toLowerCase().endsWith(".glb"))
      throw new Error("Choose a GLB model.");
    if (!file.size) throw new Error("The model file is empty.");
    if (file.size > maxMeshBytes)
      throw new Error("Choose a model smaller than 60 MB.");
    // Reject ambient external resources and validate the bundle before uploading.
    const data = await LocalGltfBundle.open([file]).read();
    if (data.byteLength > maxMeshBytes)
      throw new Error("Choose a model smaller than 60 MB.");
    const bytes = new Uint8Array(data);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
    }
    return { data: btoa(binary), media_type: "model/gltf-binary" };
  }
}
