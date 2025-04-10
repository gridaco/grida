import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Portal",
};

export default function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
