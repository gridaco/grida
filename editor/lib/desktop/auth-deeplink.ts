/**
 * GRIDA-SEC-005 — desktop sign-in deep-link contract.
 *
 * The single source for the `grida://auth/callback` return target, shared by
 * the parts that must agree on it: the PKCE start route
 * (`app/desktop/auth/start/route.ts`), the launch-page flow builders
 * (`host/auth/desktop-auth-flow.ts`), the Electron protocol router, and the
 * Supabase redirect allowlist (`supabase/config.toml`). It lives in
 * `@/lib/desktop` precisely because `app/desktop/**` is lint-barred from
 * `@/host/**` (GRIDA-SEC-004) but not from `@/lib/desktop` — so both the
 * route and the flow module import ONE constant instead of duplicating the
 * literal and risking drift across the contract.
 */
export const DESKTOP_AUTH_REDIRECT = "grida://auth/callback";
