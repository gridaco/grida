// GRIDA-SEC-004 — native and JSON Tripo validation before credential or upload authority.
import { models } from "@grida/ai-models";
import { InputSchema } from "./input-schema";
import type { TripoClient } from "./tripo-client";

/** Private schema owner shared by native execution and JSON discovery. */
export namespace TripoInputs {
  export const maxImageBytes = 20_000_000;
  const image = InputSchema.object({
    data: InputSchema.bytes(maxImageBytes),
    media_type: InputSchema.enumeration(["image/png", "image/jpeg"]),
  });
  const views = InputSchema.object({
    front: image,
    left: InputSchema.optional(image),
    back: InputSchema.optional(image),
    right: InputSchema.optional(image),
  });
  const multiview: InputSchema.Rule<TripoClient.Views> = {
    schema: InputSchema.freeze({
      ...views.schema,
      anyOf: [
        { required: ["left"] },
        { required: ["back"] },
        { required: ["right"] },
      ],
    }),
    parse(value, json) {
      const parsed = views.parse(value, json);
      if (!parsed.left && !parsed.back && !parsed.right) throw 0;
      return parsed as TripoClient.Views;
    },
  };
  export function rule<
    M extends TripoClient.ModelId,
    V extends TripoClient.Variant,
  >(model: M, variant: V): InputSchema.Rule<TripoClient.Input<M, V>> {
    const card: models.three_d.model_generation.ModelCard =
      models.three_d.model_generation.models[model];
    const fields = {
      texture: InputSchema.optional(InputSchema.boolean),
      pbr: InputSchema.optional(InputSchema.boolean),
      texture_quality: InputSchema.optional(
        InputSchema.enumeration(card.texture_quality)
      ),
      face_limit: InputSchema.optional(
        InputSchema.number({
          integer: true,
          min: card.face_limit.min,
          max: card.face_limit.detailed_max ?? card.face_limit.max,
        })
      ),
      seed: InputSchema.optional(InputSchema.number({ integer: true })),
      ...(card.geometry_quality
        ? {
            geometry_quality: InputSchema.optional(
              InputSchema.enumeration(card.geometry_quality)
            ),
          }
        : {}),
      ...(variant === "text"
        ? {
            prompt: InputSchema.string({
              trim: true,
              nonblank: true,
              max: 1024,
            }),
          }
        : variant === "image"
          ? { image }
          : { images: multiview }),
    };
    const base = InputSchema.object(fields);
    return {
      schema: InputSchema.freeze({
        ...base.schema,
        allOf: [
          {
            if: {
              properties: { texture: { const: false } },
              required: ["texture"],
            },
            // eslint-disable-next-line unicorn/no-thenable -- JSON Schema keyword, never a callable promise member.
            then: {
              properties: { pbr: { const: false } },
              not: { required: ["texture_quality"] },
            },
          },
          ...(card.geometry_quality
            ? [
                {
                  if: {
                    not: {
                      properties: { geometry_quality: { const: "detailed" } },
                      required: ["geometry_quality"],
                    },
                  },
                  // eslint-disable-next-line unicorn/no-thenable -- JSON Schema keyword, never a callable promise member.
                  then: {
                    properties: {
                      face_limit: { maximum: card.face_limit.max },
                    },
                  },
                },
              ]
            : []),
        ] as InputSchema.Json[],
      }),
      parse(value, json) {
        const parsed = base.parse(value, json);
        if (
          parsed.texture === false &&
          (parsed.pbr === true || parsed.texture_quality !== undefined)
        )
          throw 0;
        if (
          parsed.face_limit !== undefined &&
          parsed.geometry_quality !== "detailed" &&
          parsed.face_limit > card.face_limit.max
        )
          throw 0;
        return parsed as unknown as TripoClient.Input<M, V>;
      },
    };
  }
}
