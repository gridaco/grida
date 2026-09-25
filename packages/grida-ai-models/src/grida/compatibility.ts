import type { catalog } from "./catalog";
import type { ModelTier } from "./tiers";

/** Fixed admission policy for the independently shipped schema-1 runtime. */
export namespace schema1 {
  // These are compatibility decisions, never copies of model facts. A new
  // service member requires an explicit decision before older runtimes see it.
  const members = new Set([
    "openai/gpt-5.5",
    "openai/gpt-5.5-pro",
    "openai/gpt-5.6-sol",
    "openai/gpt-5.6-terra",
    "openai/gpt-5.6-luna",
    "openai/gpt-6-astra",
    "anthropic/claude-sonnet-5",
    "anthropic/claude-fable-5.1",
    "anthropic/claude-fable-5",
    "anthropic/claude-opus-5",
    "anthropic/claude-opus-4.8",
    "google/gemini-3.8-flash",
    "google/gemini-3.7-flash",
    "google/gemini-3.1-pro-preview",
  ]);
  const luna = "openai/gpt-5.6-luna";
  const terra = "openai/gpt-5.6-terra";
  const sol = "openai/gpt-5.6-sol";
  const astra = "openai/gpt-6-astra";
  // Withdrawal can never restore membership. Each tier instead has explicit
  // compatible alternatives; exhaustion refuses publication of a broken gate.
  const tiers: Record<ModelTier, readonly string[]> = {
    nano: [luna, terra, sol, astra],
    mini: [terra, sol, astra, luna],
    pro: [sol, astra, terra, luna],
    max: [astra, sol, terra, luna],
  };

  /** Project only current admitted cards, inheriting their facts and lifecycle. */
  export function project(
    current: catalog.snapshot.Snapshot
  ): catalog.snapshot.Snapshot {
    const catalog = Object.fromEntries(
      Object.entries(current.text.catalog).filter(([id]) => members.has(id))
    );
    const tier_model_ids = {} as Record<ModelTier, string>;
    for (const tier of Object.keys(tiers) as ModelTier[]) {
      const id = tiers[tier].find((id) => Object.hasOwn(catalog, id));
      if (!id) throw new Error(`No schema-1-compatible tier model: ${tier}`);
      tier_model_ids[tier] = id;
    }
    return {
      ...current,
      schema: 1,
      text: { catalog, tier_model_ids },
      preferences: {
        ...current.preferences,
        text:
          catalog[terra] && !catalog[terra].deprecated
            ? { default_id: terra }
            : {},
      },
    };
  }
}
