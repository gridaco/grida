"use client";

/**
 * First-run onboarding completion flag (issue #813 zero-config onboarding).
 *
 * The desktop welcome page shows a one-time onboarding step that detects the
 * user's `claude` and gets them to a ready state. Once dismissed it should
 * never reappear — so the flag is in `localStorage` (survives restart), unlike
 * the per-navigation `welcome_handoff` (sessionStorage).
 *
 * Pure renderer UI state — NOT a host/desktop setting: persisting it through
 * the agent host would add a bridge round-trip and a new persisted host field
 * for one boolean. Keep it here, single owner of the key (the welcome page
 * reads, the onboarding step writes).
 */

const KEY = "grida.desktop.onboarding.completed.v1";

export namespace onboarding_flag {
  /** Has the user finished (or skipped) first-run onboarding? */
  export function isComplete(): boolean {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(KEY) === "1";
    } catch {
      // private mode / disabled — treat as not-complete; worst case the
      // onboarding shows again, which is harmless.
      return false;
    }
  }

  /** Mark onboarding done so it never shows again. */
  export function markComplete(): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // quota / disabled — drop silently; the gate just isn't remembered.
    }
  }
}
