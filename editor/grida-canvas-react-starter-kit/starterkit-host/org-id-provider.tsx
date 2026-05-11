"use client";

/**
 * Host-injected organization id for AI server actions.
 *
 * The starterkit is workspace-agnostic — it cannot import
 * `@/scaffolds/workspace` directly. Hosts that mount starterkit components
 * which call AI seam actions (e.g. `<ImageToolbar />`) must wrap the tree
 * in `<StarterKitOrgIdProvider organizationId={...} />` so the components
 * can thread a verified `organizationId` through to the server actions.
 *
 * Without a provider, `useStarterKitOrgId()` returns `null`, and consumers
 * should surface a friendly "sign in to use this" message instead of
 * letting the server return 400 (GRIDA-SEC-003).
 *
 * Mirrors the local `PreviewProvider` / `usePreview` pattern in
 * `../starterkit-preview` — small, single-purpose context exposed via a
 * hook, defined alongside the components it serves.
 */

import React from "react";

const StarterKitOrgIdContext = React.createContext<number | null>(null);

export function StarterKitOrgIdProvider({
  organizationId,
  children,
}: React.PropsWithChildren<{
  /**
   * Verified organization id from the host's workspace context. Pass
   * `null`/`undefined` for unauthenticated or workspace-less hosts (e.g.
   * standalone playgrounds); consumers will degrade gracefully.
   */
  organizationId?: number | null;
}>) {
  return (
    <StarterKitOrgIdContext.Provider value={organizationId ?? null}>
      {children}
    </StarterKitOrgIdContext.Provider>
  );
}

/**
 * Returns the host-injected organization id, or `null` when no host has
 * provided one. Components that need the id for server actions should
 * branch on `null` and show a clear "sign in" message rather than calling
 * the action and letting it 400.
 */
export function useStarterKitOrgId(): number | null {
  return React.useContext(StarterKitOrgIdContext);
}
