/**
 * GRIDA-SEC-005 — fixed legacy onboarding migration surface.
 *
 * Fixed, hidden same-origin surface for the one-time Desktop 0.0.13
 * onboarding migration.
 *
 * Electron main loads this page before choosing an authenticated entry role,
 * reads one legacy localStorage boolean with fixed native JavaScript, persists
 * the result in native Desktop preferences, and immediately navigates away.
 * This page owns no migration logic or native capability.
 */
export default function DesktopOnboardingMigrationPage() {
  return <main aria-hidden="true" className="min-h-screen bg-background" />;
}
