/**
 * GRIDA-SEC-005 / #955 — the deep-link URL schemes Grida owns, in one place.
 *
 * `grida` is production; `grida-dev` is local dev/insiders (a dev build registers
 * its own scheme so it never fights an installed production Grida over a single OS
 * handler). A build REGISTERS exactly one — see `DEEP_LINK_SCHEME` in `env.ts`,
 * which needs `electron` to pick the active channel — but the protocol router and
 * the argv classifier ACCEPT the whole set: the OS only ever delivers a build its
 * own scheme, so accepting both keeps those paths env-agnostic.
 *
 * Deliberately electron-free (no `env.ts` import) so the isolated, electron-free
 * argv classifier (`main/open-handoff.ts`, tested without an Electron mock) can
 * share this source of truth. Rename or add a variant here and the router +
 * classifier follow automatically.
 */
export const DEEP_LINK_SCHEMES = ["grida", "grida-dev"] as const;

export type DeepLinkScheme = (typeof DEEP_LINK_SCHEMES)[number];
