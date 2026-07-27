/**
 * GRIDA-SEC-005 — fixed post-exchange handoff; never a caller-chosen target.
 *
 * Fixed, contained landing surface after the same-origin PKCE exchange.
 *
 * The native entry controller observes this route, re-checks the authenticated
 * entry state, and chooses onboarding or the main app. Keep this page neutral:
 * it should only be visible for the brief handoff between those two steps.
 */
export default function DesktopAuthCompletePage() {
  return (
    <main
      aria-label="Completing sign in"
      className="min-h-screen bg-background"
    />
  );
}
