import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Grida Forms Playground",
  description: "A playground for generating form schemas",
};

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
