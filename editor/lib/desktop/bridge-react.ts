/**
 * React-side adapters for the desktop bridge — kept out of `bridge.ts`
 * so that file stays a framework-agnostic engine surface.
 *
 * Per `code-react`, hooks here are thin edge wires.
 */

import { useEffect, useState } from "react";
import { type NavigationState, getDesktopBridge } from "./bridge";

/**
 * React hook: returns the current per-window Chromium navigation
 * state, kept live via the preload's `WINDOW_NAVIGATION_CHANGED`
 * push channel.
 */
export function useNavigationState(): NavigationState | null {
  const [state, setState] = useState<NavigationState | null>(null);
  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;
    let cancelled = false;
    bridge.window.navigation
      .state()
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch(() => {
        // Initial-read failure is non-fatal; buttons stay hidden.
      });
    const unsubscribe = bridge.window.navigation.subscribe((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
  return state;
}
