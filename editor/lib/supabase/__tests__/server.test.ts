/**
 * Locks in the lazy contract for `service_role` in `lib/supabase/server.ts`.
 *
 * History: every `service_role.<schema>` was constructed at module-eval
 * time, which threw `supabaseKey is required` whenever the module was
 * imported without `SUPABASE_SECRET_KEY` set (true in CI, true during
 * some build phases). Any consumer module that transitively reached
 * `service_role` inherited the brittleness — failures surfaced as
 * unrelated test files crashing on import. The lazy refactor makes
 * import free and defers `_createClient` to first property access.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createClientSpy = vi.fn<() => { __sentinel: string }>(() => ({
  __sentinel: "supabase-client",
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientSpy,
}));
// `next/headers` is unreachable in vitest (no Next.js request scope); the
// cookie-bound `createClient()` helpers in server.ts pull it in but we
// don't exercise them here, so a no-op stub is enough.
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn<() => { __sentinel: string }>(() => ({
    __sentinel: "ssr-client",
  })),
}));

beforeEach(() => {
  createClientSpy.mockClear();
  // Re-import on every test so memoization state is fresh per case.
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("service_role — lazy construction", () => {
  it("does NOT call createClient at module import time", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    await import("../server");
    expect(createClientSpy).not.toHaveBeenCalled();
  });

  it("constructs on first property access", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
    const { service_role } = await import("../server");

    expect(createClientSpy).not.toHaveBeenCalled();
    void service_role.workspace;
    expect(createClientSpy).toHaveBeenCalledTimes(1);
  });

  it("memoizes per-schema — repeat access does not reconstruct", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
    const { service_role } = await import("../server");

    const a = service_role.workspace;
    const b = service_role.workspace;
    expect(a).toBe(b);
    expect(createClientSpy).toHaveBeenCalledTimes(1);
  });

  it("constructs each schema independently", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
    const { service_role } = await import("../server");

    void service_role.workspace;
    void service_role.library;
    void service_role.workspace; // already cached
    expect(createClientSpy).toHaveBeenCalledTimes(2);
  });
});
