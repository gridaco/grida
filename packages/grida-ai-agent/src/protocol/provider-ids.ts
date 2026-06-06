/**
 * BYOK provider identity + neutral metadata.
 *
 * Client-safe. No provider SDK imports; this is just the public identity
 * contract consumers can compile against and render from.
 */

export const BYOK_PROVIDER_METADATA = [
  {
    id: "openrouter",
    label: "OpenRouter",
  },
  {
    id: "vercel",
    label: "Vercel",
  },
] as const;

export type ByokProviderMetadata = (typeof BYOK_PROVIDER_METADATA)[number];

export type ByokProviderId = ByokProviderMetadata["id"];

export const BYOK_PROVIDER_IDS = BYOK_PROVIDER_METADATA.map(
  (provider) => provider.id
) as readonly ByokProviderId[];
