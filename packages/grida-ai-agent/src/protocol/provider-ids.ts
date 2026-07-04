// GRIDA-GG: provider — the `gg` hosted provider id + metadata (docs/wg/platform/hosted-ai.md)
/**
 * BYOK provider identity + neutral metadata.
 *
 * Client-safe. No provider SDK imports; this is just the public identity
 * contract consumers can compile against and render from.
 */

/**
 * Which generation modalities a BYOK provider serves. A provider may serve
 * several: OpenRouter does text + image; Vercel does text + image + video; fal
 * does image + video (its catalog bindings are image-to-video). The marker
 * keeps each resolver from ever picking a provider that can't serve its
 * modality, while the secrets store + settings UI still list every provider so
 * its key can be stored.
 */
export type ByokModality = "text" | "image" | "video";

export const BYOK_PROVIDER_METADATA = [
  {
    id: "openrouter",
    label: "OpenRouter",
    modalities: ["text", "image", "video"],
  },
  {
    id: "vercel",
    label: "Vercel",
    modalities: ["text", "image", "video"],
  },
  {
    id: "fal",
    label: "fal",
    modalities: ["image", "video"],
  },
] as const;

export type ByokProviderMetadata = (typeof BYOK_PROVIDER_METADATA)[number];

export type ByokProviderId = ByokProviderMetadata["id"];

export const BYOK_PROVIDER_IDS = BYOK_PROVIDER_METADATA.map(
  (provider) => provider.id
) as readonly ByokProviderId[];

export function isByokProviderId(id: string): id is ByokProviderId {
  return (BYOK_PROVIDER_IDS as readonly string[]).includes(id);
}

/** BYOK providers that serve `modality`, in precedence (metadata) order. */
export function byokProvidersFor(
  modality: ByokModality
): readonly ByokProviderMetadata[] {
  return BYOK_PROVIDER_METADATA.filter((p) =>
    (p.modalities as readonly string[]).includes(modality)
  );
}

/**
 * The Grida hosted ("included") provider — GRIDA-SEC-006. Deliberately
 * NOT in {@link BYOK_PROVIDER_METADATA}: that list is honestly
 * BYOK-labeled and drives the secrets UI + `/secrets/*` allowlist, and
 * grida has no user key — its credential is the short-lived session
 * token the renderer pushes (`/auth/gg/set`). The run-input gate
 * accepts this id; the secrets routes must keep REJECTING it.
 */
export const GG_PROVIDER_ID = "gg" as const;

export const GG_PROVIDER_METADATA = {
  id: GG_PROVIDER_ID,
  label: "Grida",
  /** Picker affordance copy — one source of truth for the UI. */
  included_label: "Grida — included",
  modalities: ["text", "image", "video"],
} as const;

export function isGgProviderId(id: string): id is typeof GG_PROVIDER_ID {
  return id === GG_PROVIDER_ID;
}

/**
 * A provider id anywhere on the wire (run options, session rows, secrets):
 * a BYOK id, the grida hosted id, or a configured endpoint id (issue
 * #806). `string & {}` keeps literal completion for the known ids while
 * admitting endpoint ids, which are user-chosen slugs validated at the
 * boundary.
 */
export type ProviderId = ByokProviderId | typeof GG_PROVIDER_ID | (string & {});
