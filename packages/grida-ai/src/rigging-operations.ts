// GRIDA-SEC-006 — offline funded descriptors grant no token or credit authority.
// GRIDA-SEC-004 — mesh-operation discovery has no credentials or provider authority.
// GRIDA-GG: provider — fixed funded operation discovery does not imply account access.
import { catalog } from "@grida/ai-models/grida";
import { InputSchema, type InputJsonSchema } from "./input-schema";
import { RiggingInputs } from "./rigging-inputs";
import { MediaInputs } from "./media-inputs";
import type { RiggingClient } from "./rigging-client";

/** Credential-free discovery that preserves the structured/media result distinction. */
export class RiggingOperations {
  readonly #descriptors: readonly RiggingOperations.Descriptor[] =
    InputSchema.freeze(descriptors());
  list(
    filter: RiggingOperations.Filter = {}
  ): readonly RiggingOperations.Descriptor[] {
    try {
      InputSchema.exact(filter, ["kind", "feature", "model_id", "provider"]);
      validate(filter);
      return Object.freeze(
        this.#descriptors.filter(
          (entry) =>
            (filter.provider === undefined ||
              entry.provider_id === filter.provider) &&
            (filter.feature === undefined ||
              entry.feature === filter.feature) &&
            (filter.model_id === undefined ||
              (entry.feature === "rigging" &&
                entry.model_id === filter.model_id))
        )
      );
    } catch {
      throw new RiggingOperations.Failure("invalid_input");
    }
  }
  inspect(selector: RiggingOperations.Selector): RiggingOperations.Descriptor {
    try {
      InputSchema.exact(
        selector,
        selector.feature === "rig-check"
          ? ["kind", "feature", "provider", "variant"]
          : ["kind", "feature", "provider", "model_id", "variant"]
      );
      validate(selector);
      if (
        !selector.feature ||
        (selector.provider !== "tripo" && selector.provider !== "gg") ||
        (selector.variant !== undefined && selector.variant !== "mesh") ||
        (selector.feature === "rigging" && !selector.model_id)
      )
        throw 0;
    } catch {
      throw new RiggingOperations.Failure("invalid_input");
    }
    const descriptor = this.#descriptors.find(
      (entry) =>
        entry.provider_id === selector.provider &&
        entry.feature === selector.feature &&
        (entry.feature === "rig-check" ||
          (selector.feature === "rigging" &&
            entry.model_id === selector.model_id))
    );
    if (!descriptor)
      throw new RiggingOperations.Failure("operation_unavailable");
    return descriptor;
  }
  parseInput(
    selector: RiggingOperations.Selector,
    value: unknown
  ): RiggingOperations.Parsed {
    const descriptor = this.inspect(selector);
    try {
      if (descriptor.feature === "rig-check")
        return {
          kind: "three-d",
          feature: "rig-check",
          provider_id: descriptor.provider_id,
          variant: "mesh",
          selection: { feature: "rig-check", provider: descriptor.provider_id },
          input: RiggingInputs.check.parse(value, true),
        };
      return {
        kind: "three-d",
        feature: "rigging",
        provider_id: descriptor.provider_id,
        variant: "mesh",
        model_id: descriptor.model_id,
        selection: {
          feature: "rigging",
          provider: descriptor.provider_id,
          model_id: descriptor.model_id,
        },
        input: RiggingInputs.rig(descriptor.model_id).parse(value, true),
      } as RiggingOperations.Parsed;
    } catch {
      throw new RiggingOperations.Failure("invalid_input");
    }
  }
}
export namespace RiggingOperations {
  export type Feature = "rig-check" | "rigging";
  export type Filter = {
    kind?: "three-d";
    feature?: Feature;
    model_id?: string;
    provider?: RiggingClient.Provider;
  };
  export type Selector = RiggingClient.Selection<string> & {
    kind?: "three-d";
    variant?: "mesh";
  };
  type Common = {
    kind: "three-d";
    provider_id: RiggingClient.Provider;
    variant: "mesh";
    status: "listed" | "staged";
    input_schema: InputJsonSchema;
  };
  export type Descriptor = Readonly<
    Common &
      (
        | {
            feature: "rig-check";
            binding_id: "rig-check";
            output: Readonly<{
              representation: "structured";
              schema: InputJsonSchema;
            }>;
          }
        | {
            feature: "rigging";
            model_id: RiggingClient.ModelId;
            binding_id: catalog.three_d.rigging.ModelCard["binding_id"];
            output: Readonly<{
              representation: "native";
              field: "glb";
              cardinality: "one";
              data: "Uint8Array";
              media_types: readonly ["model/gltf-binary"];
              max_items: 1;
              max_total_bytes: number;
            }>;
          }
      )
  >;
  export type Parsed =
    | {
        kind: "three-d";
        feature: "rig-check";
        provider_id: RiggingClient.Provider;
        variant: "mesh";
        selection: RiggingClient.CheckSelection;
        input: RiggingClient.CheckInput;
      }
    | {
        [M in RiggingClient.ModelId]: {
          kind: "three-d";
          feature: "rigging";
          provider_id: RiggingClient.Provider;
          variant: "mesh";
          model_id: M;
          selection: RiggingClient.RigSelection<M>;
          input: RiggingClient.Input<M>;
        };
      }[RiggingClient.ModelId];
  export class Failure extends Error {
    readonly code: "invalid_input" | "operation_unavailable";
    constructor(code: "invalid_input" | "operation_unavailable") {
      const safe = code === "operation_unavailable" ? code : "invalid_input";
      super(safe);
      this.name = "RiggingOperationsFailure";
      this.code = safe;
    }
    toJSON() {
      return { code: this.code, message: this.code };
    }
  }
}
function validate(filter: RiggingOperations.Filter) {
  if (
    (filter.kind !== undefined && filter.kind !== "three-d") ||
    (filter.provider !== undefined &&
      filter.provider !== "tripo" &&
      filter.provider !== "gg") ||
    (filter.feature !== undefined &&
      !["rig-check", "rigging"].includes(filter.feature)) ||
    (filter.model_id !== undefined &&
      (typeof filter.model_id !== "string" ||
        !filter.model_id ||
        filter.model_id.length > 256))
  )
    throw 0;
}
function descriptors(): RiggingOperations.Descriptor[] {
  const schema = (rule: InputSchema.Rule<unknown>) => ({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...rule.schema,
  });
  const common = {
    kind: "three-d",
    provider_id: "tripo",
    variant: "mesh",
  } as const;
  const direct: RiggingOperations.Descriptor[] = [
    {
      ...common,
      feature: "rig-check",
      binding_id: "rig-check",
      status: catalog.three_d.rig_check.operation.status,
      input_schema: schema(RiggingInputs.check),
      output: {
        representation: "structured",
        schema: schema(
          InputSchema.object({
            riggable: InputSchema.boolean,
            rig_type: InputSchema.enumeration(
              catalog.three_d.rig_check.operation.rig_types
            ),
            task: InputSchema.object({
              id: InputSchema.string({ nonblank: true, max: 105 }),
              credits_consumed: InputSchema.optional(
                InputSchema.number({ min: 0 })
              ),
            }),
          })
        ),
      },
    },
    ...catalog.three_d.rigging.ordered_models().map(
      (card): RiggingOperations.Descriptor => ({
        ...common,
        feature: "rigging",
        model_id: card.id,
        binding_id: card.binding_id,
        status: card.status,
        input_schema: schema(RiggingInputs.rig(card.id)),
        output: {
          representation: "native",
          field: "glb",
          cardinality: "one",
          data: "Uint8Array",
          media_types: ["model/gltf-binary"],
          max_items: 1,
          max_total_bytes: MediaInputs.limits.glb,
        },
      })
    ),
  ];
  return direct.flatMap((descriptor) => [
    descriptor,
    { ...descriptor, provider_id: "gg" },
  ]);
}
