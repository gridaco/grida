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

export function isByokProviderId(id: string): id is ByokProviderId {
  return (BYOK_PROVIDER_IDS as readonly string[]).includes(id);
}

/**
 * A provider id anywhere on the wire (run options, session rows, secrets):
 * a BYOK id or a configured endpoint id (issue #806). `string & {}` keeps
 * literal completion for the BYOK ids while admitting endpoint ids, which
 * are user-chosen slugs validated at the boundary.
 */
export type ProviderId = ByokProviderId | (string & {});
