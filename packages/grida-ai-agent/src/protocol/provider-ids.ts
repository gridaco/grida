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
 * A provider id anywhere on the wire (run options, session rows, secrets):
 * a BYOK id or a configured endpoint id (issue #806). `string & {}` keeps
 * literal completion for the BYOK ids while admitting endpoint ids, which
 * are user-chosen slugs validated at the boundary.
 */
export type ProviderId = ByokProviderId | (string & {});
