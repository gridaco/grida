/**
 * GRIDA-SEC-005 — desktop sign-in deep-link contract.
 *
 * The single source for the `…://auth/callback` return target, shared by the
 * parts that must agree on it: the PKCE start route
 * (`app/desktop/auth/start/route.ts`), the launch-page flow builders
 * (`host/auth/desktop-auth-flow.ts`), the Electron protocol router, and the
 * Supabase redirect allowlist (`supabase/config.toml`). It lives in
 * `@/lib/desktop` precisely because `app/desktop/**` is lint-barred from
 * `@/host/**` (GRIDA-SEC-004) but not from `@/lib/desktop` — so both the
 * route and the flow module import ONE constant instead of duplicating the
 * literal and risking drift across the contract.
 *
 * Scheme is per-environment (#955): the dev editor (`next dev`) returns to
 * `grida-dev://` — the scheme the dev/insiders desktop builds register — while
 * production returns to `grida://`, so a dev machine running BOTH builds never
 * has them fight over one scheme in the OS handler registry. This mirrors the
 * desktop's own `DEEP_LINK_SCHEME` (which keys off `app.isPackaged`/insiders);
 * the two derive the same split from opposite sides and must stay aligned. The
 * value is a build-time constant (NOT request input), so the redirect target
 * stays non-attacker-controllable — the property GRIDA-SEC-005 depends on.
 */
export const DESKTOP_AUTH_REDIRECT =
  process.env.NODE_ENV === "development"
    ? "grida-dev://auth/callback"
    : "grida://auth/callback";
