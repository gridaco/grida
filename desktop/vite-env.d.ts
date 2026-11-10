export {};

/**
 * Compile-time constants baked by Vite `define` in the per-target
 * configs:
 *
 *   - `INSIDERS` — set in `vite.main.config.ts`
 *     (source: `process.env.INSIDERS`). Used by `env.ts` to pick the
 *     editor base URL.
 *   - `EDITOR_BASE_URL` — set in `vite.agent-sidecar.config.ts`.
 *     The desktop supervisor passes the runtime value from main over
 *     argv so dev (`localhost:3000`) and packaged (`grida.co`) cannot drift.
 *
 * Agent-sidecar uses `EDITOR_BASE_URL`; editor Supabase env remains an
 * editor concern and is not baked into desktop main/preload.
 */
declare global {
  const INSIDERS: 0 | 1;
  /** Packaged Stable build-time authority to create an isolated native profile. */
  const MANAGED_NATIVE_FIRST: 0 | 1;
  /** Provision a managed legacy profile that a later selector can retire. */
  const MANAGED_LEGACY_PREDECESSOR: 0 | 1;
  const EDITOR_BASE_URL: string;
}
