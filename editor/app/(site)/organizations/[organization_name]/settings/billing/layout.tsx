// Receives the `@modal` parallel slot for intercepting routes
// (e.g. /settings/billing/upgrade → opens as a Dialog overlay when navigated
// in-app). The shared sidebar comes from `../layout.tsx` (SettingsShell).
export default function BillingLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
