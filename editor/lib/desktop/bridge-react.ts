/**
 * React-side adapters for the desktop bridge — kept out of `bridge.ts`
 * so that file stays a framework-agnostic engine surface.
 *
 * Per `code-react`, hooks here are thin edge wires.
 */

import { useEffect, useState } from "react";
import { type NavigationState, nav } from "./bridge";

export function useNavigationState(scope: nav.Scope): NavigationState | null {
  const [state, setState] = useState<NavigationState | null>(null);
  useEffect(() => nav.observe(scope, setState), [scope]);
  return state;
}
