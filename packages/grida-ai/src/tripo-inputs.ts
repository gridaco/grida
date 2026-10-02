// GRIDA-SEC-004 — neutral Tripo contracts before credential or upload authority.
import contracts from "../schemas/inputs.generated.json";
import { InputSchema } from "./input-schema";
import type { TripoClient } from "./tripo-client";
import { TripoTransport } from "./tripo-transport";

export namespace TripoInputs {
  export const maxImageBytes = 20_000_000;
  export function rule<
    M extends TripoClient.ModelId,
    V extends TripoClient.Variant,
  >(model: M, variant: V): InputSchema.Rule<TripoClient.Input<M, V>> {
    return InputSchema.fromJson(
      contracts.model_generation[model][variant] as InputSchema.Schema
    );
  }
  export function uploadedRule<
    M extends TripoClient.ModelId,
    V extends TripoClient.Variant,
  >(model: M, variant: V): InputSchema.Rule<TripoClient.UploadedInput<M, V>> {
    const schema = InputSchema.mutableObject(
      structuredClone(
        contracts.model_generation[model][variant] as InputSchema.Schema
      )
    );
    const uploadedImage = {
      type: "object",
      additionalProperties: false,
      properties: {
        file_token: { type: "string" },
        media_type: { type: "string", enum: ["image/png", "image/jpeg"] },
      },
      required: ["file_token", "media_type"],
    };
    if (variant === "image") schema.properties.image = uploadedImage;
    if (variant === "multiview")
      for (const view of ["front", "left", "back", "right"])
        InputSchema.mutableObject(schema.properties.images).properties[view] =
          uploadedImage;
    const base = InputSchema.fromJson<TripoClient.UploadedInput<M, V>>(schema);
    return {
      schema: base.schema,
      parse(value, json) {
        const parsed = base.parse(value, json);
        if ("image" in parsed)
          TripoTransport.identifier(parsed.image.file_token, "file");
        if ("images" in parsed)
          for (const image of Object.values(parsed.images))
            if (image) TripoTransport.identifier(image.file_token, "file");
        return parsed;
      },
    };
  }
}
