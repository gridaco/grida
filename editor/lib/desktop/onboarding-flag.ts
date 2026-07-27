"use client";

/**
 * First-run ChatGPT onboarding completion flag.
 *
 * The dedicated desktop onboarding route mirrors native completion in
 * `localStorage`. The native host owns the launch-time first-run decision; this
 * renderer flag lets a new host migrate users who completed the former Welcome
 * dialog without replaying the flow.
 *
 * Keep the v1 key stable: it is the compatibility seam between the old dialog
 * and the controller-owned onboarding surface.
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
