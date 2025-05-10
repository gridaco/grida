import { FingerprintProvider } from "@/components/fingerprint";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <>{children}</>
      <FingerprintProvider />
    </>
  );
}
