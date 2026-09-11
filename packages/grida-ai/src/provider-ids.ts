// GRIDA-GG: provider — shared provider identities and explicit legacy precedence.
/**
 * Which generation modalities a BYOK provider serves. A provider may serve
 * several: OpenRouter does text + image; Vercel does text + image + video; fal
 * does image + video. This vocabulary is intentionally limited to the generic
 * model resolvers that consume {@link byokProvidersFor}. Provider-shaped
 * endpoints such as fal 3D generation and ElevenLabs Sound Effects/Text to
 * Speech select their exact provider directly; claiming broad `3d` or `audio`
 * support here would make this routing metadata dishonest.
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
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    // Sound Effects and Text to Speech are exact provider endpoints, not a
    // generic audio-model resolver. The provider remains in this identity
    // table so its BYOK secret can be stored, while readiness is checked by
    // the owning audio surfaces.
    modalities: [],
  },
  // Tripo exposes named 3D features, not a generic text/image/video resolver.
  { id: "tripo", label: "Tripo", modalities: [] },
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

/** Scoped hosted credentials are a separate authority family from BYOK keys. */
export const GG_PROVIDER_ID = "gg" as const;

export const GG_PROVIDER_METADATA = {
  id: GG_PROVIDER_ID,
  label: "Grida",
  /** Picker affordance copy — one source of truth for the UI. */
  included_label: "Grida — included",
  // Hosted music is an exact GG endpoint, not a generic audio resolver.
  modalities: ["text", "image", "video"],
} as const;

export function isGgProviderId(id: string): id is typeof GG_PROVIDER_ID {
  return id === GG_PROVIDER_ID;
}
